const { contextBridge, ipcRenderer } = require('electron');

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
    importData: (spreadsheetId) => ipcRenderer.invoke('import-data', spreadsheetId),

    // Fungsi utilitas
    openWhatsapp: (phone) => ipcRenderer.invoke('open-whatsapp', phone),

    // Listener untuk menerima data dari Main ke Renderer
    onLoadSheet: (callback) => ipcRenderer.on('load-sheet', (_event, value) => callback(value)),
});
