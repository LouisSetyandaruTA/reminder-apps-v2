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
    const customerDetailModal = document.getElementById('customer-detail-modal');

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
    
    // --- New Function to Show Customer Details in Modal ---
    function showCustomerDetails(customer) {
        selectedCustomer = customer;
        const priority = calculatePriority(customer);
        const contactStatusDisplay = getContactStatusDisplay(customer);
        const serviceDays = getDaysUntilService(customer);
        const mostRecentServiceDate = getMostRecentService(customer.services);
        const completedServices = customer.services ? customer.services.filter(s => s.status === 'COMPLETED') : [];

        // Populate detail modal
        document.getElementById('detail-modal-name').textContent = customer.name;
        document.getElementById('detail-modal-priority').textContent = priority;
        document.getElementById('detail-modal-priority').className = `px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)}`;
        document.getElementById('detail-modal-status-icon').setAttribute('data-lucide', contactStatusDisplay.icon);
        document.getElementById('detail-modal-status-text').textContent = contactStatusDisplay.text;
        document.getElementById('detail-modal-status').className = `px-2 py-0.5 rounded-full text-xs font-medium border ${contactStatusDisplay.color} flex items-center`;
        document.getElementById('detail-modal-next-service-date').textContent = formatDate(customer.nextService);
        document.getElementById('detail-modal-days-until').textContent = serviceDays;
        document.getElementById('detail-modal-address').textContent = customer.address || 'N/A';
        document.getElementById('detail-modal-kota').textContent = customer.kota || 'N/A';
        document.getElementById('detail-modal-phone').textContent = customer.phone || 'N/A';
        document.getElementById('detail-modal-last-service').textContent = formatDate(mostRecentServiceDate);
        document.getElementById('detail-modal-handler').textContent = customer.handler || 'N/A';
        document.getElementById('detail-modal-notes').textContent = customer.notes || 'Belum pernah dihubungi';

        const historyTableBody = document.createElement('tbody');
        historyTableBody.className = "bg-white divide-y divide-gray-200";
        if (completedServices.length > 0) {
            historyTableBody.innerHTML = completedServices
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
                `).join('');
        } else {
            historyTableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Tidak ada riwayat servis yang selesai.</td></tr>';
        }
        
        const historyContainer = document.getElementById('detail-modal-history');
        historyContainer.innerHTML = ''; // Clear previous content
        
        if (completedServices.length > 0) {
            const historyTable = document.createElement('table');
            historyTable.className = 'min-w-full divide-y divide-gray-200';
            historyTable.innerHTML = `
                <thead class="bg-gray-100">
                    <tr>
                        <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                        <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                        <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                        <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teknisi</th>
                        <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                    </tr>
                </thead>
            `;
            historyTable.appendChild(historyTableBody);
            historyContainer.appendChild(historyTable);
        } else {
            historyContainer.innerHTML = 'Tidak ada riwayat servis yang selesai.';
        }
        
        // Update data-attributes for modal buttons
        document.getElementById('detail-modal-call').dataset.phone = customer.phone;
        document.getElementById('detail-modal-update-contact').dataset.serviceId = customer.serviceID;
        document.getElementById('detail-modal-update-service').dataset.serviceId = customer.serviceID;
        
        if (window.lucide) window.lucide.createIcons();
        openModal(customerDetailModal);
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
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer';
            card.dataset.customerId = customer.customerID;
            card.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-lg font-bold text-gray-900">${customer.name}</h3>
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)}">${priority}</span>
                </div>
                <div class="space-y-1">
                    <div class="flex items-center gap-2 text-sm text-gray-600">
                        <i data-lucide="map-pin" class="w-4 h-4"></i>
                        <span>${customer.kota || 'N/A'}</span>
                    </div>
                    <div class="flex items-center gap-2 text-sm text-gray-600">
                        <i data-lucide="calendar" class="w-4 h-4"></i>
                        <span>${formatDate(customer.nextService)}</span>
                    </div>
                </div>
            `;
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

        document.getElementById('export-data-btn').addEventListener('click', async () => {
            const result = await window.electronAPI.exportData();
            if (result.success) {
                alert(`Data berhasil diekspor dan disimpan di:\n${result.path}`);
            } else {
                alert(`Gagal mengekspor data: ${result.error}`);
            }
        });

        document.getElementById('import-data-btn').addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin mengimpor data?')) {
                handleApiCall(window.electronAPI.importData, null, 'Data berhasil diimpor!', 'Gagal mengimpor data');
            }
        });

        // Event listener for the customer list container
        customerListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('div.bg-white.rounded-lg');
            if (card) {
                const customerId = card.dataset.customerId;
                const customer = customers.find(c => c.customerID === customerId);
                if (customer) {
                    showCustomerDetails(customer);
                }
            }
        });
        
        // Event listener for buttons inside the detail modal
        customerDetailModal.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            switch (action) {
                case 'call': window.electronAPI.openWhatsApp(button.dataset.phone); break;
                case 'update-contact': if(selectedCustomer) { closeModal(customerDetailModal); setupAndOpenContactModal(selectedCustomer); } break;
                case 'update-service': if(selectedCustomer) { closeModal(customerDetailModal); setupAndOpenServiceModal(selectedCustomer); } break;
                case 'edit-note': setupAndOpenHistoryNoteModal(button.dataset); break;
            }
        });
        
        // Existing event listeners for other modals
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="close"]')) closeModal(modal);
            });
            modal.addEventListener('input', () => validateForm(modal));
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