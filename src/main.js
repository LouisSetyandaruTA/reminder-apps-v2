import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import path from 'node:path';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import creds from './credentials.json' with { type: 'json' };
import { URL } from 'url';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const __dirname = decodeURI(new URL('.', import.meta.url).pathname)
const SPREADSHEET_ID = '1x4AmlaQGgdqHLEHKo_jZlGvyq9XsHigz6r6qGHFll0o'; // <-- GANTI DENGAN ID GOOGLE SHEET ANDA

// --- FUNGSI LOGIKA GOOGLE SHEETS ---
// Fungsi ini sekarang hanya akan dipanggil saat ada permintaan dari UI
async function getDataFromSheets() {
  try {
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
        _row: row,
      };
    });
    return services;
  } catch (error) {
    console.error('MAIN: Error saat mengambil data:', error);
    throw error; // Lemparkan error agar bisa ditangkap oleh handler
  }
}

// --- FUNGSI UNTUK MEMBUAT JENDELA ---
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

  // Buka DevTools hanya dalam mode development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.openDevTools();
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

// ... (Tambahkan handler lain seperti update-status, dll. di sini)


// --- SIKLUS HIDUP APLIKASI ---
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});