const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Fungsi untuk "menarik" data dari main process
    refreshData: () => ipcRenderer.invoke('refresh-data'),

    // Fungsi untuk mengirim perintah update status
    updateContactStatus: (updateInfo) => ipcRenderer.invoke('update-contact-status', updateInfo),

    // (DITAMBAHKAN) Fungsi untuk update tanggal servis
    updateServiceDate: (serviceInfo) => ipcRenderer.invoke('update-service-date', serviceInfo),

    // Fungsi untuk menambah pelanggan baru
    addCustomer: (customerData) => ipcRenderer.invoke('add-customer', customerData),

    // Fungsi untuk membuka WhatsApp
    openWhatsApp: (phoneNumber) => ipcRenderer.invoke('open-whatsapp', phoneNumber),

    // Fungsi untuk update data pelanggan
    updateCustomer: (customerInfo) => ipcRenderer.invoke('update-customer', customerInfo),

    // Fungsi untuk menghapus pelanggan
    deleteCustomer: (customerID) => ipcRenderer.invoke('delete-customer', customerID),
});

console.log('✅ Preload script berhasil dimuat!');