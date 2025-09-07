const { contextBridge, ipcRenderer } = require('electron');

// "Jembatan" aman antara Frontend (Renderer) dan Backend (Main Process)
contextBridge.exposeInMainWorld('electronAPI', {
    // --- Fungsi untuk Dashboard ---
    getDatabases: () => ipcRenderer.invoke('get-databases'),
    addDatabase: (data) => ipcRenderer.invoke('add-database', data),
    deleteDatabase: (id) => ipcRenderer.invoke('delete-database', id),
    openReminderForSheet: (data) => ipcRenderer.send('open-reminder-for-sheet', data),

    // --- Fungsi untuk Jendela Reminder ---
    refreshData: (sheetId) => ipcRenderer.invoke('refresh-data', sheetId),
    addCustomer: (sheetId, customerData) => ipcRenderer.invoke('add-customer', { sheetId, customerData }),
    updateContactStatus: (sheetId, data) => ipcRenderer.invoke('update-contact-status', { sheetId, ...data }),
    updateService: (sheetId, data) => ipcRenderer.invoke('update-service', { sheetId, ...data }),
    updateCustomer: (sheetId, data) => ipcRenderer.invoke('update-customer', { sheetId, ...data }),
    deleteCustomer: (sheetId, customerID) => ipcRenderer.invoke('delete-customer', { sheetId, customerID }),
    updateHistoryNote: (sheetId, data) => ipcRenderer.invoke('update-history-note', { sheetId, ...data }),

    // Fungsi utilitas
    openWhatsapp: (phone) => ipcRenderer.invoke('open-whatsapp', phone),

    // Listener untuk menerima data dari Main ke Renderer
    onLoadSheet: (callback) => ipcRenderer.on('load-sheet', (_event, value) => callback(value)),
});
