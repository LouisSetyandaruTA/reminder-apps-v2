document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let customers = [];
    let selectedCustomer = null;
    let selectedServiceForNoteEdit = {};
    let filterBy = 'all';
    let filterByCity = 'all';
    let searchTerm = '';
    let currentView = 'bubble';
    let activeSheetId = null;
    let activeSheetName = '';

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
    const contactModalStatus = document.getElementById('contact-modal-status');
    const postponeDurationContainer = document.getElementById('postpone-duration-container');
    const refusalFollowUpContainer = document.getElementById('refusal-follow-up-container');
    const viewBubbleBtn = document.getElementById('view-bubble-btn');
    const viewListBtn = document.getElementById('view-list-btn');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    window.electronAPI.onLoadSheet(({ id, name }) => {
        console.log(`Memuat data untuk: ${name} (${id})`);
        activeSheetId = id;
        activeSheetName = name;
        document.title = `Reminder - ${name}`;
        initializeApp(); // Panggil fungsi utama setelah ID didapat
    });

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
        const inputs = modalElement.querySelectorAll('input[id]:not([type=hidden]), textarea[id], select[id]');
        inputs.forEach(input => {
            hideWarning(input);
            if (!input.value.trim() && input.id !== 'add-modal-customer-notes' && input.id !== 'update-modal-customer-notes') { // Make notes optional
                isAllValid = false;
            }
            if (input.id.includes('phone') && input.value.trim() && !/^\d+$/.test(input.value.trim())) {
                isAllValid = false;
                showWarning(input, 'Nomor telepon hanya boleh berisi angka.');
            }
        });
        saveButton.disabled = !isAllValid;
    };

    const openModal = (modal) => {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        validateForm(modal);
    };

    const closeModal = (modal) => {
        if (modal) {
            modal.querySelectorAll('.input-warning').forEach(el => el.remove());
            modal.classList.add('hidden');
        }
        const anyModalOpen = document.querySelector('#modals-container .fixed:not(.hidden)');
        if (!anyModalOpen) {
            document.body.style.overflow = '';
        }
    };

    const showLoading = () => loadingIndicator.classList.remove('hidden');
    const hideLoading = () => loadingIndicator.classList.add('hidden');

    const updateViewButtons = () => {
        if (currentView === 'bubble') {
            viewBubbleBtn.classList.add('bg-blue-100', 'text-blue-700');
            viewListBtn.classList.remove('bg-blue-100', 'text-blue-700');
        } else {
            viewListBtn.classList.add('bg-blue-100', 'text-blue-700');
            viewBubbleBtn.classList.remove('bg-blue-100', 'text-blue-700');
        }
    };

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

    function showCustomerDetails(customer) {
        selectedCustomer = customer;
        const priority = calculatePriority(customer);
        const contactStatusDisplay = getContactStatusDisplay(customer);
        const serviceDays = getDaysUntilService(customer);
        const mostRecentServiceDate = getMostRecentService(customer.services);
        const completedServices = customer.services ? customer.services.filter(s => s.status === 'COMPLETED') : [];

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
        historyContainer.innerHTML = '';
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

        document.getElementById('detail-modal-call').dataset.phone = customer.phone;
        document.getElementById('detail-modal-update-contact').dataset.serviceId = customer.serviceID;
        document.getElementById('detail-modal-update-service').dataset.serviceId = customer.serviceID;
        document.getElementById('detail-modal-edit').dataset.customerId = customer.customerID;
        document.getElementById('detail-modal-delete').dataset.customerId = customer.customerID;
        document.getElementById('detail-modal-delete').dataset.customerName = customer.name;

        if (window.lucide) window.lucide.createIcons();
        openModal(customerDetailModal);
    }

    // --- Core Rendering Function ---
    function renderCustomers() {
        if (currentView === 'bubble') {
            customerListContainer.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4';
        } else {
            customerListContainer.className = 'flex flex-col gap-4';
        }

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
            card.dataset.customerId = customer.customerID;

            if (currentView === 'bubble') {
                card.className = 'bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer';
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
            } else { // List view
                card.className = `flex items-center justify-between p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer bg-white`;
                card.innerHTML = `
                    <div class="flex items-center gap-4 flex-grow">
                        <h3 class="text-lg font-bold text-gray-900 flex-shrink-0">${customer.name}</h3>
                        <div class="relative pl-4 data-separator hidden md:block">
                            <span class="text-sm font-medium text-gray-600">${customer.kota || 'N/A'}</span>
                        </div>
                        <div class="relative pl-4 data-separator flex-grow">
                            <span class="text-sm font-medium text-gray-600">Servis Berikutnya: <span class="font-bold">${formatDate(customer.nextService)}</span></span>
                        </div>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)}">${priority}</span>
                    </div>
                `;
            }
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
        document.getElementById('contact-modal-status').value = customer.status === 'CONTACTED' ? 'contacted' : (customer.status === 'OVERDUE' ? 'overdue' : 'not_contacted');
        document.getElementById('contact-modal-notes').value = customer.notes || '';
        postponeDurationContainer.classList.toggle('hidden', document.getElementById('contact-modal-status').value !== 'postponed');
        refusalFollowUpContainer.classList.toggle('hidden', document.getElementById('contact-modal-status').value !== 'refused');
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
        document.getElementById('update-modal-customer-notes').value = customer.customerNotes || '';
        openModal(updateCustomerModal);
    }

    // --- Generic API Call Handler ---
    async function handleApiCall(apiFunction, data, successMessage, errorMessagePrefix) {
        showLoading();
        try {
            // Panggil fungsi API dengan activeSheetId. 'data' bisa berupa objek atau null
            const result = await apiFunction(activeSheetId, data);
            if (result.success) {
                if (successMessage) alert(successMessage);
                initializeApp(); // Muat ulang data untuk sheet yang sama
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error('API Call Error:', err);
            alert(`${errorMessagePrefix}: ${err.message}`);
        } finally {
            hideLoading();
        }
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        searchInput.addEventListener('input', (e) => { searchTerm = e.target.value; renderCustomers(); });
        filterSelect.addEventListener('change', (e) => { filterBy = e.target.value; renderCustomers(); });
        cityFilterSelect.addEventListener('change', (e) => { filterByCity = e.target.value; renderCustomers(); });

        viewBubbleBtn.addEventListener('click', () => {
            if (currentView !== 'bubble') {
                currentView = 'bubble';
                localStorage.setItem('customerView', 'bubble');
                updateViewButtons();
                renderCustomers();
            }
        });

        viewListBtn.addEventListener('click', () => {
            if (currentView !== 'list') {
                currentView = 'list';
                localStorage.setItem('customerView', 'list');
                updateViewButtons();
                renderCustomers();
            }
        });

        document.getElementById('add-customer-btn').addEventListener('click', setupAndOpenAddCustomerModal);
        document.getElementById('refresh-btn').addEventListener('click', () => initializeApp());
        document.getElementById('retry-btn').addEventListener('click', () => initializeApp());

        if (!window.electronAPI) {
            console.warn("Electron API not found. Using mock data and functions.");
            window.electronAPI = {
                refreshData: async () => ({
                    success: true,
                    data: [
                        { customerID: '1', serviceID: 's1', name: 'Budi Santoso', phone: '081234567890', address: 'Jl. Merdeka 1', kota: 'Jakarta', nextService: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), handler: 'Tim A', status: 'UPCOMING', notes: '', services: [{ serviceID: 's0', date: new Date(Date.now() - 375 * 24 * 60 * 60 * 1000).toISOString(), status: 'COMPLETED', notes: 'Pemasangan Awal', handler: 'Tim A' }] },
                        { customerID: '2', serviceID: 's2', name: 'Citra Lestari', phone: '082345678901', address: 'Jl. Pahlawan 2', kota: 'Surabaya', nextService: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), handler: 'Tim B', status: 'UPCOMING', notes: 'Sudah dihubungi', services: [] },
                        { customerID: '3', serviceID: 's3', name: 'Doni Firmansyah', phone: '083456789012', address: 'Jl. Kemerdekaan 3', kota: 'Bandung', nextService: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(), handler: 'Tim C', status: 'COMPLETED', notes: '', services: [] },
                        { customerID: '4', serviceID: 's4', name: 'Eka Putri', phone: '084567890123', address: 'Jl. Nusantara 4', kota: 'Jakarta', nextService: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(), handler: 'Tim A', status: 'OVERDUE', notes: 'Tidak diangkat', services: [] },
                    ]
                }),
                exportData: async () => { alert("Export berhasil (mode web)"); return { success: true, path: "/mock/path/data.xlsx" } },
                importData: async () => { alert("Import berhasil (mode web)"); return { success: true } },
                openWhatsApp: (phone) => { if (phone) window.open(`https://wa.me/${phone.replace(/^0/, '62')}`, '_blank'); else alert("Nomor telepon tidak tersedia."); },
                updateContactStatus: async (data) => { console.log("Update Contact:", data); return { success: true } },
                updateService: async (data) => { console.log("Update Service:", data); return { success: true } },
                updateHistoryNote: async (data) => { console.log("Update History Note:", data); return { success: true } },
                addCustomer: async (data) => { console.log("Add Customer:", data); return { success: true } },
                updateCustomer: async (data) => { console.log("Update Customer:", data); return { success: true } },
                deleteCustomer: async (id) => { console.log("Delete Customer:", id); return { success: true } },
            };
        }

        document.getElementById('export-data-btn').addEventListener('click', async () => {
            showLoading();
            try {
                const result = await window.electronAPI.exportData();
                if (result.success) {
                    alert(`Data berhasil diekspor dan disimpan di:\n${result.path}`);
                } else {
                    alert(`Gagal mengekspor data: ${result.error}`);
                }
            } catch (error) {
                alert('Terjadi kesalahan saat mengekspor data.');
            } finally {
                hideLoading();
            }
        });

        document.getElementById('import-data-btn').addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin mengimpor data? Ini akan menimpa data yang ada.')) {
                handleApiCall(window.electronAPI.importData, null, 'Data berhasil diimpor!', 'Gagal mengimpor data');
            }
        });

        contactModalStatus.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            postponeDurationContainer.classList.toggle('hidden', selectedValue !== 'postponed');
            refusalFollowUpContainer.classList.toggle('hidden', selectedValue !== 'refused');
        });

        document.getElementById('contact-modal-save').addEventListener('click', () => {
            const statusMap = { 'not_contacted': 'UPCOMING', 'contacted': 'CONTACTED', 'overdue': 'OVERDUE', 'postponed': 'POSTPONED', 'refused': 'REFUSED' };
            const selectedStatus = contactModalStatus.value;
            const data = {
                serviceID: selectedCustomer.serviceID,
                newStatus: statusMap[selectedStatus],
                notes: document.getElementById('contact-modal-notes').value
            };
            if (selectedStatus === 'postponed') data.postponeDuration = document.getElementById('contact-modal-postpone-duration').value;
            else if (selectedStatus === 'refused') data.refusalFollowUp = document.getElementById('contact-modal-refusal-follow-up').value;
            handleApiCall(window.electronAPI.updateContactStatus, data, 'Status kontak berhasil diupdate!', 'Status kontak gagal di update');
        });

        customerListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('div[data-customer-id]');
            if (card) {
                const customerId = card.dataset.customerId;
                const customer = customers.find(c => c.customerID === customerId);
                if (customer) showCustomerDetails(customer);
            }
        });

        customerDetailModal.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            if (action !== 'close') {
                closeModal(customerDetailModal);
            }
            switch (action) {
                case 'call': window.electronAPI.openWhatsApp(button.dataset.phone); break;
                case 'update-contact': if (selectedCustomer) setupAndOpenContactModal(selectedCustomer); break;
                case 'update-service': if (selectedCustomer) setupAndOpenServiceModal(selectedCustomer); break;
                case 'edit-customer': if (selectedCustomer) setupAndOpenUpdateCustomerModal(selectedCustomer); break;
                case 'delete-customer':
                    if (confirm(`Yakin ingin menghapus ${button.dataset.customerName}?`)) {
                        handleApiCall(window.electronAPI.deleteCustomer, button.dataset.customerId, 'Pelanggan berhasil dihapus!', 'Gagal menghapus pelanggan');
                    }
                    break;
                case 'close': closeModal(customerDetailModal); break;
            }
        });

        document.querySelector('#detail-modal-history').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action="edit-note"]');
            if (button) {
                closeModal(customerDetailModal);
                setupAndOpenHistoryNoteModal(button.dataset);
            }
        });

        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="close"]')) closeModal(modal);
            });
            modal.addEventListener('input', () => validateForm(modal));
        });

        document.getElementById('service-modal-save').addEventListener('click', () => {
            const data = { serviceID: selectedCustomer.serviceID, newDate: document.getElementById('service-modal-date').value, newHandler: document.getElementById('service-modal-handler').value };
            handleApiCall(window.electronAPI.updateService, data, 'Layanan berhasil diperbarui!', 'Gagal memperbarui layanan');
        });

        document.getElementById('history-note-modal-save').addEventListener('click', () => {
            if (!confirm('Yakin ingin menyimpan perubahan pada riwayat ini?')) return;
            const data = { serviceID: selectedServiceForNoteEdit.serviceId, newNotes: document.getElementById('history-note-modal-notes').value, newHandler: document.getElementById('history-note-modal-handler').value };
            handleApiCall(window.electronAPI.updateHistoryNote, data, 'Catatan riwayat berhasil diperbarui!', 'Gagal memperbarui catatan');
        });

        document.getElementById('add-modal-save').addEventListener('click', () => {
            const customerData = { name: document.getElementById('add-modal-name').value, phone: document.getElementById('add-modal-phone').value, address: document.getElementById('add-modal-address').value, kota: document.getElementById('add-modal-kota').value, customerNotes: document.getElementById('add-modal-customer-notes').value, nextService: document.getElementById('add-modal-nextService').value, handler: document.getElementById('add-modal-handler').value };
            handleApiCall(window.electronAPI.addCustomer, customerData, 'Pelanggan baru berhasil ditambahkan!', 'Gagal menambah pelanggan');
        });

        document.getElementById('update-modal-save').addEventListener('click', () => {
            const updatedData = { name: document.getElementById('update-modal-name').value, phone: document.getElementById('update-modal-phone').value, address: document.getElementById('update-modal-address').value, kota: document.getElementById('update-modal-kota').value, customerNotes: document.getElementById('update-modal-customer-notes').value };
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
    async function initializeApp(options = {}) {
        const { keepFilters = false } = options;

        const savedView = localStorage.getItem('customerView');
        currentView = (savedView === 'list' || savedView === 'bubble') ? savedView : 'bubble';
        updateViewButtons();

        showLoading();
        errorIndicator.classList.add('hidden');
        customerListContainer.innerHTML = '';
        emptyState.classList.add('hidden');

        if (!activeSheetId) return;
        showLoading();

        try {
            const result = await window.electronAPI.refreshData();
            if (result.success) {
                customers = result.data || [];
                if (!keepFilters) {
                    populateCityFilter(customers);
                }
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
