import { app, BrowserWindow, ipcMain, Notification, shell, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import creds from './credentials.json' with { type: 'json' };
import { PythonShell } from 'python-shell';
import csv from 'csv-parser';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// if (process.platform === 'win32') {
//   if (require('electron-squirrel-startup')) {
//     app.quit();
//   }
// }

const SPREADSHEET_ID = '1x4AmlaQGgdqHLEHKo_jZlGvyq9XsHigz6r6qGHFll0o';

function formatDateToYYYYMMDD(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Fungsi utama untuk generate ID baru
async function generateNewCustomerId(purchaseDate) {
  const { customerSheet } = await getSheets();
  const rows = await customerSheet.getRows();
  const datePart = formatDateToYYYYMMDD(purchaseDate); // e.g., "20250821"
  const idPrefix = `CUST-${datePart}`; // e.g., "CUST-20250821"

  // Cari semua ID yang dibuat pada hari yang sama
  const sameDayIds = rows
    .map(r => r.get('CustomerID'))
    .filter(id => id && id.startsWith(idPrefix));

  let nextSequence = 1;
  if (sameDayIds.length > 0) {
    // Jika sudah ada ID di hari ini, cari nomor urut terakhir
    const lastSequences = sameDayIds.map(id => parseInt(id.slice(-5), 10));
    nextSequence = Math.max(...lastSequences) + 1;
  }

  const sequencePart = String(nextSequence).padStart(5, '0'); // e.g., "00001"
  return `${idPrefix}${sequencePart}`; // e.g., "CUST-2025082100001"
}

async function getSheets() {
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
  await doc.loadInfo();
  const customerSheet = doc.sheetsByTitle['Customers'];
  const serviceSheet = doc.sheetsByTitle['Services'];
  if (!customerSheet || !serviceSheet) {
    throw new Error("Pastikan sheet 'Customers' dan 'Services' ada dan sudah di-share.");
  }
  return { doc, customerSheet, serviceSheet };
}

async function getDataFromSheets() {
  const { customerSheet, serviceSheet } = await getSheets();
  const customerRows = await customerSheet.getRows();
  const serviceRows = await serviceSheet.getRows();

  const customersMap = new Map();
  customerRows.forEach(row => {
    customersMap.set(row.get('CustomerID'), {
      name: row.get('Nama'),
      address: row.get('Alamat'),
      phone: row.get('No Telp'),
    });
  });

  const serviceGroups = {};
  serviceRows.forEach(row => {
    const customerID = row.get('CustomerID');
    if (!serviceGroups[customerID]) {
      serviceGroups[customerID] = [];
    }
    serviceGroups[customerID].push({
      serviceID: row.get('ServiceID'),
      customerID: row.get('CustomerID'),
      serviceDate: row.get('ServiceDate'),
      status: row.get('Status'),
      notes: row.get('Notes'),
      handler: row.get('Handler'),
    });
  });

  const combinedData = [];
  for (const customerID in serviceGroups) {
    const customerServices = serviceGroups[customerID];
    const customerInfo = customersMap.get(customerID) || {};

    const upcomingServices = customerServices
      .filter(s => s.status !== 'COMPLETED')
      .sort((a, b) => new Date(a.serviceDate) - new Date(b.serviceDate));

    let representativeService = upcomingServices.length > 0
      ? upcomingServices[0]
      : customerServices.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate))[0];

    if (representativeService) {
      combinedData.push({
        ...customerInfo,
        ...representativeService,
        services: customerServices.map(s => ({
          serviceID: s.serviceID,
          date: s.serviceDate,
          notes: s.notes,
          handler: s.handler,
          status: s.status
        })),
        nextService: upcomingServices.length > 0 ? representativeService.serviceDate : null,
      });
    }
  }
  return combinedData;
}

async function getFlatDataForExport() {
  const { customerSheet, serviceSheet } = await getSheets();
  const customerRows = await customerSheet.getRows();
  const serviceRows = await serviceSheet.getRows();

  // Buat map informasi pelanggan agar mudah dicari
  const customersMap = new Map();
  customerRows.forEach(row => {
    customersMap.set(row.get('CustomerID'), {
      customerID: row.get('CustomerID'),
      name: row.get('Nama'),
      address: row.get('Alamat'),
      phone: row.get('No Telp'),
    });
  });

  const flatData = [];
  // Loop melalui setiap baris servis
  serviceRows.forEach(row => {
    const customerID = row.get('CustomerID');
    const customerInfo = customersMap.get(customerID);

    // Jika info pelanggan ada, gabungkan dengan info servis
    if (customerInfo) {
      flatData.push({
        ...customerInfo, // { customerID, name, address, phone }
        serviceID: row.get('ServiceID'),
        serviceDate: row.get('ServiceDate'),
        status: row.get('Status'),
        notes: row.get('Notes'),
        handler: row.get('Handler'),
      });
    }
  });

  return flatData;
}

