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

function formatDateToYYYYMMDD(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function generateNewCustomerId(purchaseDate) {
  const { customerSheet } = await getSheets();
  const rows = await customerSheet.getRows();
  const datePart = formatDateToYYYYMMDD(purchaseDate);
  const idPrefix = `CUST-${datePart}`;

  const sameDayIds = rows
    .map(r => r.get('CustomerID'))
    .filter(id => id && id.startsWith(idPrefix));

  let nextSequence = 1;
  if (sameDayIds.length > 0) {
    const lastSequences = sameDayIds.map(id => parseInt(id.slice(-5), 10));
    nextSequence = Math.max(...lastSequences) + 1;
  }

  const sequencePart = String(nextSequence).padStart(5, '0');
  return `${idPrefix}${sequencePart}`;
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

    // PERBAIKAN: Cari servis terbaru untuk menentukan status
    const sortedServices = customerServices.sort((a, b) =>
      new Date(b.serviceDate) - new Date(a.serviceDate)
    );

    const latestService = sortedServices[0];

    // PERBAIKAN: Hitung servis yang sudah completed
    const completedServices = customerServices.filter(s => s.status === 'COMPLETED');

    // Tentukan status berdasarkan servis terbaru
    let contactStatus = latestService.status;

    // Jika ada servis completed, status dianggap contacted
    if (completedServices.length > 0) {
      contactStatus = 'COMPLETED';
    }

    combinedData.push({
      ...customerInfo,
      ...latestService,
      services: customerServices,
      nextService: latestService.serviceDate, // Untuk konsistensi
      status: contactStatus, // Gunakan status yang sudah dikoreksi
      hasCompletedService: completedServices.length > 0 // Flag untuk memudahkan filtering
    });
  }
  return combinedData;
}

// MODIFIED: Fungsi untuk ekspor data hanya servis COMPLETED
async function getFlatDataForExport() {
  const { customerSheet, serviceSheet } = await getSheets();
  const customerRows = await customerSheet.getRows();
  const serviceRows = await serviceSheet.getRows();

  // Buat map informasi pelanggan agar mudah dicari
  const customersMap = new Map();
  customerRows.forEach(row => {
    // DIPERBAIKI: Pastikan semua field ada, berikan nilai default jika tidak
    customersMap.set(row.get('CustomerID'), {
      customerID: row.get('CustomerID'),
      name: row.get('Nama') || '',
      address: row.get('Alamat') || '',
      phone: row.get('No Telp') || '',
      kota: row.get('Kota') || '',
      pemasangan: row.get('Pemasangan') || '', // Pastikan kolom ini ada
    });
  });

  const flatData = [];
  // Loop melalui setiap baris servis dan filter hanya yang COMPLETED
  serviceRows.forEach(row => {
    if (row.get('Status') !== 'COMPLETED') return;

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
      const completionDate = new Date().toISOString().split('T')[0];

      rowToUpdate.set('Status', 'COMPLETED');
      rowToUpdate.set('Notes', notes);
      rowToUpdate.set('ServiceDate', completionDate);

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

    const installationDate = new Date(customerData.nextService);
    if (isNaN(installationDate.getTime())) {
      throw new Error('Tanggal pemasangan tidak valid.');
    }
    const installationDateString = installationDate.toISOString().split('T')[0];

    const datePart = formatDateToYYYYMMDD(installationDate);
    const nextSequence = await getNextGlobalSequence();
    const sequencePart = String(nextSequence).padStart(5, '0');
    const newCustomerId = `CUST-${datePart}${sequencePart}`;

    await customerSheet.addRow({
      CustomerID: newCustomerId,
      Nama: customerData.name,
      Alamat: customerData.address,
      'Kota': customerData.kota,
      'No Telp': customerData.phone,
      'Pemasangan': installationDateString,
    });

    const installationServiceId = `SVC-${newCustomerId.split('-')[1]}-P`;
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
    const reminderServiceId = `SVC-${newCustomerId.split('-')[1]}-R`;

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

    const results = await PythonShell.run('export_data.py', options);
    const message = results ? results[0] : '';

    if (message.startsWith('SUCCESS')) {
      return { success: true, path: `${basePath}.xlsx dan .csv` };
    } else {
      throw new Error(message.replace('ERROR: ', ''));
    }
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
      filters: [
        { name: 'Spreadsheet Files', extensions: ['xlsx', 'csv'] }
      ]
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
      mode: 'text',
      pythonPath: 'python3',
      scriptPath: scriptResourcePath,
      args: [inputFile, tempDir]
    };

    console.log("--- Memulai Proses Impor ---");
    console.log("File yang akan diimpor:", inputFile);
    console.log("Path Skrip Python yang digunakan:", scriptResourcePath);
    console.log("Direktori Temp untuk output:", tempDir);
    console.log("Opsi lengkap untuk PythonShell:", pyOptions);

    await PythonShell.run('import_data.py', pyOptions);

    console.log("--- Skrip Python Selesai (Seharusnya Berhasil) ---");

    const customersToImport = [];
    const servicesToImport = [];
    await new Promise((resolve, reject) => fs.createReadStream(customersPath).pipe(csv()).on('data', (row) => customersToImport.push(row)).on('end', resolve).on('error', reject));
    await new Promise((resolve, reject) => fs.createReadStream(servicesPath).pipe(csv()).on('data', (row) => servicesToImport.push(row)).on('end', resolve).on('error', reject));

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

    const newCustomerRows = customersToImport.map(c => {
      const purchaseDate = new Date(c.purchaseDate);
      const datePart = formatDateToYYYYMMDD(purchaseDate);
      const nextSeq = (latestSequenceForDay.get(datePart) || 0) + 1;
      latestSequenceForDay.set(datePart, nextSeq);
      const newId = `CUST-${datePart}${String(nextSeq).padStart(5, '0')}`;

      return {
        CustomerID: newId,
        Nama: c.name,
        Alamat: c.address,
        'No Telp': c.phone,
        'Pemasangan': c.purchaseDate,
      };
    });

    if (newCustomerRows.length > 0) {
      await customerSheet.addRows(newCustomerRows);
    }

    const customerMap = new Map(newCustomerRows.map(c => [c.Nama, c.CustomerID]));
    const notesMap = new Map(customersToImport.map(c => [c.name, c.notes || '']));
    const purchaseDateMap = new Map(customersToImport.map(c => [c.name, c.purchaseDate]));

    const newServiceRows = servicesToImport.map(s => {
      const customerId = customerMap.get(s.name);
      if (!customerId) return null;

      const serviceId = `SVC-${customerId.split('-')[1]}`;
      const purchaseDate = purchaseDateMap.get(s.name);
      const serviceDateStr = new Date(s.serviceDate).toISOString().split('T')[0];

      const isInstallation = serviceDateStr === purchaseDate;

      return {
        ServiceID: serviceId,
        CustomerID: customerId,
        ServiceDate: s.serviceDate,
        Status: isInstallation ? 'COMPLETED' : 'UPCOMING',
        Notes: isInstallation ? 'Pemasangan Awal (Data Impor)' : notesMap.get(s.name),
      };
    }).filter(Boolean);

    if (newServiceRows.length > 0) {
      await serviceSheet.addRows(newServiceRows);
    }

    return { success: true, message: `Berhasil mengimpor ${customersToImport.length} pelanggan dan ${servicesToImport.length} data servis.` };

  } catch (error) {
    console.error('Gagal melakukan impor (Blok Catch):', error);
    return { success: false, error: error.message };
  } finally {
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