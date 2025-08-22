const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    refreshData: () => ipcRenderer.invoke('refresh-data'),
    updateContactStatus: (updateInfo) => ipcRenderer.invoke('update-contact-status', updateInfo),
    updateService: (serviceInfo) => ipcRenderer.invoke('update-service', serviceInfo),
    addCustomer: (customerData) => ipcRenderer.invoke('add-customer', customerData),
    openWhatsApp: (phoneNumber) => ipcRenderer.invoke('open-whatsapp', phoneNumber),
    updateCustomer: (customerInfo) => ipcRenderer.invoke('update-customer', customerInfo),
    deleteCustomer: (customerID) => ipcRenderer.invoke('delete-customer', customerID),
    updateHistoryNote: (data) => ipcRenderer.invoke('update-history-note', data),
    exportData: () => ipcRenderer.invoke('export-data'),
    importData: () => ipcRenderer.invoke('import-data')
});

console.log('✅ Preload script berhasil dimuat!');
