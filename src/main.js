import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import creds from './credentials.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// if (process.platform === 'win32') {
//   if (require('electron-squirrel-startup')) {
//     app.quit();
//   }
// }

const SPREADSHEET_ID = '1x4AmlaQGgdqHLEHKo_jZlGvyq9XsHigz6r6qGHFll0o';

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

ipcMain.handle('delete-customer', async (event, customerID) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets();
    const customerRows = await customerSheet.getRows();
    const serviceRows = await serviceSheet.getRows();

    const rowToDelete = customerRows.find(r => r.get('CustomerID') === customerID);
    if (rowToDelete) await rowToDelete.delete();
    else throw new Error('Customer not found for deletion.');

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
