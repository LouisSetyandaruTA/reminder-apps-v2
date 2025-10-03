import { app, BrowserWindow, ipcMain, Notification, shell, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import creds from './credentials.json' with { type: 'json' };
import { PythonShell } from 'python-shell';
import csv from 'csv-parser';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(app.getPath('userData'), 'databases.json');
const cachePath = path.join(app.getPath('userData'), 'customer_cache.json');

if (process.platform === 'win32') {
  app.setAppUserModelId('UbinKayu Reminder');
}

// --- PENGELOLAAN DATABASE (JSON) ---
function readDatabases() {
  try {
    if (fs.existsSync(dbPath)) {
      return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    }
    return [];
  } catch (error) {
    console.error('Gagal membaca file database:', error);
    return [];
  }
}

function writeDatabases(databases) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, JSON.stringify(databases, null, 2), 'utf-8');
}

// --- FUNGSI MANAJEMEN CACHE (JSON) ---
function readCache(spreadsheetId) {
  if (fs.existsSync(cachePath)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (cache.spreadsheetId === spreadsheetId) {
        return cache.data;
      }
    } catch (error) {
      console.error('Gagal membaca atau parse cache:', error);
    }
  }
  return null;
}

function writeCache(spreadsheetId, data) {
  try {
    const cache = {
      spreadsheetId: spreadsheetId,
      lastUpdated: new Date().toISOString(),
      data: data
    };
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('Gagal menulis cache:', error);
  }
}

function clearCache() {
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    console.log('Cache dibersihkan.');
  }
}

// --- Helper Functions ---
/**
 * @param {string} city
 * @returns {string}
 */
function formatCityName(city) {
  if (!city || typeof city !== 'string') return '';
  const trimmedCity = city.trim();
  if (!trimmedCity) return '';
  return trimmedCity.charAt(0).toUpperCase() + trimmedCity.slice(1).toLowerCase();
}

