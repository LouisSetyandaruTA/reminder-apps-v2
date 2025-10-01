const { contextBridge, ipcRenderer } = require('electron');

// "Jembatan" aman antara Frontend (Renderer) dan Backend (Main Process)
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Fungsi untuk Dashboard ---
    getDatabases: () => ipcRenderer.invoke('get-databases'),
    addDatabase: (data) => ipcRenderer.invoke('add-database', data),
    deleteDatabase: (id) => ipcRenderer.invoke('delete-database', id),
    openReminderForSheet: (data) => ipcRenderer.send('open-reminder-for-sheet', data),
    getClientEmail: () => ipcRenderer.invoke('get-client-email'),

    // --- Fungsi untuk Jendela Reminder ---
    refreshData: (spreadsheetId) => ipcRenderer.invoke('refresh-data', spreadsheetId),
    addCustomer: (spreadsheetId, customerData) => ipcRenderer.invoke('add-customer', { spreadsheetId, customerData }),
    updateContactStatus: (spreadsheetId, data) => ipcRenderer.invoke('update-contact-status', { spreadsheetId, ...data }),
    updateService: (spreadsheetId, data) => ipcRenderer.invoke('update-service', { spreadsheetId, ...data }),
    updateCustomer: (spreadsheetId, data) => ipcRenderer.invoke('update-customer', { spreadsheetId, ...data }),
    deleteCustomer: (spreadsheetId, customerID) => ipcRenderer.invoke('delete-customer', { spreadsheetId, customerID }),
    updateHistoryNote: (spreadsheetId, data) => ipcRenderer.invoke('update-history-note', { spreadsheetId, ...data }),
    exportData: (spreadsheetId) => ipcRenderer.invoke('export-data', spreadsheetId),
    importDataInteractive: (spreadsheetId) => ipcRenderer.invoke('import-data-interactive', spreadsheetId),

    // Fungsi utilitas
    openWhatsapp: (phone) => ipcRenderer.invoke('open-whatsapp', phone),
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),

    onLoadSheet: (callback) => ipcRenderer.on('load-sheet', (_event, value) => callback(value)),

    // Handler untuk dialog konflik impor
    onOpenConflictDialog: (callback) => ipcRenderer.on('open-conflict-dialog', (_event, value) => callback(value)),
    sendConflictResponse: (choice) => ipcRenderer.send('conflict-response', choice),

    // Listener untuk mengontrol loading indicator
    onShowLoading: (callback) => ipcRenderer.on('show-loading', callback),
    onHideLoading: (callback) => ipcRenderer.on('hide-loading', callback),

    // Listener untuk menerima data dari Main ke Renderer
    onLoadSheet: (callback) => ipcRenderer.on('load-sheet', (_event, value) => callback(value)),
});
