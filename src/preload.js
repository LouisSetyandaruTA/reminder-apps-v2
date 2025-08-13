const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Existing function
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Add the refresh-data function that your main.js actually handles
    refreshData: () => ipcRenderer.invoke('refresh-data'),

    // You can add more handlers here as needed
    // updateStatus: (serviceId, status) => ipcRenderer.invoke('update-status', serviceId, status),
});

console.log('✅ Preload script berhasil dimuat!');