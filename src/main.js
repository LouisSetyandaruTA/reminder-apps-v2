import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import creds from './credentials.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (require('electron-squirrel-startup')) {
  app.quit();
}

const SPREADSHEET_ID = '1x4AmlaQGgdqHLEHKo_jZlGvyq9XsHigz6r6qGHFll0o'; // GANTI DENGAN ID ANDA

// --- FUNGSI LOGIKA GOOGLE SHEETS ---
async function getSheets() {
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
  await doc.loadInfo();
  console.log('Koneksi Berhasil. Judul:', doc.title);
  const customerSheet = doc.sheetsByTitle['Customers'];
  const serviceSheet = doc.sheetsByTitle['Services'];
  if (!customerSheet || !serviceSheet) {
    throw new Error("Pastikan sheet 'Customers' dan 'Services' ada dan sudah di-share.");
  }
  return { doc, customerSheet, serviceSheet };
}

// Di dalam src/main.js

async function getDataFromSheets() {
  try {
    console.log('MAIN: Memulai koneksi ke Google Sheets...');
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);

    console.log('MAIN: Mengautentikasi dan memuat info spreadsheet...');
    await doc.loadInfo();
    console.log('✅ MAIN: Info spreadsheet berhasil dimuat. Judul:', doc.title);
    console.log('SHEETS DITEMUKAN:', Object.keys(doc.sheetsByTitle)); // Log ini sangat penting

    const customerSheet = doc.sheetsByTitle['Customers'];
    const serviceSheet = doc.sheetsByTitle['Services'];

    if (!customerSheet) {
      throw new Error("Sheet 'Customers' tidak ditemukan. Pastikan nama tab sama persis dan sudah di-share.");
    }
    if (!serviceSheet) {
      throw new Error("Sheet 'Services' tidak ditemukan. Pastikan nama tab sama persis dan sudah di-share.");
    }
    console.log('✅ MAIN: Sheet "Customers" dan "Services" berhasil ditemukan.');

    console.log('MAIN: Mengambil baris dari "Customers"...');
    const customerRows = await customerSheet.getRows();
    console.log(`✅ MAIN: Berhasil mengambil ${customerRows.length} baris dari "Customers".`);

    console.log('MAIN: Mengambil baris dari "Services"...');
    const serviceRows = await serviceSheet.getRows();
    console.log(`✅ MAIN: Berhasil mengambil ${serviceRows.length} baris dari "Services".`);

    // ... sisa fungsi Anda untuk memproses data ...
    const customersMap = new Map();
    customerRows.forEach(row => {
      // Pastikan nama header di sini sama persis dengan di sheet Anda
      customersMap.set(row.get('CustomerID'), {
        name: row.get('Nama'),
        address: row.get('Alamat'),
        phone: row.get('No Telp'),
      });
    });

    const services = serviceRows.map(row => {
      const customerInfo = customersMap.get(row.get('CustomerID')) || {};
      return {
        serviceID: row.get('ServiceID'),
        customerID: row.get('CustomerID'),
        serviceDate: row.get('ServiceDate'),
        status: row.get('Status'),
        notes: row.get('Notes'),
        handler: row.get('Handler'),
        ...customerInfo,
      };
    });
    console.log('✅ MAIN: Data berhasil diproses.');
    return services;

  } catch (error) {
    // Log ini akan menampilkan error yang lebih detail di terminal
    console.error('❌ MAIN: Terjadi error spesifik di getDataFromSheets:', error);
    throw error; // Lemparkan kembali error agar bisa ditangkap oleh handler IPC
  }
}

