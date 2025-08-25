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

const SPREADSHEET_ID = '1x4AmlaQGgdqHLEHKo_jZlGvyq9XsHigz6r6qGHFll0o';

// --- Helper Functions ---

function formatDateToYYYYMMDD(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
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

// --- ID Generator Functions ---

async function getNextGlobalSequence() {
  const { customerSheet } = await getSheets();
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

async function generateNewServiceId(serviceDate) {
  const { serviceSheet } = await getSheets();
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
      kota: row.get('Kota'),
      pemasangan: row.get('Pemasangan'),
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

  const customersMap = new Map();
  customerRows.forEach(row => {
    customersMap.set(row.get('CustomerID'), {
      customerID: row.get('CustomerID'),
      name: row.get('Nama') || '',
      address: row.get('Alamat') || '',
      phone: row.get('No Telp') || '',
      kota: row.get('Kota') || '',
      Pemasangan: row.get('Pemasangan') || '',
    });
  });

  const flatData = [];
  serviceRows.forEach(row => {
    const customerID = row.get('CustomerID');
    const customerInfo = customersMap.get(customerID);

    if (customerInfo) {
      flatData.push({
        ...customerInfo,
        serviceID: row.get('ServiceID'),
        serviceDate: row.get('ServiceDate'),
        status: row.get('Status'),
        notes: row.get('Notes') || '',
        handler: row.get('Handler') || '',
      });
    }
  });

  return flatData;
}


// --- Reminder Function ---

async function checkUpcomingServices() {
  if (!Notification.isSupported()) {
    console.log('Sistem notifikasi tidak didukung pada OS ini.');
    return;
  }
  console.log('Memeriksa jadwal untuk notifikasi...');
  try {
    const data = await getDataFromSheets();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineGroups = {};
    data.forEach(customer => {
      if (customer.nextService && customer.status === 'UPCOMING') {
        const nextServiceDate = new Date(customer.nextService);
        nextServiceDate.setHours(0, 0, 0, 0);
        if (isNaN(nextServiceDate.getTime())) return;
        const timeDiff = nextServiceDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        if (daysDiff >= 0 && daysDiff <= 3) {
          if (!deadlineGroups[daysDiff]) {
            deadlineGroups[daysDiff] = [];
          }
          deadlineGroups[daysDiff].push(customer.name);
        }
      }
    });
    for (const days in deadlineGroups) {
      const customerCount = deadlineGroups[days].length;
      if (customerCount === 0) continue;
      let timeText = '';
      if (days === '0') {
        timeText = 'HARI INI';
      } else if (days === '1') {
        timeText = 'BESOK';
      } else {
        timeText = `dalam ${days} hari lagi`;
      }
      const bodyMessage = `Halo, jangan lupa ${timeText} ada ${customerCount} pelanggan yang harus kamu hubungi.`;
      console.log(`MENGIRIM NOTIFIKASI GABUNGAN: ${bodyMessage}`);
      new Notification({
        title: 'Pengingat Jadwal Servis',
        body: bodyMessage
      }).show();
    }
  } catch (error) {
    console.error('Gagal memeriksa jadwal untuk notifikasi:', error);
  }
}

// --- Main Window & App Lifecycle ---

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

app.whenReady().then(() => {
  createWindow();
  checkUpcomingServices();
  setInterval(checkUpcomingServices, 3600 * 1000); // Check every hour
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('refresh-data', async () => {
  try {
    const data = await getDataFromSheets();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-customer', async (event, customerData) => {
  try {
    const { customerSheet, serviceSheet } = await getSheets();
    const installationDate = new Date(customerData.nextService);
    if (isNaN(installationDate.getTime())) {
      throw new Error('Tanggal pemasangan tidak valid.');
    }
    const installationDateString = installationDate.toISOString().split('T')[0];

    // Generate Customer ID using global sequence
    const datePart = formatDateToYYYYMMDD(installationDate);
    const nextSequence = await getNextGlobalSequence();
    const sequencePart = String(nextSequence).padStart(5, '0');
    const newCustomerId = `CUST-${datePart}${sequencePart}`;

    await customerSheet.addRow({
      CustomerID: newCustomerId,
      Nama: customerData.name,
      Alamat: customerData.address,
      'No Telp': customerData.phone,
      Kota: customerData.kota,
      'Pemasangan': installationDateString,
    });

    // Generate Service IDs using date-based sequence
    const installationServiceId = await generateNewServiceId(installationDate);
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
    const reminderServiceId = await generateNewServiceId(reminderDate);
    await serviceSheet.addRow({
      ServiceID: reminderServiceId,
      CustomerID: newCustomerId,
      ServiceDate: reminderDateString,
      Status: 'UPCOMING',
      Handler: customerData.handler,
      Notes: 'Jadwal servis rutin berikutnya',
    });

    return { success: true };
  } catch (error) {
    console.error('Gagal menambah pelanggan:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-contact-status', async (event, { serviceID, newStatus, notes, postponeDuration }) => {
  try {
    const { serviceSheet } = await getSheets();
    const rows = await serviceSheet.getRows();

    // Logika yang lebih baik untuk menemukan baris yang akan diupdate
    const triggeredRow = rows.find(r => r.get('ServiceID') === serviceID);
    if (!triggeredRow) throw new Error('Service record pemicu tidak ditemukan.');
    const customerId = triggeredRow.get('CustomerID');
    const customerServices = rows.filter(r => r.get('CustomerID') === customerId);
    const upcomingServices = customerServices
      .filter(r => r.get('Status') === 'UPCOMING')
      .sort((a, b) => new Date(a.get('ServiceDate')) - new Date(b.get('ServiceDate')));

    let rowToUpdate = upcomingServices.length > 0 ? upcomingServices[0] : triggeredRow;

    if (newStatus === 'CONTACTED') {
      const completionDate = new Date().toISOString().split('T')[0];
      rowToUpdate.set('Status', 'COMPLETED');
      rowToUpdate.set('Notes', notes);
      rowToUpdate.set('ServiceDate', completionDate);
      await rowToUpdate.save();

      const nextServiceDate = new Date();
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 6);
      const idSuffix = customerId.substring(5);
      const nextServiceId = `SVC-${idSuffix}-R`;
      await serviceSheet.addRow({
        ServiceID: nextServiceId,
        CustomerID: customerId,
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

      // --- LOGIKA BARU UNTUK STATUS DITUNDA ---
    } else if (newStatus === 'POSTPONED') {
      const newDate = new Date();
      switch (postponeDuration) {
        case '1w': newDate.setDate(newDate.getDate() + 7); break;
        case '1m': newDate.setMonth(newDate.getMonth() + 1); break;
        case '3m': newDate.setMonth(newDate.getMonth() + 3); break;
        case '6m': newDate.setMonth(newDate.getMonth() + 6); break;
      }

      // Status kembali menjadi UPCOMING dengan tanggal baru
      rowToUpdate.set('Status', 'UPCOMING');
      rowToUpdate.set('ServiceDate', newDate.toISOString().split('T')[0]);
      rowToUpdate.set('Notes', notes);
      await rowToUpdate.save();
      // --- AKHIR LOGIKA BARU ---

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
    const triggeredRow = rows.find(r => r.get('ServiceID') === serviceID);
    if (!triggeredRow) {
      throw new Error('Service record pemicu tidak ditemukan.');
    }
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
    return { success: true };
  } catch (error) {
    console.error('Error updating service:', error);
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
    if (updatedData.kota) {
      rowToUpdate.set('Kota', updatedData.kota);
    }
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
    let customerFoundAndDeleted = false;
    for (const row of customerRows) {
      if (row.get('CustomerID') === customerID) {
        await row.delete();
        customerFoundAndDeleted = true;
        break;
      }
    }
    if (!customerFoundAndDeleted) {
      console.warn(`Peringatan: Pelanggan dengan ID ${customerID} tidak ditemukan, tetapi tetap melanjutkan menghapus data servis terkait.`);
    }
    const serviceRows = await serviceSheet.getRows();
    const servicesToDelete = serviceRows.filter(r => r.get('CustomerID') === customerID);
    if (servicesToDelete.length > 0) {
      await Promise.all(servicesToDelete.map(row => row.delete()));
    }
    return { success: true };
  } catch (error) {
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
    defaultPath: `export-data-pelanggan-${new Date().toISOString().split('T')[0]}`,
    filters: [
      { name: 'Excel Files', extensions: ['xlsx'] },
      { name: 'CSV Files', extensions: ['csv'] },
    ]
  });
  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    return { success: false, error: 'Proses ekspor dibatalkan.' };
  }
  const fullPath = saveDialogResult.filePath;
  const parsedPath = path.parse(fullPath);
  const basePath = path.join(parsedPath.dir, parsedPath.name);
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
      args: [dataString, basePath]
    };
    await PythonShell.run('export_data.py', options);
    return { success: true, path: `${basePath}.xlsx dan .csv` };
  } catch (err) {
    console.error('Gagal menjalankan proses ekspor:', err);
    return { success: false, error: err.message || 'Terjadi kesalahan tidak diketahui saat ekspor.' };
  }
});

ipcMain.handle('import-data', async () => {
  const tempDir = app.getPath('userData');
  const customersPath = path.join(tempDir, 'customers_to_import.csv');
  const servicesPath = path.join(tempDir, 'services_to_import.csv');
  try {
    const openDialogResult = await dialog.showOpenDialog({
      title: 'Pilih File untuk Diimpor',
      properties: ['openFile'],
      filters: [{ name: 'Spreadsheet Files', extensions: ['xlsx', 'csv'] }]
    });
    if (openDialogResult.canceled || !openDialogResult.filePaths[0]) {
      return { success: false, error: 'Proses impor dibatalkan.' };
    }
    const inputFile = openDialogResult.filePaths[0];

    const isPackaged = app.isPackaged;
    const scriptResourcePath = isPackaged
      ? path.join(process.resourcesPath, 'scripts')
      : path.join(__dirname, '..', '..', 'scripts');
    const pyOptions = {
      mode: 'text', pythonPath: 'python3', scriptPath: scriptResourcePath,
      args: [inputFile, tempDir]
    };
    await PythonShell.run('import_data.py', pyOptions);

    const customersToImport = [];
    const servicesToImport = [];
    await new Promise((resolve, reject) => fs.createReadStream(customersPath).pipe(csv()).on('data', (row) => customersToImport.push(row)).on('end', resolve).on('error', reject));
    await new Promise((resolve, reject) => fs.createReadStream(servicesPath).pipe(csv()).on('data', (row) => servicesToImport.push(row)).on('end', resolve).on('error', reject));

    // --- OPTIMISASI DIMULAI DI SINI ---
    // 1. Baca semua data yang ada SATU KALI saja
    const { customerSheet, serviceSheet } = await getSheets();
    const existingServRows = await serviceSheet.getRows();
    let nextCustSequence = await getNextGlobalSequence(customerSheet); // Kirim sheet agar tidak perlu get lagi

    // 2. Siapkan data urutan servis di memori
    const latestServSequenceForDay = new Map();
    existingServRows.map(r => r.get('ServiceID')).forEach(id => {
      if (id && id.startsWith('SVC-')) {
        const datePart = id.substring(4, 12);
        const seqPart = parseInt(id.slice(-5), 10);
        const currentMax = latestServSequenceForDay.get(datePart) || 0;
        if (seqPart > currentMax) {
          latestServSequenceForDay.set(datePart, seqPart);
        }
      }
    });

    // 3. Buat semua baris baru di memori tanpa memanggil API
    const newCustomerRows = customersToImport.map(c => {
      const purchaseDate = new Date(c.purchaseDate);
      const datePart = formatDateToYYYYMMDD(purchaseDate);
      const sequencePart = String(nextCustSequence).padStart(5, '0');
      const newId = `CUST-${datePart}${sequencePart}`;
      nextCustSequence++;
      return {
        CustomerID: newId, Nama: c.name, Alamat: c.address,
        'No Telp': c.phone, Kota: c.kota, 'Pemasangan': c.purchaseDate,
      };
    });

    const customerMap = new Map(newCustomerRows.map(c => [c.Nama, c.CustomerID]));
    const latestServiceMap = new Map(customersToImport.map(c => [c.name, c.latest_service]));
    const allNewServiceRows = [];

    servicesToImport.forEach(s => {
      const customerId = customerMap.get(s.name);
      if (!customerId) return;
      const serviceDate = new Date(s.serviceDate);
      const datePart = formatDateToYYYYMMDD(serviceDate);
      const nextSeq = (latestServSequenceForDay.get(datePart) || 0) + 1;
      latestServSequenceForDay.set(datePart, nextSeq); // Update sequence di memori
      const serviceId = `SVC-${datePart}${String(nextSeq).padStart(5, '0')}`;
      allNewServiceRows.push({
        ServiceID: serviceId, CustomerID: customerId, ServiceDate: s.serviceDate,
        Status: 'COMPLETED', Notes: `Riwayat Servis (Data Impor)`,
      });
    });

    customersToImport.forEach(c => {
      const customerId = customerMap.get(c.name);
      if (!customerId || !latestServiceMap.get(c.name)) return;
      const lastServiceDate = new Date(latestServiceMap.get(c.name));
      lastServiceDate.setMonth(lastServiceDate.getMonth() + 6);
      const reminderDateString = lastServiceDate.toISOString().split('T')[0];
      const datePart = formatDateToYYYYMMDD(lastServiceDate);
      const nextSeq = (latestServSequenceForDay.get(datePart) || 0) + 1;
      latestServSequenceForDay.set(datePart, nextSeq); // Update sequence di memori
      const serviceId = `SVC-${datePart}${String(nextSeq).padStart(5, '0')}`;
      allNewServiceRows.push({
        ServiceID: serviceId, CustomerID: customerId, ServiceDate: reminderDateString,
        Status: 'UPCOMING', Notes: 'Jadwal servis rutin berikutnya',
      });
    });

    // 4. Unggah semua baris baru dalam DUA PANGGILAN API saja
    if (newCustomerRows.length > 0) {
      await customerSheet.addRows(newCustomerRows);
    }
    if (allNewServiceRows.length > 0) {
      await serviceSheet.addRows(allNewServiceRows);
    }
    // --- AKHIR OPTIMISASI ---

    return { success: true, message: `Berhasil mengimpor ${customersToImport.length} pelanggan.` };
  } catch (error) {
    console.error('Gagal melakukan impor (Blok Catch):', error);
    return { success: false, error: error.message };
  } finally {
    if (fs.existsSync(customersPath)) fs.unlinkSync(customersPath);
    if (fs.existsSync(servicesPath)) fs.unlinkSync(servicesPath);
  }
});