function normalizeCustomerName(name) {
  if (!name || typeof name !== 'string') return '';

  const titles = ['bapak', 'bpk', 'bp', 'ibu', 'bu', 'pak', 'mrs', 'mr', 'miss', 'dr', 'drs', 'drg', 'ir', 'prof'];
  const titleRegex = new RegExp(`^(${titles.join('|')})\\.?\\s+`, 'i');
  let cleanedName = name.trim().replace(titleRegex, '');

  return cleanedName
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDateToYYYYMMDD(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function normalizeName(name = '') { return name.toLowerCase().trim(); }
function normalizeAddress(address = '') { return address.toLowerCase().trim(); }
function normalizePhone(phone = '') {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? '62' + digits.substring(1) : digits;
}

async function getSheets(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID tidak ditemukan atau tidak valid.');
  }

  try {
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(spreadsheetId, auth);
    await doc.loadInfo();

    const customerSheet = doc.sheetsByTitle['Customers'];
    const serviceSheet = doc.sheetsByTitle['Services'];

    if (!customerSheet) {
      throw new Error("Sheet 'Customers' tidak ditemukan. Pastikan nama sheet tepat 'Customers'");
    }

    if (!serviceSheet) {
      throw new Error("Sheet 'Services' tidak ditemukan. Pastikan nama sheet tepat 'Services'");
    }

    return { doc, customerSheet, serviceSheet };
  } catch (error) {
    console.error('Error accessing Google Sheets:', error);
    if (error.response?.status === 404 || error.message.includes('404')) {
      throw new Error(`Spreadsheet tidak ditemukan. Pastikan ID benar dan spreadsheet di-share dengan: ${creds.client_email}`);
    }
    throw error;
  }
}

async function getNextGlobalSequence(spreadsheetId) {
  const { customerSheet } = await getSheets(spreadsheetId);
  const rows = await customerSheet.getRows();
  const allIds = rows.map(r => r.get('CustomerID'));

  let maxSequence = 0;
  allIds.forEach(id => {
    if (id && id.startsWith('CUST-') && id.length >= 18) {
      const seqPart = parseInt(id.slice(-5), 10);
      if (!isNaN(seqPart) && seqPart > maxSequence) {
        maxSequence = seqPart;
      }
    }
  });
  return maxSequence + 1;
}

async function generateNewServiceId(spreadsheetId, serviceDate) {
  const { serviceSheet } = await getSheets(spreadsheetId);
  const rows = await serviceSheet.getRows();
  const datePart = formatDateToYYYYMMDD(serviceDate);
  const idPrefix = `SVC-${datePart}`;
  const sameDayIds = rows
    .map(r => r.get('ServiceID'))
    .filter(id => id && id.startsWith(idPrefix));
  let nextSequence = 1;
  if (sameDayIds.length > 0) {
    const lastSequences = sameDayIds.map(id => parseInt(id.slice(-5), 10));
    nextSequence = Math.max(...lastSequences) + 1;
  }
  const sequencePart = String(nextSequence).padStart(5, '0');
  return `${idPrefix}${sequencePart}`;
}

// --- Data Fetching Functions ---
async function getDataFromSheets(spreadsheetId) {
  const cachedData = readCache(spreadsheetId);
  if (cachedData) {
    console.log(`Menggunakan cache untuk spreadsheet ${spreadsheetId}`);
    return cachedData;
  }

  const { customerSheet, serviceSheet } = await getSheets(spreadsheetId);
  const customerRows = await customerSheet.getRows();
  const serviceRows = await serviceSheet.getRows();

  const customersMap = new Map();
  customerRows.forEach(row => {
    customersMap.set(row.get('CustomerID'), {
      customerID: row.get('CustomerID'),
      name: row.get('Nama'),
      address: row.get('Alamat'),
      phone: row.get('No Telp'),
      kota: formatCityName(row.get('Kota')),
      pemasangan: row.get('Pemasangan'),
      customerNotes: row.get('Notes Pelanggan'),
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

  writeCache(spreadsheetId, combinedData);
  return combinedData;
}

async function getFlatDataForExport(spreadsheetId) {
  const { customerSheet, serviceSheet } = await getSheets(spreadsheetId);
  const customerRows = await customerSheet.getRows();
  const serviceRows = await serviceSheet.getRows();

  const customersMap = new Map();
  customerRows.forEach(row => {
    customersMap.set(row.get('CustomerID'), {
      customerID: row.get('CustomerID'),
      name: row.get('Nama') || '',
      address: row.get('Alamat') || '',
      phone: row.get('No Telp') || '',
      kota: formatCityName(row.get('Kota') || ''),
      Pemasangan: row.get('Pemasangan') || '',
      customerNotes: row.get('Notes Pelanggan') || '',
    });
  });

  const flatData = serviceRows.map(row => {
    const customerID = row.get('CustomerID');
    const customerInfo = customersMap.get(customerID) || {};
    return {
      ...customerInfo,
      serviceID: row.get('ServiceID'),
      serviceDate: row.get('ServiceDate'),
      status: row.get('Status'),
      notes: row.get('Notes') || '',
      handler: row.get('Handler') || '',
    };
  });

  return flatData;
}

// --- FUNGSI NOTIFIKASI ---
async function checkUpcomingServices() {
  if (!Notification.isSupported()) {
    console.log('Sistem notifikasi tidak didukung pada OS ini.');
    return;
  }
  console.log('Memeriksa jadwal untuk notifikasi...');

  const databases = readDatabases();
  if (databases.length === 0) {
    console.log('Tidak ada database yang dikonfigurasi, notifikasi dilewati.');
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const db of databases) {
    console.log(`Mengecek database: ${db.name}...`);

    let allUpcomingServices = [];
    let allOverdueServices = [];
    let allContactOverdue = [];

    try {
      const data = await getDataFromSheets(db.id);

      data.forEach(customer => {
        if (customer.nextService && customer.status === 'UPCOMING') {
          const nextServiceDate = new Date(customer.nextService);
          nextServiceDate.setHours(0, 0, 0, 0);
          if (isNaN(nextServiceDate.getTime())) return;

          const timeDiff = nextServiceDate.getTime() - today.getTime();
          const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

          if (daysDiff >= 0 && daysDiff <= 3) {
            allUpcomingServices.push({ name: customer.name, days: daysDiff });
          } else if (daysDiff < 0) {
            allOverdueServices.push({ name: customer.name });
          }
        }
        if (customer.status === 'OVERDUE') {
          allContactOverdue.push({ name: customer.name });
        }
      });

      const upcomingGroups = {};
      allUpcomingServices.forEach(s => {
        if (!upcomingGroups[s.days]) upcomingGroups[s.days] = [];
        upcomingGroups[s.days].push(s.name);
      });

      for (const days in upcomingGroups) {
        const customerCount = upcomingGroups[days].length;
        if (customerCount === 0) continue;

        let timeText = (days === '0') ? 'HARI INI' : (days === '1' ? 'BESOK' : `dalam ${days} hari`);
        const bodyMessage = `Ada ${customerCount} pelanggan dengan jadwal servis ${timeText}.`;

        new Notification({
          title: `[${db.name}] Pengingat Jadwal Servis`,
          body: bodyMessage
        }).show();
      }

      if (allOverdueServices.length > 0) {
        const bodyMessage = `Perhatian, ada ${allOverdueServices.length} pelanggan yang jadwal servisnya terlewat.`;
        new Notification({
          title: `[${db.name}] Jadwal Servis Terlewat!`,
          body: bodyMessage
        }).show();
      }

      if (allContactOverdue.length > 0) {
        const bodyMessage = `Ada ${allContactOverdue.length} pelanggan berstatus "tidak bisa dihubungi".`;
        new Notification({
          title: `[${db.name}] Kontak Perlu Follow Up`,
          body: bodyMessage
        }).show();
      }

    } catch (error) {
      console.error(`Gagal memeriksa notifikasi untuk database '${db.name}':`, error.message);
      new Notification({
        title: `[${db.name}] Gagal Memeriksa Jadwal`,
        body: `Tidak bisa mengambil data. Periksa koneksi atau setelan Google Sheet.`
      }).show();
    }
  }
}

// --- Main Window & App Lifecycle ---
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

const createReminderWindow = (sheetId, sheetName) => {
  const reminderWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    title: `Reminder - ${sheetName}`
  });

  if (REMINDER_WINDOW_VITE_DEV_SERVER_URL) {
    reminderWindow.loadURL(REMINDER_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    reminderWindow.loadFile(path.join(__dirname, `../renderer/${REMINDER_WINDOW_VITE_NAME}/reminder.html`));
  }

  reminderWindow.webContents.once('did-finish-load', () => {
    reminderWindow.webContents.send('load-sheet', { id: sheetId, name: sheetName });
  });
};

app.whenReady().then(() => {
  createWindow();

  checkUpcomingServices();
  setInterval(checkUpcomingServices, 3600 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---
ipcMain.handle('get-databases', () => readDatabases());

ipcMain.handle('get-client-email', () => {
  return creds.client_email;
});

ipcMain.handle('add-database', (event, { name, id }) => {
  const dbs = readDatabases();
  dbs.push({ name, id });
  writeDatabases(dbs);
  return { success: true };
});

ipcMain.handle('delete-database', (event, id) => {
  let dbs = readDatabases();
  dbs = dbs.filter(db => db.id !== id);
  writeDatabases(dbs);
  return { success: true };
});

ipcMain.on('open-reminder-for-sheet', (event, { id, name }) => {
  createReminderWindow(id, name);
});

ipcMain.handle('refresh-data', async (event, spreadsheetId) => {
  try {
    clearCache();
    checkUpcomingServices();
    const data = await getDataFromSheets(spreadsheetId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-customer', async (event, { spreadsheetId, customerData }) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets(spreadsheetId);
    const installationDate = new Date(customerData.nextService);
    if (isNaN(installationDate.getTime())) {
      throw new Error('Tanggal pemasangan tidak valid.');
    }
    const installationDateString = installationDate.toISOString().split('T')[0];

    const datePart = formatDateToYYYYMMDD(installationDate);
    const nextSequence = await getNextGlobalSequence(spreadsheetId);
    const sequencePart = String(nextSequence).padStart(5, '0');
    const newCustomerId = `CUST-${datePart}${sequencePart}`;

    await customerSheet.addRow({
      CustomerID: newCustomerId,
      Nama: customerData.name,
      Alamat: customerData.address,
      'No Telp': normalizePhone(customerData.phone),
      Kota: formatCityName(customerData.kota),
      'Pemasangan': installationDateString,
      'Notes Pelanggan': customerData.customerNotes || '',
    });

    const installationServiceId = await generateNewServiceId(spreadsheetId, installationDate);
    await serviceSheet.addRow({
      ServiceID: installationServiceId,
      CustomerID: newCustomerId,
      ServiceDate: installationDateString,
      Status: 'COMPLETED',
      Handler: customerData.handler,
      Notes: 'Pemasangan Awal',
    });

    const reminderDate = new Date(installationDate);
    reminderDate.setMonth(reminderDate.getMonth() + 6);
    const reminderDateString = reminderDate.toISOString().split('T')[0];
    const reminderServiceId = await generateNewServiceId(spreadsheetId, reminderDate);
    await serviceSheet.addRow({
      ServiceID: reminderServiceId,
      CustomerID: newCustomerId,
      ServiceDate: reminderDateString,
      Status: 'UPCOMING',
      Handler: customerData.handler,
      Notes: 'Jadwal servis rutin berikutnya',
    });

    clearCache();
    checkUpcomingServices();
    return { success: true };
  } catch (error) {
    console.error('Gagal menambah pelanggan:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-contact-status', async (event, { spreadsheetId, serviceID, newStatus, notes, postponeDuration, refusalFollowUp }) => {
  try {
    const { serviceSheet } = await getSheets(spreadsheetId);
    const rows = await serviceSheet.getRows();

    const triggeredRow = rows.find(r => r.get('ServiceID') === serviceID);
    if (!triggeredRow) throw new Error('Service record pemicu tidak ditemukan.');
    const customerId = triggeredRow.get('CustomerID');
    const customerServices = rows.filter(r => r.get('CustomerID') === customerId);
    const upcomingServices = customerServices
      .filter(r => r.get('Status') === 'UPCOMING')
      .sort((a, b) => new Date(a.get('ServiceDate')) - new Date(b.get('ServiceDate')));

    let rowToUpdate = upcomingServices.length > 0 ? upcomingServices[0] : triggeredRow;

    if (newStatus === 'CONTACTED') {
      rowToUpdate.set('Status', 'COMPLETED');
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();

      const completedServiceDate = new Date(rowToUpdate.get('ServiceDate'));
      const nextServiceDate = new Date(completedServiceDate);
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 6);

      const nextServiceId = await generateNewServiceId(spreadsheetId, nextServiceDate);
      await serviceSheet.addRow({
        ServiceID: nextServiceId,
        CustomerID: customerId,
        ServiceDate: nextServiceDate.toISOString().split('T')[0],
        Status: 'UPCOMING',
        Notes: 'Jadwal servis rutin berikutnya',
        Handler: rowToUpdate.get('Handler'),
      });
    } else if (newStatus === 'OVERDUE') {
      rowToUpdate.set('Status', 'OVERDUE');
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();
    } else if (newStatus === 'POSTPONED') {
      const newDate = new Date();
      switch (postponeDuration) {
        case '1w': newDate.setDate(newDate.getDate() + 7); break;
        case '1m': newDate.setMonth(newDate.getMonth() + 1); break;
        case '3m': newDate.setMonth(newDate.getMonth() + 3); break;
        case '6m': newDate.setMonth(newDate.getMonth() + 6); break;
      }
      rowToUpdate.set('Status', 'UPCOMING');
      rowToUpdate.set('ServiceDate', newDate.toISOString().split('T')[0]);
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();
    } else if (newStatus === 'REFUSED') {
      if (upcomingServices.length === 0) {
        triggeredRow.set('Notes', notes);
        await triggeredRow.save();
        return { success: true };
      }
      const rowToModify = upcomingServices[0];
      if (refusalFollowUp === 'never') {
        await rowToModify.delete();
      } else {
        const newDate = new Date();
        if (refusalFollowUp === '1y') newDate.setFullYear(newDate.getFullYear() + 1);
        else if (refusalFollowUp === '2y') newDate.setFullYear(newDate.getFullYear() + 2);
        rowToModify.set('ServiceDate', newDate.toISOString().split('T')[0]);
        rowToModify.set('Notes', notes);
        rowToModify.set('Status', 'UPCOMING');
        await rowToModify.save();
      }
    } else {
      rowToUpdate.set('Status', newStatus);
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();
    }

    clearCache();
    checkUpcomingServices();
    return { success: true };
  } catch (error) {
    console.error('Error updating status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-history-note', async (event, { spreadsheetId, serviceID, newNotes, newHandler }) => {
  try {
    const { serviceSheet } = await getSheets(spreadsheetId);
    const rows = await serviceSheet.getRows();
    const rowToUpdate = rows.find(r => r.get('ServiceID') === serviceID);
    if (!rowToUpdate) throw new Error('Catatan riwayat servis tidak ditemukan.');
    rowToUpdate.set('Notes', newNotes);
    rowToUpdate.set('Handler', newHandler);
    await rowToUpdate.save();

    clearCache();
    checkUpcomingServices();
    return { success: true };
  } catch (error) {
    console.error('Gagal memperbarui catatan riwayat:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-service', async (event, { spreadsheetId, serviceID, newDate, newHandler }) => {
  try {
    const { serviceSheet } = await getSheets(spreadsheetId);
    const rows = await serviceSheet.getRows();
    const triggeredRow = rows.find(r => r.get('ServiceID') === serviceID);
    if (!triggeredRow) throw new Error('Service record pemicu tidak ditemukan.');

    const customerID = triggeredRow.get('CustomerID');
    const customerServices = rows.filter(r => r.get('CustomerID') === customerID);
    const upcomingServices = customerServices
      .filter(r => r.get('Status') === 'UPCOMING')
      .sort((a, b) => new Date(a.get('ServiceDate')) - new Date(b.get('ServiceDate')));

    if (upcomingServices.length === 0) {
      throw new Error('Tidak ada jadwal servis UPCOMING yang ditemukan untuk pelanggan ini.');
    }
    const rowToUpdate = upcomingServices[0];
    rowToUpdate.set('ServiceDate', newDate);
    rowToUpdate.set('Handler', newHandler);
    await rowToUpdate.save();

    clearCache();
    checkUpcomingServices();
    return { success: true };
  } catch (error) {
    console.error('Error updating service:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-customer', async (event, { spreadsheetId, customerID, updatedData }) => {
  try {
    const { customerSheet } = await getSheets(spreadsheetId);
    const rows = await customerSheet.getRows();
    const rowToUpdate = rows.find(r => r.get('CustomerID') === customerID);
    if (!rowToUpdate) throw new Error('Customer not found.');

    if (updatedData.name !== undefined) {
      rowToUpdate.set('Nama', updatedData.name);
    }
    if (updatedData.address !== undefined) {
      rowToUpdate.set('Alamat', updatedData.address);
    }
    if (updatedData.phone !== undefined) {
      rowToUpdate.set('No Telp', normalizePhone(updatedData.phone));
    }
    if (updatedData.kota !== undefined) {
      rowToUpdate.set('Kota', formatCityName(updatedData.kota));
    }
    if (updatedData.customerNotes !== undefined) {
      rowToUpdate.set('Notes Pelanggan', updatedData.customerNotes || '');
    }

    clearCache();
    checkUpcomingServices();
    await rowToUpdate.save();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-customer', async (event, { spreadsheetId, customerID }) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets(spreadsheetId);

    const deleteWithRetry = async (row, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await row.delete();
          return;
        } catch (error) {
          if (attempt === maxRetries) throw error;
          console.warn(`Attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    };

    const serviceRows = await serviceSheet.getRows();
    const servicesToDelete = serviceRows.filter(r => r.get('CustomerID') === customerID);
    for (const serviceRow of servicesToDelete) {
      await deleteWithRetry(serviceRow);
    }

    const customerRows = await customerSheet.getRows();
    const customerToDelete = customerRows.find(r => r.get('CustomerID') === customerID);
    if (customerToDelete) {
      await deleteWithRetry(customerToDelete);
    }

    clearCache();
    checkUpcomingServices();
    return { success: true };
  } catch (error) {
    console.error('Operasi penghapusan gagal:', error);
    return {
      success: false,
      error: 'Gagal menghapus data. Silakan coba lagi atau refresh aplikasi.'
    };
  }
});

ipcMain.handle('open-whatsapp', (event, phone) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const internationalPhone = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone.substring(1);
  shell.openExternal(`https://wa.me/${internationalPhone}`);
});

ipcMain.handle('open-external-link', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('export-data', async (event, spreadsheetId) => {
  const saveDialogResult = await dialog.showSaveDialog({
    title: 'Pilih Lokasi dan Nama Dasar untuk File Ekspor',
    defaultPath: `export-data-${formatDateToYYYYMMDD(new Date())}`,
  });

  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    return { success: false, error: 'Proses ekspor dibatalkan.' };
  }

  const baseOutputPath = saveDialogResult.filePath;
  let tempJsonPath = null;

  try {
    const dataToExport = await getFlatDataForExport(spreadsheetId);
    tempJsonPath = path.join(os.tmpdir(), `export-${Date.now()}.json`);
    fs.writeFileSync(tempJsonPath, JSON.stringify(dataToExport, null, 2));

    const isPackaged = app.isPackaged;
    const scriptPath = isPackaged
      ? path.join(process.resourcesPath, 'scripts')
      : 'scripts';

    const scriptFile = 'export_data.py';
    let pythonPath;

    if (isPackaged) {
      const platform = process.platform;
      let portablePythonBase;

      if (platform === 'win32') {
        portablePythonBase = path.join(process.resourcesPath, 'python-portable', 'win', 'python', 'install');
        pythonPath = path.join(portablePythonBase, 'python.exe');
      } else {
        portablePythonBase = path.join(process.resourcesPath, 'python-portable', 'mac', 'python', 'install');
        pythonPath = path.join(portablePythonBase, 'bin', 'python3');
      }
    } else {
      pythonPath = process.platform === 'win32' ? 'venv\\Scripts\\python.exe' : 'venv/bin/python';
    }

    console.log(`Using Python at: ${pythonPath}`);

    const options = {
      mode: 'text',
      scriptPath: scriptPath,
      args: [tempJsonPath, baseOutputPath],
      pythonPath: pythonPath
    };

    await PythonShell.run(scriptFile, options);

    const finalXlsxPath = `${baseOutputPath}.xlsx`;
    const finalCsvPath = `${baseOutputPath}.csv`;

    return { success: true, path: `File berhasil disimpan di:\n${finalXlsxPath}\ndan\n${finalCsvPath}` };
  } catch (err) {
    console.error('Gagal menjalankan proses ekspor:', err);
    dialog.showErrorBox('Ekspor Gagal', `Terjadi kesalahan saat mengekspor data:\n${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (tempJsonPath && fs.existsSync(tempJsonPath)) {
      fs.unlinkSync(tempJsonPath);
    }
  }
});

ipcMain.handle('import-data-interactive', async (event, spreadsheetId) => {
  event.sender.send('show-loading');
  const openDialogResult = await dialog.showOpenDialog({
    title: 'Pilih File untuk Diimpor',
    properties: ['openFile'],
    filters: [{ name: 'Excel atau CSV', extensions: ['xlsx', 'csv'] }]
  });

  if (openDialogResult.canceled || !openDialogResult.filePaths[0]) {
    event.sender.send('hide-loading');
    return { success: false, error: 'Proses impor dibatalkan.' };
  }
  const inputFile = openDialogResult.filePaths[0];
  const tempDir = path.join(app.getPath('userData'), 'temp-import');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const customersPath = path.join(tempDir, 'customers_to_import.csv');
  const servicesPath = path.join(tempDir, 'services_to_import.csv');

  try {
    console.log('IMPORT [3]: Menjalankan script Python...');
    const isPackaged = app.isPackaged;
    const scriptPath = isPackaged ? path.join(process.resourcesPath, 'scripts') : 'scripts';
    const scriptFile = 'import_data.py';
    let pythonPath;
    if (isPackaged) {
      const platform = process.platform;
      pythonPath = platform === 'win32'
        ? path.join(process.resourcesPath, 'python-portable', 'win', 'python', 'install', 'python.exe')
        : path.join(process.resourcesPath, 'python-portable', 'mac', 'python', 'install', 'bin', 'python3');
    } else {
      pythonPath = process.platform === 'win32' ? 'venv\\Scripts\\python.exe' : 'venv/bin/python';
    }
    await PythonShell.run(scriptFile, {
      mode: 'text', scriptPath: scriptPath, args: [inputFile, tempDir], pythonPath: pythonPath
    });
    console.log('IMPORT [4]: Script Python selesai.');

    const customersToImport = [];
    await new Promise((resolve, reject) => fs.createReadStream(customersPath).pipe(csv()).on('data', (row) => customersToImport.push(row)).on('end', resolve).on('error', reject));
    const servicesToImport = [];
    if (fs.existsSync(servicesPath)) {
      await new Promise((resolve, reject) => fs.createReadStream(servicesPath).pipe(csv()).on('data', (row) => servicesToImport.push(row)).on('end', resolve).on('error', reject));
    }

    console.log('IMPORT [5-OPT]: Mengambil semua data dari Google Sheet (1x)...');
    const { customerSheet, serviceSheet } = await getSheets(spreadsheetId);
    const existingCustRows = await customerSheet.getRows();
    const existingServRows = await serviceSheet.getRows();

    const latestServSequenceForDay = new Map();
    existingServRows.forEach(r => {
      const id = r.get('ServiceID');
      if (id && id.startsWith('SVC-')) {
        const datePart = id.substring(4, 12);
        const seqPart = parseInt(id.slice(-5), 10);
        const currentMax = latestServSequenceForDay.get(datePart) || 0;
        if (!isNaN(seqPart) && seqPart > currentMax) {
          latestServSequenceForDay.set(datePart, seqPart);
        }
      }
    });
    const generateLocalServiceId = (serviceDate) => {
      const datePart = formatDateToYYYYMMDD(serviceDate);
      const nextSeq = (latestServSequenceForDay.get(datePart) || 0) + 1;
      latestServSequenceForDay.set(datePart, nextSeq);
      return `SVC-${datePart}${String(nextSeq).padStart(5, '0')}`;
    };

    const indexByPhone = new Map(), indexByNameAddress = new Map(), customerDataMap = new Map();
    for (const row of existingCustRows) {
      const customerId = row.get('CustomerID');
      const customer = { CustomerID: customerId, Nama: row.get('Nama'), Alamat: row.get('Alamat'), 'No Telp': row.get('No Telp') };
      customerDataMap.set(customerId, customer);
      const phone = normalizePhone(customer['No Telp']), name = normalizeName(customer.Nama), address = normalizeAddress(customer.Alamat);
      if (phone) indexByPhone.set(phone, customerId);
      if (name && address) indexByNameAddress.set(`${name}|${address}`, customerId);
    }

    const customersToAdd = [];
    const customersToUpdate = [];
    let skippedCount = 0;
    let bulkChoice = null;

    for (const newCustomer of customersToImport) {
      let userAction;
      if (bulkChoice) {
        userAction = bulkChoice;
      } else {
        const newName = normalizeName(newCustomer.name), newAddress = normalizeAddress(newCustomer.address), newPhone = normalizePhone(newCustomer.phone);
        const conflictId = (newPhone && indexByPhone.get(newPhone)) || (newName && newAddress && indexByNameAddress.get(`${newName}|${newAddress}`));
        if (conflictId) {
          event.sender.send('hide-loading');
          const userChoice = await new Promise(resolve => {
            ipcMain.once('conflict-response', (e, choice) => resolve(choice));
            event.sender.send('open-conflict-dialog', { oldData: customerDataMap.get(conflictId), newData: newCustomer });
          });
          if (userChoice.applyToAll) bulkChoice = userChoice.action;
          userAction = userChoice.action;
        } else {
          userAction = 'add';
        }
      }

      switch (userAction) {
        case 'update':
          const conflictId = (normalizePhone(newCustomer.phone) && indexByPhone.get(normalizePhone(newCustomer.phone))) || indexByNameAddress.get(`${normalizeName(newCustomer.name)}|${normalizeAddress(newCustomer.address)}`);
          customersToUpdate.push({ customerId: conflictId, data: newCustomer });
          break;
        case 'add': case 'duplicate': customersToAdd.push(newCustomer); break;
        case 'skip': skippedCount++; break;
      }
    }

    event.sender.send('show-loading');

    for (const op of customersToUpdate) {
      const rowToUpdate = existingCustRows.find(r => r.get('CustomerID') === op.customerId);
      if (rowToUpdate) {
        rowToUpdate.set('Nama', normalizeCustomerName(op.data.name));
        rowToUpdate.set('Alamat', op.data.address);
        rowToUpdate.set('No Telp', op.data.phone);
        rowToUpdate.set('Kota', op.data.kota);
        await rowToUpdate.save();
      }
    }

    if (customersToAdd.length > 0) {
      let nextCustSeq = 0;
      existingCustRows.forEach(r => {
        const id = r.get('CustomerID');
        if (id && id.startsWith('CUST-')) {
          const seq = parseInt(id.slice(-5));
          if (!isNaN(seq) && seq > nextCustSeq) nextCustSeq = seq;
        }
      });
      nextCustSeq++;

      const finalCustomerRows = [];
      const customerIdMap = new Map();
      customersToAdd.forEach(c => {
        const datePart = formatDateToYYYYMMDD(new Date());
        const sequencePart = String(nextCustSeq++).padStart(5, '0');
        const newId = `CUST-${datePart}${sequencePart}`;
        finalCustomerRows.push({
          CustomerID: newId, Nama: normalizeCustomerName(c.name), Alamat: c.address, 'No Telp': c.phone, Kota: c.kota,
          'Pemasangan': c.purchaseDate, 'Notes Pelanggan': c.customerNotes || '',
        });
        customerIdMap.set(normalizeName(c.name), newId);
      });

      const allNewServiceRows = [];
      const latestServiceMap = new Map();
      const servicesGroupedByName = servicesToImport.reduce((acc, s) => {
        const key = normalizeName(s.name);
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
      }, {});

      customersToAdd.forEach(c => {
        const customerNameKey = normalizeName(c.name);
        const customerId = customerIdMap.get(customerNameKey);
        if (!customerId) return;
        const customerServices = servicesGroupedByName[customerNameKey] || [];
        customerServices.forEach(s => {
          const serviceDate = new Date(s.serviceDate);
          allNewServiceRows.push({
            ServiceID: generateLocalServiceId(serviceDate),
            CustomerID: customerId, ServiceDate: s.serviceDate, Status: 'COMPLETED', Notes: `Riwayat Servis (Data Impor)`,
          });
          const currentLatest = latestServiceMap.get(customerId) || new Date(0);
          if (serviceDate > currentLatest) latestServiceMap.set(customerId, serviceDate);
        });
      });

      latestServiceMap.forEach((lastServiceDate, customerId) => {
        const reminderDate = new Date(lastServiceDate);
        reminderDate.setMonth(reminderDate.getMonth() + 6);
        allNewServiceRows.push({
          ServiceID: generateLocalServiceId(reminderDate),
          CustomerID: customerId, ServiceDate: reminderDate.toISOString().split('T')[0], Status: 'UPCOMING', Notes: 'Jadwal servis rutin berikutnya',
        });
      });

      if (finalCustomerRows.length > 0) await customerSheet.addRows(finalCustomerRows);
      if (allNewServiceRows.length > 0) await serviceSheet.addRows(allNewServiceRows);
    }

    clearCache();
    checkUpcomingServices();
    const message = `Proses impor selesai. ${customersToAdd.length} pelanggan ditambahkan, ${customersToUpdate.length} diperbarui, dan ${skippedCount} dilewati.`;
    return { success: true, message };

  } catch (error) {
    console.error('Gagal melakukan impor:', error);
    dialog.showErrorBox('Impor Gagal', `Terjadi kesalahan saat mengimpor data:\n${error.message}`);
    return { success: false, error: error.message };
  } finally {
    event.sender.send('hide-loading');
    if (fs.existsSync(customersPath)) fs.unlinkSync(customersPath);
    if (fs.existsSync(servicesPath)) fs.unlinkSync(servicesPath);
  }
});