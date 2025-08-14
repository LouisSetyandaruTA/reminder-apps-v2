document.addEventListener('DOMContentLoaded', () => {
    // --- APPLICATION STATE ---
    let customers = [];
    let selectedCustomer = null;
    let sortBy = 'nextService';
    let filterBy = 'all';
    let searchTerm = '';

    // --- DOM ELEMENT REFERENCES ---
    const customerListContainer = document.getElementById('customer-list');
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const sortSelect = document.getElementById('sort-select');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorIndicator = document.getElementById('error-indicator');
    const errorMessage = document.getElementById('error-message');
    const emptyState = document.getElementById('empty-state');
    const modalsContainer = document.getElementById('modals-container');
    const updateServiceModal = document.getElementById('update-service-modal');
    const updateContactModal = document.getElementById('update-contact-modal');
    const addCustomerModal = document.getElementById('add-customer-modal');
    const updateCustomerModal = document.getElementById('update-customer-modal');

    // --- HELPER FUNCTIONS ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getMostRecentService = (services) => {
        if (!services || Object.keys(services).length === 0) return null;
        return Object.values(services)
            .filter(date => date && date.trim() !== '')
            .map(date => new Date(date))
            .filter(date => !isNaN(date.getTime()))
            .sort((a, b) => b - a)[0] || null;
    };

    const calculatePriority = (customer) => {
        if (!customer.nextService) return 'Rendah';
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Rendah';

        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));

        if (daysDiff < 0) return 'Sangat Mendesak';
        if (daysDiff <= 7) return 'Tinggi';
        if (daysDiff <= 30) return 'Sedang';
        return 'Rendah';
    };

    const getContactStatusDisplay = (customer) => {
        switch (customer.status) {
            case 'CONTACTED':
            case 'COMPLETED':
                return { color: 'bg-green-100 text-green-800', icon: 'check-circle', text: 'Sudah dihubungi' };
            case 'OVERDUE':
                return { color: 'bg-red-100 text-red-800', icon: 'alert-circle', text: 'Terlambat dihubungi' };
            case 'UPCOMING':
            default:
                return { color: 'bg-gray-100 text-gray-800', icon: 'clock', text: 'Belum dihubungi' };
        }
    };

    const getDaysUntilService = (customer) => {
        if (!customer.nextService) return 'Tanggal belum di atur';
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Tanggal tidak Valid';
        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return `Terlambat ${Math.abs(daysDiff)} hari`;
        if (daysDiff === 0) return 'Hari ini';
        return `Dalam ${daysDiff} hari`;
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'Sangat Mendesak': return 'bg-red-500 text-white';
            case 'Tinggi': return 'bg-red-100 text-red-800';
            case 'Sedang': return 'bg-yellow-100 text-yellow-800';
            case 'Rendah': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // --- RENDER FUNCTION ---
    function renderCustomers() {
        const sortedAndFilteredCustomers = customers
            .filter(customer => {
                if (!customer || !customer.name) return false;
                const lowerSearchTerm = searchTerm.toLowerCase();
                const matchesSearch = (customer.name || '').toLowerCase().includes(lowerSearchTerm) ||
                    (customer.address || '').toLowerCase().includes(lowerSearchTerm) ||
                    (customer.phone || '').toLowerCase().includes(lowerSearchTerm);
                if (!matchesSearch) return false;

                switch (filterBy) {
                    case 'all': return true;
                    case 'overdue': {
                        const nextServiceDate = new Date(customer.nextService);
                        return !isNaN(nextServiceDate.getTime()) && nextServiceDate < today;
                    }
                    case 'upcoming': {
                        const nextServiceDate = new Date(customer.nextService);
                        if (isNaN(nextServiceDate.getTime())) return false;
                        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
                        return daysDiff >= 0 && daysDiff <= 30;
                    }
                    case 'contacted': return customer.status === 'COMPLETED';
                    case 'not_contacted': return customer.status === 'UPCOMING';
                    case 'contact_overdue': return customer.status === 'OVERDUE';
                    default: return true;
                }
            })
            .sort((a, b) => {
                if (sortBy === 'nextService') {
                    const dateA = a.nextService ? new Date(a.nextService) : null;
                    const dateB = b.nextService ? new Date(b.nextService) : null;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateA - dateB;
                }
                if (sortBy === 'name') {
                    return (a.name || '').localeCompare(b.name || '');
                }
                return 0;
            });

        customerListContainer.innerHTML = '';
        emptyState.classList.toggle('hidden', sortedAndFilteredCustomers.length > 0);

        sortedAndFilteredCustomers.forEach(customer => {
            const priority = calculatePriority(customer);
            const contactStatusDisplay = getContactStatusDisplay(customer);
            const serviceDays = getDaysUntilService(customer);
            const mostRecentService = getMostRecentService(customer.services);

            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow';
            card.innerHTML = `
                <div class="flex flex-col md:flex-row justify-between items-start gap-6">
                    <div class="flex-1 w-full">
                        <div class="flex items-center mb-4 flex-wrap">
                            <h3 class="text-xl font-bold text-gray-900 mr-3">${customer.name}</h3>
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)} mr-2">${priority}</span>
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${contactStatusDisplay.color} flex items-center">
                                <i data-lucide="${contactStatusDisplay.icon}" class="w-3.5 h-3.5"></i>
                                <span class="ml-1.5">${contactStatusDisplay.text}</span>
                            </span>
                        </div>
                        <div class="space-y-4 text-sm">
                            <div>
                                <p class="text-gray-500">Pengingat Berikutnya</p>
                                <p class="font-semibold text-gray-800">${formatDate(customer.nextService)} - <span class="text-blue-600">${serviceDays}</span></p>
                            </div>
                            <div>
                                <p class="text-gray-500">Alamat</p>
                                <p class="font-semibold text-gray-800">${customer.address || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-gray-500">Nomor Telepon</p>
                                <p class="font-semibold text-gray-800">${customer.phone || 'N/A'}</p>
                            </div>
                            <div class="grid grid-cols-3 gap-4 pt-1">
                                <div><p class="text-gray-500">Servis Terakhir</p><p class="font-semibold text-gray-800">${formatDate(mostRecentService)}</p></div>
                                <div><p class="text-gray-500">Servis Berikutnya</p><p class="font-semibold text-gray-800">${formatDate(customer.nextService)}</p></div>
                                <div><p class="text-gray-500">Status Servis</p><p class="font-semibold text-blue-600">${serviceDays}</p></div>
                            </div>
                            <div>
                                <p class="text-gray-500">Keterangan</p>
                                <p class="font-semibold text-gray-800">${customer.notes || 'Belum pernah dihubungi'}</p>
                            </div>
                        </div>
                        <div class="mt-4">
                            <details class="group text-sm">
                                <summary class="font-medium text-gray-600 cursor-pointer hover:text-gray-900 list-none">
                                    <span class="group-open:hidden">Tampilkan Riwayat Servis</span>
                                    <span class="hidden group-open:inline">Sembunyikan Riwayat Servis</span>
                                </summary>
                                <div class="mt-2 text-xs bg-gray-50 p-2 rounded border">
                                    ${Object.keys(customer.services || {}).length > 0 ? Object.entries(customer.services).map(([key, value]) => `<div><span class="text-gray-500">${key}:</span> ${formatDate(value)}</div>`).join('') : 'Tidak ada riwayat servis.'}
                                </div>
                            </details>
                        </div>
                    </div>
                    <div class="w-full md:w-auto md:min-w-[190px] flex flex-col gap-2 pt-2 md:pt-0">
                        <button data-action="call" data-phone="${customer.phone}" class="w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-green-600 text-green-600 hover:bg-green-50 transition-colors">
                            <i data-lucide="message-circle" class="w-4 h-4 mr-2"></i> Kontak
                        </button>
                        <button data-action="update-contact" data-service-id="${customer.serviceID}" class="w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-purple-600 text-purple-600 hover:bg-purple-50 transition-colors">
                            <i data-lucide="user-check" class="w-4 h-4 mr-2"></i> Kontak Update
                        </button>
                        <button data-action="update-service" data-service-id="${customer.serviceID}" class="w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors">
                            <i data-lucide="settings" class="w-4 h-4 mr-2"></i> Servis Update
                        </button>
                        <div class="flex gap-2 mt-2">
                            <button data-action="edit-customer" data-customer-id="${customer.customerID}" class="flex-1 px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap bg-gray-200 hover:bg-gray-300">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button data-action="delete-customer" data-customer-id="${customer.customerID}" data-customer-name="${customer.name}" class="flex-1 px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap bg-red-200 text-red-800 hover:bg-red-300">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
            customerListContainer.appendChild(card);
        });

        document.getElementById('stats-total').textContent = customers.length;
        document.getElementById('stats-overdue').textContent = customers.filter(c => { const d = new Date(c.nextService); return !isNaN(d.getTime()) && d < today; }).length;
        document.getElementById('stats-due-month').textContent = customers.filter(c => { const d = new Date(c.nextService); if (isNaN(d.getTime())) return false; const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24)); return diff >= 0 && diff <= 30; }).length;
        document.getElementById('stats-contacted').textContent = customers.filter(c => c.status === 'COMPLETED').length;
        document.getElementById('stats-not-contacted').textContent = customers.filter(c => c.status === 'UPCOMING').length;
        document.getElementById('stats-contact-overdue').textContent = customers.filter(c => c.status === 'OVERDUE').length;

        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    // --- MODAL HANDLING ---
    function openModal(modal) { modal.classList.remove('hidden'); }
    function closeModal(modal) { modal.classList.add('hidden'); }

    modalsContainer.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            closeModal(e.target.closest('.fixed'));
        }
    });

    // (DIPERBAIKI) Fungsi ini disederhanakan dan diperbaiki
    function setupAndOpenServiceModal(customer) {
        selectedCustomer = customer;
        document.getElementById('service-modal-customer-name').textContent = customer.name;
        // Mengisi tanggal yang ada saat ini untuk kemudahan pengguna
        const currentDate = customer.nextService ? new Date(customer.nextService).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('service-modal-date').value = currentDate;
        openModal(updateServiceModal);
    }

    function setupAndOpenContactModal(customer) {
        selectedCustomer = customer;
        document.getElementById('contact-modal-name').textContent = customer.name;
        document.getElementById('contact-modal-phone').textContent = customer.phone;
        document.getElementById('contact-modal-status').value = customer.status === 'COMPLETED' ? 'contacted' : (customer.status === 'OVERDUE' ? 'overdue' : 'not_contacted');
        document.getElementById('contact-modal-notes').value = customer.notes || '';
        openModal(updateContactModal);
    }

    function setupAndOpenAddCustomerModal() {
        addCustomerModal.querySelector('form') ? addCustomerModal.querySelector('form').reset() : (
            document.getElementById('add-modal-name').value = '',
            document.getElementById('add-modal-phone').value = '',
            document.getElementById('add-modal-address').value = '',
            document.getElementById('add-modal-nextService').value = ''
        );
        openModal(addCustomerModal);
    }

    function setupAndOpenUpdateCustomerModal(customer) {
        selectedCustomer = customer;
        document.getElementById('update-modal-name').value = customer.name;
        document.getElementById('update-modal-phone').value = customer.phone;
        document.getElementById('update-modal-address').value = customer.address;
        openModal(updateCustomerModal);
    }

    // --- EVENT LISTENERS ---
    searchInput.addEventListener('input', (e) => { searchTerm = e.target.value; renderCustomers(); });
    filterSelect.addEventListener('change', (e) => { filterBy = e.target.value; renderCustomers(); });
    sortSelect.addEventListener('change', (e) => { sortBy = e.target.value; renderCustomers(); });

    document.getElementById('add-customer-btn').addEventListener('click', setupAndOpenAddCustomerModal);
    document.getElementById('refresh-btn').addEventListener('click', initializeApp);
    document.getElementById('retry-btn').addEventListener('click', initializeApp);

    customerListContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const serviceId = button.dataset.serviceId;
        const customerId = button.dataset.customerId;

        const customer = customers.find(c => c.serviceID === serviceId || c.customerID === customerId);
        if (!customer && action !== 'call') {
            console.error('Customer not found for action:', action);
            return;
        }

        if (action === 'call') {
            window.electronAPI.openWhatsApp(button.dataset.phone);
        } else if (action === 'update-service') {
            setupAndOpenServiceModal(customer);
        } else if (action === 'update-contact') {
            setupAndOpenContactModal(customer);
        } else if (action === 'edit-customer') {
            setupAndOpenUpdateCustomerModal(customer);
        } else if (action === 'delete-customer') {
            const customerName = button.dataset.customerName;
            if (confirm(`Apakah anda yakin ingin menghapus ${customerName} dan semua data layanannya? Tindakan ini tidak ada dibatalkan.`)) {
                handleDeleteCustomer(customerId);
            }
        }
    });

    // (DIPERBAIKI) Logika penyimpanan sekarang memanggil API backend
    document.getElementById('service-modal-save').addEventListener('click', async () => {
        if (!selectedCustomer) return alert('Tidak ada pelanggan yang dipilih.');

        const newDate = document.getElementById('service-modal-date').value;
        if (!newDate) {
            return alert('Silakan pilih tanggal layanan yang baru.');
        }

        const result = await window.electronAPI.updateServiceDate({
            serviceID: selectedCustomer.serviceID,
            newDate: newDate
        });

        if (result.success) {
            alert('Tanggal layanan berhasil diperbarui!');
            closeModal(updateServiceModal);
            initializeApp();
        } else {
            alert(`Gagal memperbarui tanggal layanan: ${result.error}`);
        }
    });


    document.getElementById('contact-modal-save').addEventListener('click', async () => {
        const statusMap = {
            'not_contacted': 'UPCOMING',
            'contacted': 'CONTACTED',
            'overdue': 'OVERDUE'
        };

        const result = await window.electronAPI.updateContactStatus({
            serviceID: selectedCustomer.serviceID,
            newStatus: statusMap[document.getElementById('contact-modal-status').value],
            notes: document.getElementById('contact-modal-notes').value
        });
        if (result.success) {
            alert('Status kontak berhasil diupdate!');
            closeModal(updateContactModal);
            initializeApp();
        } else {
            alert(`Status kontak gagal di update: ${result.error}`);
        }
    });

    document.getElementById('add-modal-save').addEventListener('click', async () => {
        const customerData = {
            name: document.getElementById('add-modal-name').value,
            phone: document.getElementById('add-modal-phone').value,
            address: document.getElementById('add-modal-address').value,
            nextService: document.getElementById('add-modal-nextService').value,
        };
        if (!customerData.name || !customerData.phone) return alert('Mohon isi nama dan nomor telepon pelanggan.');

        const result = await window.electronAPI.addCustomer(customerData);
        if (result.success) {
            alert('Pelanggan baru berhasil ditambahkan!');
            closeModal(addCustomerModal);
            initializeApp();
        } else {
            alert(`Gagal menambah pelanggan: ${result.error}`);
        }
    });

    document.getElementById('update-modal-save').addEventListener('click', async () => {
        const updatedData = {
            name: document.getElementById('update-modal-name').value,
            phone: document.getElementById('update-modal-phone').value,
            address: document.getElementById('update-modal-address').value,
        };
        if (!updatedData.name || !updatedData.phone) return alert('Mohon isi nama dan nomor telepon pelanggan.');

        const result = await window.electronAPI.updateCustomer({
            customerID: selectedCustomer.customerID,
            updatedData: updatedData
        });

        if (result.success) {
            alert('Data pelanggan berhasil diupdate!');
            closeModal(updateCustomerModal);
            initializeApp();
        } else {
            alert(`Gagal mengupdate data pelanggan: ${result.error}`);
        }
    });

    async function handleDeleteCustomer(customerID) {
        const result = await window.electronAPI.deleteCustomer(customerID);
        if (result.success) {
            alert('Pelanggan berhasil dihapus!');
            initializeApp();
        } else {
            alert(`Gagal menghapus pelanggan: ${result.error}`);
        }
    }

    // --- INITIALIZATION ---
    async function initializeApp() {
        loadingIndicator.classList.remove('hidden');
        errorIndicator.classList.add('hidden');
        customerListContainer.innerHTML = ''; // Kosongkan daftar saat memuat
        emptyState.classList.add('hidden');

        try {
            const result = await window.electronAPI.refreshData();
            if (result.success) {
                customers = result.data || [];
                renderCustomers();
            } else {
                throw new Error(result.error || 'Terjadi kesalahan tidak diketahui.');
            }
        } catch (err) {
            errorMessage.textContent = err.message;
            errorIndicator.classList.remove('hidden');
        } finally {
            loadingIndicator.classList.add('hidden');
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    initializeApp();
});