async function checkUpcomingServices() {
  if (!Notification.isSupported()) {
    console.log('Sistem notifikasi tidak didukung pada OS ini.');
    return;
  }

  try {
    const data = await getDataFromSheets();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log('Memeriksa jadwal untuk notifikasi...');

    data.forEach(customer => {
      if (customer.nextService && customer.status === 'UPCOMING') {
        const parts = customer.nextService.split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const nextServiceDate = new Date(year, month, day);
          nextServiceDate.setHours(0, 0, 0, 0);

          const timeDiff = nextServiceDate.getTime() - today.getTime();
          const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

          if (daysDiff >= 0 && daysDiff <= 3) {
            let bodyMessage = `Jadwal servis untuk ${customer.name} jatuh tempo dalam ${daysDiff} hari lagi (${nextServiceDate.toLocaleDateString('id-ID')}).`;
            if (daysDiff === 0) {
              bodyMessage = `Jadwal servis untuk ${customer.name} jatuh tempo HARI INI (${nextServiceDate.toLocaleDateString('id-ID')}).`;
            }

            console.log(`MENGIRIM NOTIFIKASI untuk ${customer.name}`);
            new Notification({
              title: 'Pengingat Jadwal Servis',
              body: bodyMessage
            }).show();
          }
        }
      }
    });
  } catch (error) {
    console.error('Gagal memeriksa jadwal untuk notifikasi:', error);
  }
}

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

    if (newStatus === 'CONTACTED') {
      rowToUpdate.set('Status', 'COMPLETED');
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();

      const nextServiceDate = new Date();
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 6);
      await serviceSheet.addRow({
        ServiceID: `SVC-${Date.now()}`,
        CustomerID: rowToUpdate.get('CustomerID'),
        ServiceDate: nextServiceDate.toISOString().split('T')[0],
        Status: 'UPCOMING',
        Notes: 'Jadwal servis rutin berikutnya',
        Handler: rowToUpdate.get('Handler'),
      });
    } else if (newStatus === 'OVERDUE') {
      const nextAttemptDate = new Date();
      nextAttemptDate.setDate(nextAttemptDate.getDate() + 7);
      rowToUpdate.set('Status', 'OVERDUE');
      rowToUpdate.set('ServiceDate', nextAttemptDate.toISOString().split('T')[0]);
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();
    } else {
      rowToUpdate.set('Status', newStatus);
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();
    }
    return { success: true };
  } catch (error) {
    console.error('Error updating status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-history-note', async (event, { serviceID, newNotes, newHandler }) => {
  try {
    const { serviceSheet } = await getSheets();
    const rows = await serviceSheet.getRows();
    const rowToUpdate = rows.find(r => r.get('ServiceID') === serviceID);
    if (!rowToUpdate) {
      throw new Error('Catatan riwayat servis tidak ditemukan.');
    }
    rowToUpdate.set('Notes', newNotes);
    rowToUpdate.set('Handler', newHandler);
    await rowToUpdate.save();
    return { success: true };
  } catch (error) {
    console.error('Gagal memperbarui catatan riwayat:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-service', async (event, { serviceID, newDate, newHandler }) => {
  try {
    const { serviceSheet } = await getSheets();
    const rows = await serviceSheet.getRows();
    const rowToUpdate = rows.find(r => r.get('ServiceID') === serviceID);

    if (!rowToUpdate) {
      throw new Error('Service record not found.');
    }

    rowToUpdate.set('ServiceDate', newDate);
    rowToUpdate.set('Handler', newHandler);
    await rowToUpdate.save();

    return { success: true };
  } catch (error) {
    console.error('Error updating service:', error);
    return { success: false, error: error.message };
  }
});


ipcMain.handle('add-customer', async (event, customerData) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets();

    // Gunakan tanggal servis pertama sebagai tanggal pembelian
    const purchaseDate = customerData.nextService || new Date();

    // Panggil fungsi generator ID baru kita
    const newCustomerId = await generateNewCustomerId(purchaseDate);
    const newServiceId = `SVC-${newCustomerId.split('-')[1]}`; // Service ID mengikuti format Customer ID

    await customerSheet.addRow({
      CustomerID: newCustomerId,
      Nama: customerData.name,
      Alamat: customerData.address,
      'No Telp': customerData.phone,
    });

    if (customerData.nextService) {
      await serviceSheet.addRow({
        ServiceID: newServiceId,
        CustomerID: newCustomerId,
        ServiceDate: customerData.nextService,
        Status: 'UPCOMING',
        Handler: customerData.handler,
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

// Di dalam file: main.js

ipcMain.handle('delete-customer', async (event, customerID) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets();

    // --- Proses Penghapusan Pelanggan ---
    const customerRows = await customerSheet.getRows();
    let customerFoundAndDeleted = false;
    for (const row of customerRows) {
      if (row.get('CustomerID') === customerID) {
        await row.delete();
        customerFoundAndDeleted = true;
        break; // Keluar dari loop setelah menemukan dan menghapus
      }
    }

    // Memberi peringatan jika pelanggan tidak ditemukan, tapi tetap melanjutkan
    // Ini untuk menangani kasus jika data pelanggan sudah dihapus manual
    if (!customerFoundAndDeleted) {
      console.warn(`Peringatan: Pelanggan dengan ID ${customerID} tidak ditemukan, tetapi tetap melanjutkan menghapus data servis terkait.`);
    }

    // --- Proses Penghapusan Servis ---
    const serviceRows = await serviceSheet.getRows();
    const servicesToDelete = serviceRows.filter(r => r.get('CustomerID') === customerID);

    // Menggunakan Promise.all untuk efisiensi, menghapus beberapa baris secara paralel
    if (servicesToDelete.length > 0) {
      await Promise.all(servicesToDelete.map(row => row.delete()));
    }

    return { success: true };
  } catch (error) {
    // Memberi log error yang lebih jelas di terminal
    console.error('Operasi penghapusan gagal:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-whatsapp', (event, phone) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  shell.openExternal(`https://wa.me/${cleanPhone}`);
});

ipcMain.handle('export-data', async () => {
  const saveDialogResult = await dialog.showSaveDialog({
    title: 'Pilih Lokasi dan Nama File Ekspor',
    // Default nama file tanpa ekstensi
    defaultPath: `export-data-pelanggan-${new Date().toISOString().split('T')[0]}`,
    filters: [
      // Filter ini hanya untuk tampilan, kita akan mengabaikan ekstensinya di kode
      { name: 'Excel Files', extensions: ['xlsx'] },
      { name: 'CSV Files', extensions: ['csv'] },
    ]
  });

  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    return { success: false, error: 'Proses ekspor dibatalkan.' };
  }

  // ====================== PERUBAHAN DI SINI ======================
  // Kita akan menghapus ekstensi dari path yang dipilih pengguna,
  // agar Python bisa menambahkan .csv dan .xlsx sendiri.
  const fullPath = saveDialogResult.filePath;
  const parsedPath = path.parse(fullPath);
  // Gabungkan kembali direktori dan nama dasar file (tanpa ekstensi)
  const basePath = path.join(parsedPath.dir, parsedPath.name);
  // =============================================================

  try {
    const dataFromSheets = await getFlatDataForExport();
    const dataString = JSON.stringify(dataFromSheets);

    const isPackaged = app.isPackaged;
    const scriptResourcePath = isPackaged
      ? path.join(process.resourcesPath, 'scripts')
      : path.join(__dirname, '..', '..', 'scripts');

    const options = {
      mode: 'text',
      pythonPath: 'python3',
      scriptPath: scriptResourcePath,
      // Kirim data JSON dan path dasar (tanpa ekstensi) sebagai argumen
      args: [dataString, basePath]
    };

    const results = await PythonShell.run('export_data.py', options);
    const message = results ? results[0] : '';

    if (message.startsWith('SUCCESS')) {
      // Beri tahu pengguna bahwa DUA file telah dibuat
      return { success: true, path: `${basePath}.xlsx dan .csv` };
    } else {
      throw new Error(message.replace('ERROR: ', ''));
    }
  } catch (err) {
    console.error('Gagal menjalankan proses ekspor:', err);
    return { success: false, error: err.message || 'Terjadi kesalahan tidak diketahui saat ekspor.' };
  }
});

// Di dalam file: main.js

ipcMain.handle('import-data', async () => {
  // Variabel path file sementara didefinisikan di sini agar bisa diakses di blok finally
  const tempDir = app.getPath('userData');
  const customersPath = path.join(tempDir, 'customers_to_import.csv');
  const servicesPath = path.join(tempDir, 'services_to_import.csv');

  try {
    // 1. Minta pengguna memilih file
    const openDialogResult = await dialog.showOpenDialog({
      title: 'Pilih File untuk Diimpor',
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheet Files', extensions: ['xlsx', 'csv'] }
      ]
    });

    if (openDialogResult.canceled || !openDialogResult.filePaths[0]) {
      return { success: false, error: 'Proses impor dibatalkan.' };
    }
    const inputFile = openDialogResult.filePaths[0];

    // 2. Jalankan skrip Python
    const pyOptions = {
      mode: 'text',
      pythonPath: 'python3',
      scriptPath: path.join(__dirname, '..', '..', 'scripts'),
      args: [inputFile, tempDir]
    };

    // Jika PythonShell.run gagal, ia akan melempar error dan langsung ditangkap oleh blok 'catch'
    await PythonShell.run('import_data.py', pyOptions);

    // Jika kode sampai di sini, berarti skrip Python berhasil dan file sementara sudah dibuat.
    // 3. Lanjutkan membaca file sementara dan mengunggah ke Google Sheets
    const customersToImport = [];
    const servicesToImport = [];

    await new Promise((resolve, reject) => fs.createReadStream(customersPath).pipe(csv()).on('data', (row) => customersToImport.push(row)).on('end', resolve).on('error', reject));
    await new Promise((resolve, reject) => fs.createReadStream(servicesPath).pipe(csv()).on('data', (row) => servicesToImport.push(row)).on('end', resolve).on('error', reject));

    // ... (sisa logika untuk generate ID dan upload ke Google Sheets tidak berubah)
    const { customerSheet, serviceSheet } = await getSheets();
    const existingRows = await customerSheet.getRows();
    const existingIds = existingRows.map(r => r.get('CustomerID'));
    const latestSequenceForDay = new Map();
    existingIds.forEach(id => {
      if (id && id.startsWith('CUST-')) {
        const datePart = id.substring(5, 13);
        const seqPart = parseInt(id.slice(-5), 10);
        const currentMax = latestSequenceForDay.get(datePart) || 0;
        if (seqPart > currentMax) {
          latestSequenceForDay.set(datePart, seqPart);
        }
      }
    });
    const purchaseDates = new Map();
    servicesToImport.forEach(service => {
      if (!service.serviceDate) return;
      const existingDate = purchaseDates.get(service.name);
      const currentDate = new Date(service.serviceDate);
      if (!existingDate || currentDate < existingDate) {
        purchaseDates.set(service.name, currentDate);
      }
    });
    const newCustomerRows = customersToImport.map(c => {
      const purchaseDate = purchaseDates.get(c.name) || new Date();
      const datePart = formatDateToYYYYMMDD(purchaseDate);
      const nextSeq = (latestSequenceForDay.get(datePart) || 0) + 1;
      latestSequenceForDay.set(datePart, nextSeq);
      const newId = `CUST-${datePart}${String(nextSeq).padStart(5, '0')}`;
      return {
        CustomerID: newId,
        Nama: c.name,
        Alamat: c.address,
        'No Telp': c.phone,
      };
    });
    await customerSheet.addRows(newCustomerRows);
    const customerMap = new Map(newCustomerRows.map(c => [c.Nama, c.CustomerID]));
    const newServiceRows = servicesToImport.map(s => {
      const customerId = customerMap.get(s.name);
      if (!customerId) return null;
      const serviceId = `SVC-${customerId.split('-')[1]}`;
      return {
        ServiceID: serviceId,
        CustomerID: customerId,
        ServiceDate: s.serviceDate,
        Status: 'UPCOMING',
        Notes: s.notes || '',
      };
    }).filter(Boolean);
    if (newServiceRows.length > 0) {
      await serviceSheet.addRows(newServiceRows);
    }

    return { success: true, message: `Berhasil mengimpor ${customersToImport.length} pelanggan dan ${servicesToImport.length} data servis.` };

  } catch (error) {
    // Blok ini sekarang akan menangkap SEMUA error, termasuk dari Python
    console.error('Gagal melakukan impor:', error);
    return { success: false, error: error.message };
  } finally {
    // Selalu hapus file sementara jika ada, baik proses berhasil maupun gagal
    if (fs.existsSync(customersPath)) fs.unlinkSync(customersPath);
    if (fs.existsSync(servicesPath)) fs.unlinkSync(servicesPath);
  }
});

app.whenReady().then(() => {
  createWindow();
  checkUpcomingServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
