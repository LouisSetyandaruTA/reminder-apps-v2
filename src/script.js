document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let customers = [];
    let selectedCustomer = null;
    let selectedServiceForNoteEdit = {};
    let filterBy = 'all';
    let filterByCity = 'all';
    let searchTerm = '';

    // --- Element Caching ---
    const customerListContainer = document.getElementById('customer-list');
    const searchInput = document.getElementById('search-input');
    const filterSelect = document.getElementById('filter-select');
    const cityFilterSelect = document.getElementById('city-filter-select');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorIndicator = document.getElementById('error-indicator');
    const errorMessage = document.getElementById('error-message');
    const emptyState = document.getElementById('empty-state');
    const modals = document.querySelectorAll('#modals-container .fixed');
    const updateServiceModal = document.getElementById('update-service-modal');
    const updateContactModal = document.getElementById('update-contact-modal');
    const addCustomerModal = document.getElementById('add-customer-modal');
    const updateCustomerModal = document.getElementById('update-customer-modal');
    const updateHistoryNoteModal = document.getElementById('update-history-note-modal');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- UI Helper Functions ---

    const showWarning = (inputElement, message) => {
        hideWarning(inputElement);
        const warningElement = document.createElement('p');
        warningElement.className = 'input-warning text-red-600 text-xs mt-1';
        warningElement.textContent = message;
        inputElement.insertAdjacentElement('afterend', warningElement);
    };

    const hideWarning = (inputElement) => {
        const parent = inputElement.parentElement;
        const oldWarning = parent.querySelector('.input-warning');
        if (oldWarning) oldWarning.remove();
    };

    const validateForm = (modalElement) => {
        const saveButton = modalElement.querySelector('button[type="submit"]');
        if (!saveButton) return;
        let isAllValid = true;
        const inputs = modalElement.querySelectorAll('input[id], textarea[id], select[id]');
        inputs.forEach(input => {
            hideWarning(input);
            if (!input.value.trim()) isAllValid = false;
            if (input.id.includes('phone') && input.value.trim() && !/^\d+$/.test(input.value.trim())) {
                isAllValid = false;
                showWarning(input, 'Nomor telepon hanya boleh berisi angka.');
            }
        });
        saveButton.disabled = !isAllValid;
    };

    const openModal = (modal) => {
        modal.classList.remove('hidden');
        validateForm(modal);
    };

    const closeModal = (modal) => {
        if (modal) {
            modal.querySelectorAll('.input-warning').forEach(el => el.remove());
            modal.classList.add('hidden');
        }
    };

    const showLoading = () => loadingIndicator.classList.remove('hidden');
    const hideLoading = () => loadingIndicator.classList.add('hidden');

    // --- Data Formatting & Logic Functions ---

    const getMostRecentService = (allServices) => {
        if (!allServices || allServices.length === 0) return null;
        const completedOrPastServices = [...allServices]
            .filter(s => {
                const serviceDate = new Date(s.date);
                const isInstallation = s.notes === 'Pemasangan Awal';
                const isCompletedOrPast = s.status === 'COMPLETED' || (!isNaN(serviceDate.getTime()) && serviceDate < today);
                return !isInstallation && isCompletedOrPast;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        return completedOrPastServices.length > 0 ? completedOrPastServices[0].date : null;
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

    function populateCityFilter(customers) {
        const selectedValue = cityFilterSelect.value;
        cityFilterSelect.innerHTML = '<option value="all">Semua Kota</option>';
        if (!customers || customers.length === 0) return;
        const cities = [...new Set(customers.map(c => c.kota).filter(Boolean))].sort();
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            cityFilterSelect.appendChild(option);
        });
        cityFilterSelect.value = selectedValue;
    }

    // --- Core Rendering Function ---

    function renderCustomers() {
        const sortedAndFilteredCustomers = customers
            .filter(customer => {
                if (!customer || !customer.name) return false;
                if (filterByCity !== 'all' && customer.kota !== filterByCity) return false;
                const lowerSearchTerm = searchTerm.toLowerCase();
                const matchesSearch = (customer.name || '').toLowerCase().includes(lowerSearchTerm) ||
                    (customer.address || '').toLowerCase().includes(lowerSearchTerm) ||
                    (customer.phone || '').toLowerCase().includes(lowerSearchTerm);
                if (!matchesSearch) return false;
                switch (filterBy) {
                    case 'all': return true;
                    case 'overdue': {
                        if (!customer.nextService) return false;
                        const nextServiceDate = new Date(customer.nextService);
                        return !isNaN(nextServiceDate.getTime()) && nextServiceDate < today && customer.status !== 'COMPLETED';
                    }
                    case 'upcoming': {
                        if (!customer.nextService) return false;
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
                const dateA = a.nextService ? new Date(a.nextService) : null;
                const dateB = b.nextService ? new Date(b.nextService) : null;
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateA - dateB;
            });

        customerListContainer.innerHTML = '';
        emptyState.classList.toggle('hidden', sortedAndFilteredCustomers.length > 0);

        sortedAndFilteredCustomers.forEach(customer => {
            const priority = calculatePriority(customer);
            const contactStatusDisplay = getContactStatusDisplay(customer);
            const serviceDays = getDaysUntilService(customer);
            const mostRecentServiceDate = getMostRecentService(customer.services);
            const completedServices = customer.services ? customer.services.filter(s => s.status === 'COMPLETED') : [];

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
                            <div><p class="text-gray-500">Pengingat Berikutnya</p><p class="font-semibold text-gray-800">${formatDate(customer.nextService)} - <span class="text-blue-600">${serviceDays}</span></p></div>
                            <div><p class="text-gray-500">Alamat</p><p class="font-semibold text-gray-800">${customer.address || 'N/A'}</p></div>
                            <div><p class="text-gray-500">Kota</p><p class="font-semibold text-gray-800">${customer.kota || 'N/A'}</p></div>
                            <div><p class="text-gray-500">Nomor Telepon</p><p class="font-semibold text-gray-800">${customer.phone || 'N/A'}</p></div>
                            <div class="grid grid-cols-3 gap-4 pt-1">
                                <div><p class="text-gray-500">Servis Terakhir</p><p class="font-semibold text-gray-800">${formatDate(mostRecentServiceDate)}</p></div>
                                <div><p class="text-gray-500">Servis Berikutnya</p><p class="font-semibold text-gray-800">${formatDate(customer.nextService)}</p></div>
                                <div><p class="text-gray-500">Status Servis</p><p class="font-semibold text-blue-600">${customer.status || 'N/A'}</p></div>
                            </div>
                            <div><p class="text-gray-500">Teknisi</p><p class="font-semibold text-gray-800">${customer.handler || 'N/A'}</p></div>
                            <div><p class="text-gray-500">Keterangan</p><p class="font-semibold text-gray-800">${customer.notes || 'Belum pernah dihubungi'}</p></div>
                        </div>
                        <div class="mt-4">
                            <details class="group text-sm">
                                <summary class="font-medium text-gray-600 cursor-pointer hover:text-gray-900 list-none">
                                    <span class="group-open:hidden">Tampilkan Riwayat Servis</span>
                                    <span class="hidden group-open:inline">Sembunyikan Riwayat Servis</span>
                                </summary>
                                <div class="mt-2 text-xs bg-gray-50 p-2 rounded border overflow-x-auto">
                                    ${completedServices.length > 0
                    ? `<table class="min-w-full divide-y divide-gray-200">
                                              <thead class="bg-gray-100">
                                                  <tr>
                                                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                                                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                                                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                                                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teknisi</th>
                                                      <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                                                  </tr>
                                              </thead>
                                              <tbody class="bg-white divide-y divide-gray-200">
                                                  ${completedServices
                        .sort((a, b) => new Date(a.date) - new Date(b.date))
                        .map((service, index) => `
                                                      <tr>
                                                          <td class="px-3 py-2 whitespace-nowrap">${index + 1}</td>
                                                          <td class="px-3 py-2 whitespace-nowrap">${formatDate(service.date)}</td>
                                                          <td class="px-3 py-2 whitespace-normal break-words">${service.notes || '-'}</td>
                                                          <td class="px-3 py-2 whitespace-nowrap">${service.handler || '-'}</td>
                                                          <td class="px-3 py-2 whitespace-nowrap">
                                                            <button data-action="edit-note"
                                                                    data-service-id="${service.serviceID}"
                                                                    data-service-date="${service.date}"
                                                                    data-current-notes="${service.notes || ''}"
                                                                    data-current-handler="${service.handler || ''}"
                                                                    data-customer-name="${customer.name}"
                                                                    class="px-2 py-1 text-xs rounded bg-gray-200 text-gray-800 hover:bg-gray-300">
                                                                Edit
                                                            </button>
                                                          </td>
                                                      </tr>
                                                  `).join('')}
                                              </tbody>
                                          </table>`
                    : 'Tidak ada riwayat servis yang selesai.'
                }
                                </div>
                            </details>
                        </div>
                    </div>
                    <div class="w-full md:w-auto md:min-w-[190px] flex flex-col gap-2 pt-2 md:pt-0">
                        <button data-action="call" data-phone="${customer.phone}" class="w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-green-600 text-green-600 hover:bg-green-50 transition-colors"><i data-lucide="message-circle" class="w-4 h-4 mr-2"></i> Kontak</button>
                        <button data-action="update-contact" data-service-id="${customer.serviceID}" class="w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-purple-600 text-purple-600 hover:bg-purple-50 transition-colors"><i data-lucide="user-check" class="w-4 h-4 mr-2"></i> Kontak Update</button>
                        <button data-action="update-service" data-service-id="${customer.serviceID}" class="w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors"><i data-lucide="settings" class="w-4 h-4 mr-2"></i> Servis Update</button>
                        <div class="flex gap-2 mt-2">
                            <button data-action="edit-customer" data-customer-id="${customer.customerID}" class="flex-1 px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap bg-gray-200 hover:bg-gray-300"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                            <button data-action="delete-customer" data-customer-id="${customer.customerID}" data-customer-name="${customer.name}" class="flex-1 px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap bg-red-200 text-red-800 hover:bg-red-300"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                </div>`;
            customerListContainer.appendChild(card);
        });

        document.getElementById('stats-total').textContent = customers.length;
        document.getElementById('stats-overdue').textContent = customers.filter(c => { if (!c.nextService) return false; const d = new Date(c.nextService); return !isNaN(d.getTime()) && d < today && c.status !== 'COMPLETED'; }).length;
        document.getElementById('stats-due-month').textContent = customers.filter(c => { if (!c.nextService) return false; const d = new Date(c.nextService); if (isNaN(d.getTime())) return false; const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24)); return diff >= 0 && diff <= 30; }).length;
        document.getElementById('stats-contacted').textContent = customers.filter(c => c.status === 'COMPLETED').length;
        document.getElementById('stats-not-contacted').textContent = customers.filter(c => c.status === 'UPCOMING').length;
        document.getElementById('stats-contact-overdue').textContent = customers.filter(c => c.status === 'OVERDUE').length;

        if (window.lucide) window.lucide.createIcons();
    };

    // --- Modal Setup Functions ---

    function setupAndOpenServiceModal(customer) {
        selectedCustomer = customer;
        document.getElementById('service-modal-customer-name').textContent = customer.name;
        const currentDate = customer.nextService ? new Date(customer.nextService).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('service-modal-date').value = currentDate;
        document.getElementById('service-modal-handler').value = customer.handler || '';
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

    function setupAndOpenHistoryNoteModal(data) {
        selectedServiceForNoteEdit = { serviceId: data.serviceId };
        document.getElementById('history-note-modal-info').textContent = `Mengubah catatan untuk ${data.customerName} pada tanggal ${formatDate(data.serviceDate)}`;
        document.getElementById('history-note-modal-notes').value = data.currentNotes;
        document.getElementById('history-note-modal-handler').value = data.currentHandler;
        openModal(updateHistoryNoteModal);
    }

    function setupAndOpenAddCustomerModal() {
        addCustomerModal.querySelector('form').reset();
        openModal(addCustomerModal);
    }

    function setupAndOpenUpdateCustomerModal(customer) {
        selectedCustomer = customer;
        document.getElementById('update-modal-name').value = customer.name;
        document.getElementById('update-modal-phone').value = customer.phone;
        document.getElementById('update-modal-address').value = customer.address;
        document.getElementById('update-modal-kota').value = customer.kota || '';
        openModal(updateCustomerModal);
    }

    // --- Generic API Call Handler ---

    async function handleApiCall(apiFunction, data, successMessage, errorMessagePrefix) {
        showLoading();
        try {
            const result = await apiFunction(data);
            if (result.success) {
                alert(successMessage);
                initializeApp();
            } else {
                throw new Error(result.error || 'Terjadi kesalahan tidak diketahui.');
            }
        } catch (err) {
            alert(`${errorMessagePrefix}: ${err.message}`);
            initializeApp();
        } finally {
            hideLoading();
        }
    }

    // --- Event Listeners Setup ---

    function setupEventListeners() {
        searchInput.addEventListener('input', (e) => { searchTerm = e.target.value; renderCustomers(); });
        filterSelect.addEventListener('change', (e) => { filterBy = e.target.value; renderCustomers(); });
        cityFilterSelect.addEventListener('change', (e) => { filterByCity = e.target.value; renderCustomers(); });

        document.getElementById('add-customer-btn').addEventListener('click', setupAndOpenAddCustomerModal);
        document.getElementById('refresh-btn').addEventListener('click', initializeApp);
        document.getElementById('retry-btn').addEventListener('click', initializeApp);

        document.getElementById('export-data-btn').addEventListener('click', () => {
            handleApiCall(window.electronAPI.exportData, null, 'Data berhasil diekspor!', 'Gagal mengekspor data').then(result => {
                if (result && result.success) {
                    alert(`Data berhasil diekspor dan disimpan di:\n${result.path}`);
                }
            });
        });

        document.getElementById('import-data-btn').addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin mengimpor data?')) {
                handleApiCall(window.electronAPI.importData, null, 'Data berhasil diimpor!', 'Gagal mengimpor data');
            }
        });

        customerListContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            const customer = customers.find(c => c.serviceID === button.dataset.serviceId || c.customerID === button.dataset.customerId);
            switch (action) {
                case 'edit-note': setupAndOpenHistoryNoteModal(button.dataset); break;
                case 'call': window.electronAPI.openWhatsApp(button.dataset.phone); break;
                case 'update-service': if (customer) setupAndOpenServiceModal(customer); break;
                case 'update-contact': if (customer) setupAndOpenContactModal(customer); break;
                case 'edit-customer': if (customer) setupAndOpenUpdateCustomerModal(customer); break;
                case 'delete-customer':
                    if (confirm(`Yakin ingin menghapus ${button.dataset.customerName}?`)) {
                        handleApiCall(window.electronAPI.deleteCustomer, button.dataset.customerId, 'Pelanggan berhasil dihapus!', 'Gagal menghapus pelanggan');
                    }
                    break;
            }
        });

        document.getElementById('service-modal-save').addEventListener('click', () => {
            closeModal(updateServiceModal);
            const data = {
                serviceID: selectedCustomer.serviceID,
                newDate: document.getElementById('service-modal-date').value,
                newHandler: document.getElementById('service-modal-handler').value
            };
            handleApiCall(window.electronAPI.updateService, data, 'Layanan berhasil diperbarui!', 'Gagal memperbarui layanan');
        });

        document.getElementById('contact-modal-save').addEventListener('click', () => {
            closeModal(updateContactModal);
            const statusMap = { 'not_contacted': 'UPCOMING', 'contacted': 'CONTACTED', 'overdue': 'OVERDUE' };
            const data = {
                serviceID: selectedCustomer.serviceID,
                newStatus: statusMap[document.getElementById('contact-modal-status').value],
                notes: document.getElementById('contact-modal-notes').value
            };
            handleApiCall(window.electronAPI.updateContactStatus, data, 'Status kontak berhasil diupdate!', 'Status kontak gagal di update');
        });

        document.getElementById('history-note-modal-save').addEventListener('click', () => {
            if (!confirm('Yakin ingin menyimpan perubahan pada riwayat ini?')) return;
            closeModal(updateHistoryNoteModal);
            const data = {
                serviceID: selectedServiceForNoteEdit.serviceId,
                newNotes: document.getElementById('history-note-modal-notes').value,
                newHandler: document.getElementById('history-note-modal-handler').value
            };
            handleApiCall(window.electronAPI.updateHistoryNote, data, 'Catatan riwayat berhasil diperbarui!', 'Gagal memperbarui catatan');
        });

        document.getElementById('add-modal-save').addEventListener('click', () => {
            closeModal(addCustomerModal);
            const customerData = {
                name: document.getElementById('add-modal-name').value,
                phone: document.getElementById('add-modal-phone').value,
                address: document.getElementById('add-modal-address').value,
                kota: document.getElementById('add-modal-kota').value,
                nextService: document.getElementById('add-modal-nextService').value,
                handler: document.getElementById('add-modal-handler').value,
            };
            handleApiCall(window.electronAPI.addCustomer, customerData, 'Pelanggan baru berhasil ditambahkan!', 'Gagal menambah pelanggan');
        });

        document.getElementById('update-modal-save').addEventListener('click', () => {
            closeModal(updateCustomerModal);
            const updatedData = {
                name: document.getElementById('update-modal-name').value,
                phone: document.getElementById('update-modal-phone').value,
                address: document.getElementById('update-modal-address').value,
                kota: document.getElementById('update-modal-kota').value
            };
            handleApiCall(window.electronAPI.updateCustomer, { customerID: selectedCustomer.customerID, updatedData }, 'Data pelanggan berhasil diupdate!', 'Gagal mengupdate data pelanggan');
        });

        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="close"]')) closeModal(modal);
            });
            modal.addEventListener('input', () => validateForm(modal));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModal = document.querySelector('#modals-container .fixed:not(.hidden)');
                if (openModal) closeModal(openModal);
            }
        });
    }

    // --- App Initialization ---

    async function initializeApp() {
        showLoading();
        errorIndicator.classList.add('hidden');
        customerListContainer.innerHTML = '';
        emptyState.classList.add('hidden');

        try {
            const result = await window.electronAPI.refreshData();
            if (result.success) {
                customers = result.data || [];
                populateCityFilter(customers);
                renderCustomers();
            } else {
                throw new Error(result.error || 'Terjadi kesalahan tidak diketahui.');
            }
        } catch (err) {
            errorMessage.textContent = err.message;
            errorIndicator.classList.remove('hidden');
        } finally {
            hideLoading();
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    setupEventListeners();
    initializeApp();
});