// --- FUNGSI LOGIKA NOTIFIKASI ---
async function checkAndSendReminders() {
  console.log('Checking for reminders...');
  const services = await getDataFromSheets();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const service of services) {
    if (!service.serviceDate || service.status === 'COMPLETED' || service.status === 'CONTACTED') continue;
    const serviceDate = new Date(service.serviceDate);
    if (isNaN(serviceDate.getTime())) continue;
    serviceDate.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((serviceDate - today) / (1000 * 60 * 60 * 24));

    if (daysDiff >= 0 && daysDiff <= 3) {
      new Notification({
        title: `Pengingat Servis: ${service.name}`,
        body: `Jadwal servis untuk ${service.name} adalah ${daysDiff === 0 ? 'hari ini' : `dalam ${daysDiff} hari`}.`,
      }).show();
    }
  }
}

// --- FUNGSI JENDELA ---
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  if (!app.isPackaged) mainWindow.webContents.openDevTools();
};

// --- HANDLER UNTUK PERMINTAAN DARI UI ---
ipcMain.handle('refresh-data', async () => {
  try {
    const data = await getDataFromSheets();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-contact-status', async (event, { serviceID, newStatus, notes }) => {
  try {
    const { serviceSheet } = await getSheets();
    const rows = await serviceSheet.getRows();
    const rowToUpdate = rows.find(r => r.get('ServiceID') === serviceID);
    if (!rowToUpdate) throw new Error('Service record not found.');

    rowToUpdate.set('Status', newStatus);
    rowToUpdate.set('Notes', notes);

    if (newStatus === 'CONTACTED') {
      const nextServiceDate = new Date();
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 6);
      await serviceSheet.addRow({
        ServiceID: `SVC-${Date.now()}`,
        CustomerID: rowToUpdate.get('CustomerID'),
        ServiceDate: nextServiceDate.toISOString().split('T')[0],
        Status: 'UPCOMING',
        Notes: 'Jadwal servis rutin berikutnya',
      });
      rowToUpdate.set('Status', 'COMPLETED');
    } else if (newStatus === 'OVERDUE') {
      const nextAttemptDate = new Date();
      nextAttemptDate.setDate(nextAttemptDate.getDate() + 7);
      rowToUpdate.set('ServiceDate', nextAttemptDate.toISOString().split('T')[0]);
    }
    await rowToUpdate.save();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-customer', async (event, customerData) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets();
    const newCustomerId = `CUST-${Date.now()}`;
    await customerSheet.addRow({
      CustomerID: newCustomerId,
      Nama: customerData.name,
      Alamat: customerData.address,
      'No Telp': customerData.phone,
    });
    if (customerData.nextService) {
      await serviceSheet.addRow({
        ServiceID: `SVC-${Date.now()}`,
        CustomerID: newCustomerId,
        ServiceDate: customerData.nextService,
        Status: 'UPCOMING',
      });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-customer', async (event, { customerID, updatedData }) => {
  try {
    const { customerSheet } = await getSheets();
    const rows = await customerSheet.getRows();
    const rowToUpdate = rows.find(r => r.get('CustomerID') === customerID);
    if (!rowToUpdate) throw new Error('Customer not found.');

    rowToUpdate.set('Nama', updatedData.name);
    rowToUpdate.set('Alamat', updatedData.address);
    rowToUpdate.set('No Telp', updatedData.phone);
    await rowToUpdate.save();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-customer', async (event, customerID) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets();
    const customerRows = await customerSheet.getRows();
    const serviceRows = await serviceSheet.getRows();

    const rowToDelete = customerRows.find(r => r.get('CustomerID') === customerID);
    if (rowToDelete) {
      await rowToDelete.delete();
    } else {
      throw new Error('Customer not found for deletion.');
    }

    const servicesToDelete = serviceRows.filter(r => r.get('CustomerID') === customerID);
    for (const serviceRow of servicesToDelete) {
      await serviceRow.delete();
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-whatsapp', (event, phone) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  shell.openExternal(`https://wa.me/${cleanPhone}`);
});

// --- SIKLUS HIDUP APLIKASI ---
app.whenReady().then(() => {
  createWindow();
  checkAndSendReminders();
  setInterval(checkAndSendReminders, 3600000); // Cek setiap jam
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
