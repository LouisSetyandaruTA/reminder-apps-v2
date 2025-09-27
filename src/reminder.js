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
    const customerNotesModal = document.getElementById('customer-notes-modal');
    const contactModalStatus = document.getElementById('contact-modal-status');
    const postponeDurationContainer = document.getElementById('postpone-duration-container');
    const refusalFollowUpContainer = document.getElementById('refusal-follow-up-container');
    const viewBubbleBtn = document.getElementById('view-bubble-btn');
    const viewListBtn = document.getElementById('view-list-btn');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    window.electronAPI.onLoadSheet(({ id, name }) => {
        activeSheetId = id;
        activeSheetName = name;
        document.title = `Reminder - ${name}`;
        initializeApp();
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
            const isOptional = input.id.includes('customer-notes');
            if (!isOptional && !input.value.trim()) {
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
        const anyModalOpen = Array.from(modals).some(m => !m.classList.contains('hidden'));
        if (!anyModalOpen) {
            document.body.style.overflow = '';
        }
    };

    const showLoading = () => {
        modals.forEach(closeModal);
        loadingIndicator.classList.remove('hidden');
    };
    const hideLoading = () => loadingIndicator.classList.add('hidden');

    const updateViewButtons = () => {
        viewBubbleBtn.classList.toggle('bg-blue-100', currentView === 'bubble');
        viewBubbleBtn.classList.toggle('text-blue-700', currentView === 'bubble');
        viewListBtn.classList.toggle('bg-blue-100', currentView === 'list');
        viewListBtn.classList.toggle('text-blue-700', currentView === 'list');
    };

    // --- Data Formatting & Logic Functions ---
    const getMostRecentService = (allServices) => {
        if (!allServices || allServices.length === 0) return null;
        const completedServices = allServices
            .filter(s => s.status === 'COMPLETED' && s.notes !== 'Pemasangan Awal')
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        return completedServices.length > 0 ? completedServices[0].date : null;
    };

    const calculatePriority = (customer) => {
        if (customer.status !== 'UPCOMING' || !customer.nextService) return 'Rendah';
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
            case 'COMPLETED':
                return { color: 'bg-green-100 text-green-800', icon: 'check-circle', text: 'Sudah Selesai' };
            case 'OVERDUE':
                return { color: 'bg-red-100 text-red-800', icon: 'alert-circle', text: 'Terlambat Dihubungi' };
            case 'UPCOMING':
            default:
                const priority = calculatePriority(customer);
                if (priority === 'Sangat Mendesak') {
                    return { color: 'bg-red-100 text-red-800', icon: 'alert-triangle', text: 'Jadwal Terlewat' };
                }
                return { color: 'bg-gray-100 text-gray-800', icon: 'clock', text: 'Akan Datang' };
        }
    };

    const getDaysUntilService = (customer) => {
        if (!customer.nextService || customer.status === 'COMPLETED') return 'Tidak ada jadwal';
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Tanggal tidak valid';
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
        if (isNaN(date.getTime())) return 'Tanggal tidak valid';
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
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

    function setNotesModalMode(mode) {
        const viewContainer = document.getElementById('notes-view-container');
        const editContainer = document.getElementById('notes-edit-container');
        const viewActions = document.getElementById('notes-view-actions');
        const editActions = document.getElementById('notes-edit-actions');

        if (mode === 'edit') {
            viewContainer.classList.add('hidden');
            editContainer.classList.remove('hidden');
            viewActions.classList.add('hidden');
            editActions.classList.remove('hidden');
        } else {
            viewContainer.classList.remove('hidden');
            editContainer.classList.add('hidden');
            viewActions.classList.remove('hidden');
            editActions.classList.add('hidden');
        }
    }

    function updateNotesModalContent(customer) {
        selectedCustomer = customer;
        const modalContent = document.getElementById('notes-modal-content');
        const notes = customer.customerNotes || '';

        if (notes.trim()) {
            modalContent.innerHTML = notes.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => `<p class="my-1">• ${line.trim().replace(/^•\s*/, '')}</p>`)
                .join('');
        } else {
            modalContent.innerHTML = `<p class="text-gray-500">Belum ada catatan untuk pelanggan ini.</p>`;
        }
    }

    function showCustomerNotes(customer) {
        document.getElementById('notes-modal-customer-name').textContent = customer.name;
        setNotesModalMode('view');
        updateNotesModalContent(customer);
        openModal(customerNotesModal);
    }

    function updateDetailModalContent(customer) {
        selectedCustomer = customer;
        const priority = calculatePriority(customer);
        const contactStatusDisplay = getContactStatusDisplay(customer);
        const serviceDays = getDaysUntilService(customer);
        const mostRecentServiceDate = getMostRecentService(customer.services);

        const allServicesSorted = customer.services
            ? [...customer.services]
                .filter(s => s.status !== 'UPCOMING')
                .sort((a, b) => new Date(b.date) - new Date(a.date))
            : [];

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
        document.getElementById('detail-modal-notes').textContent = customer.notes || 'Tidak ada catatan servis';

        const historyContainer = document.getElementById('detail-modal-history');
        if (allServicesSorted.length > 0) {
            historyContainer.innerHTML = `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-100">
                        <tr>
                            <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                            <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                            <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teknisi</th>
                            <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${allServicesSorted.map(service => `
                            <tr>
                                <td class="px-3 py-2 whitespace-nowrap">${formatDate(service.date)}</td>
                                <td class="px-3 py-2 whitespace-nowrap"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${service.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">${service.status}</span></td>
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
                </table>
            `;
        } else {
            historyContainer.innerHTML = 'Tidak ada riwayat servis.';
        }

        document.getElementById('detail-modal-call').dataset.phone = customer.phone;
        document.getElementById('detail-modal-update-contact').dataset.serviceId = customer.serviceID;
        document.getElementById('detail-modal-update-service').dataset.serviceId = customer.serviceID;
        document.getElementById('detail-modal-edit').dataset.customerId = customer.customerID;
        document.getElementById('detail-modal-delete').dataset.customerId = customer.customerID;
        document.getElementById('detail-modal-delete').dataset.customerName = customer.name;

        lucide.createIcons();
    }

    function showCustomerDetails(customer) {
        updateDetailModalContent(customer);
        openModal(customerDetailModal);
    }

    // --- Core Rendering Function ---
    function renderCustomers() {
        customerListContainer.className = currentView === 'bubble'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4'
            : 'flex flex-col gap-4';

        const dayInMs = 1000 * 60 * 60 * 24; // Standardize for consistency

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
                    case 'all':
                        return true;
                    case 'overdue':
                        return calculatePriority(customer) === 'Sangat Mendesak';
                    case 'upcoming': {
                        if (!customer.nextService) return false;
                        const nextServiceDate = new Date(customer.nextService);
                        if (isNaN(nextServiceDate.getTime())) return false;
                        const daysDiff = Math.ceil((nextServiceDate - today) / dayInMs);
                        return daysDiff >= 0 && daysDiff <= 30;
                    }
                    // LOGIKA BARU DITAMBAHKAN DI SINI
                    case 'upcoming_2_months': {
                        if (!customer.nextService) return false;
                        const nextServiceDate = new Date(customer.nextService);
                        if (isNaN(nextServiceDate.getTime())) return false;
                        const daysDiff = Math.ceil((nextServiceDate - today) / dayInMs);
                        // Filter untuk rentang waktu 0 hingga 60 hari
                        return daysDiff >= 0 && daysDiff <= 60;
                    }
                    case 'contacted': {
                        if (!customer.nextService) return false;
                        const hasCompletedService = customer.services.some(s => s.status === 'COMPLETED' && new Date(s.date) <= today);
                        if (!hasCompletedService) return false;
                        const nextServiceDate = new Date(customer.nextService);
                        if (isNaN(nextServiceDate.getTime())) return false;
                        const daysDiff = Math.ceil((nextServiceDate - today) / dayInMs);
                        return daysDiff > 30;
                    }
                    case 'not_contacted': {
                        if (customer.status !== 'UPCOMING' || !customer.nextService) return false;
                        const nextServiceDate = new Date(customer.nextService);
                        if (isNaN(nextServiceDate.getTime())) return false;
                        const daysDiff = Math.ceil((nextServiceDate - today) / dayInMs);
                        return daysDiff <= 30;
                    }
                    case 'contact_overdue':
                        return customer.status === 'OVERDUE';
                    default:
                        return true;
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
            card.className = `bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow ${currentView === 'bubble' ? 'p-4' : 'flex items-center justify-between p-4'}`;

            if (currentView === 'bubble') {
                card.innerHTML = `
                <div data-action="open-details" class="cursor-pointer">
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-lg font-bold text-gray-900 truncate">${customer.name}</h3>
                        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)}">${priority}</span>
                    </div>
                    <div class="space-y-1">
                        <div class="flex items-center gap-2 text-sm text-gray-600">
                            <i data-lucide="map-pin" class="w-4 h-4"></i>
                            <span class="truncate">${customer.kota || 'N/A'}</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-gray-600">
                            <i data-lucide="calendar" class="w-4 h-4"></i>
                            <span>${formatDate(customer.nextService)}</span>
                        </div>
                    </div>
                </div>
                <div class="border-t mt-3 pt-2 flex justify-end">
                    <button data-action="view-notes" title="Lihat Catatan Pelanggan" class="text-gray-500 hover:text-blue-600 p-1 rounded-full transition-colors">
                        <i data-lucide="notebook-text" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>
            `;
            } else {
                card.innerHTML = `
                <div data-action="open-details" class="flex items-center gap-4 flex-grow min-w-0 cursor-pointer">
                    <h3 class="text-lg font-bold text-gray-900 truncate">${customer.name}</h3>
                    <div class="relative pl-4 data-separator hidden md:block">
                        <span class="text-sm font-medium text-gray-600">${customer.kota || 'N/A'}</span>
                    </div>
                    <div class="relative pl-4 data-separator flex-grow min-w-0">
                        <span class="text-sm font-medium text-gray-600 truncate">Servis Berikutnya: <span class="font-bold">${formatDate(customer.nextService)}</span></span>
                    </div>
                </div>
                <div class="flex-shrink-0 flex items-center gap-3 pl-4">
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)}">${priority}</span>
                    <button data-action="view-notes" title="Lihat Catatan Pelanggan" class="text-gray-500 hover:text-blue-600 p-1 rounded-full transition-colors">
                         <i data-lucide="notebook-text" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>
            `;
            }
            customerListContainer.appendChild(card);
        });

        document.getElementById('stats-total').textContent = customers.length;
        document.getElementById('stats-overdue').textContent = customers.filter(c => calculatePriority(c) === 'Sangat Mendesak').length;
        document.getElementById('stats-due-month').textContent = customers.filter(c => {
            if (!c.nextService) return false;
            const d = new Date(c.nextService);
            if (isNaN(d.getTime())) return false;
            const diff = Math.ceil((d - today) / dayInMs);
            return diff >= 0 && diff <= 30;
        }).length;
        document.getElementById('stats-contact-overdue').textContent = customers.filter(c => c.status === 'OVERDUE').length;

        const contactedCount = customers.filter(c => {
            if (!c.nextService) return false;
            const hasCompletedService = c.services.some(s => s.status === 'COMPLETED' && new Date(s.date) <= today);
            if (!hasCompletedService) return false;
            const nextServiceDate = new Date(c.nextService);
            if (isNaN(nextServiceDate.getTime())) return false;
            const daysDiff = Math.ceil((nextServiceDate - today) / dayInMs);
            return daysDiff > 30;
        }).length;
        document.getElementById('stats-contacted').textContent = contactedCount;

        const notContactedCount = customers.filter(c => {
            if (c.status !== 'UPCOMING' || !c.nextService) return false;
            const nextServiceDate = new Date(c.nextService);
            if (isNaN(nextServiceDate.getTime())) return false;
            const daysDiff = Math.ceil((nextServiceDate - today) / dayInMs);
            return daysDiff <= 30;
        }).length;
        document.getElementById('stats-not-contacted').textContent = notContactedCount;

        lucide.createIcons();
    };

    function setupAndOpenServiceModal(customer) {
        selectedCustomer = customer;
        document.getElementById('service-modal-customer-name').textContent = customer.name;
        const currentDate = customer.nextService ? new Date(customer.nextService).toISOString().split('T')[0] : '';
        document.getElementById('service-modal-date').value = currentDate;
        document.getElementById('service-modal-handler').value = customer.handler || '';
        openModal(updateServiceModal);
    }

    function setupAndOpenContactModal(customer) {
        selectedCustomer = customer;
        document.getElementById('contact-modal-name').textContent = customer.name;
        document.getElementById('contact-modal-phone').textContent = customer.phone;
        const statusMap = { 'UPCOMING': 'not_contacted', 'COMPLETED': 'contacted', 'OVERDUE': 'overdue' };
        document.getElementById('contact-modal-status').value = statusMap[customer.status] || 'not_contacted';
        document.getElementById('contact-modal-notes').value = customer.notes || '';
        postponeDurationContainer.classList.add('hidden');
        refusalFollowUpContainer.classList.add('hidden');
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

    // Fungsi generic untuk handle API call yang tidak butuh kembali ke detail
    async function handleApiCall(apiFunction, data, successMessage, errorMessagePrefix) {
        showLoading();
        try {
            const result = await apiFunction(activeSheetId, data);
            if (result.success) {
                if (successMessage) alert(successMessage);
                initializeApp({ keepFilters: true });
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
            currentView = 'bubble';
            localStorage.setItem('customerView', 'bubble');
            updateViewButtons();
            renderCustomers();
        });

        viewListBtn.addEventListener('click', () => {
            currentView = 'list';
            localStorage.setItem('customerView', 'list');
            updateViewButtons();
            renderCustomers();
        });

        document.getElementById('add-customer-btn').addEventListener('click', setupAndOpenAddCustomerModal);
        document.getElementById('refresh-btn').addEventListener('click', () => initializeApp());
        document.getElementById('retry-btn').addEventListener('click', () => initializeApp());
        document.getElementById('export-data-btn').addEventListener('click', () => handleApiCall(window.electronAPI.exportData, null, 'Data berhasil diekspor!', 'Gagal mengekspor data'));
        document.getElementById('import-data-btn').addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin mengimpor data? Ini akan menambahkan data baru dari file.')) {
                handleApiCall(window.electronAPI.importData, null, 'Proses impor selesai!', 'Gagal mengimpor data');
            }
        });

        contactModalStatus.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            postponeDurationContainer.classList.toggle('hidden', selectedValue !== 'postponed');
            refusalFollowUpContainer.classList.toggle('hidden', selectedValue !== 'refused');
        });

        customerListContainer.addEventListener('click', (e) => {
            const card = e.target.closest('div[data-customer-id]');
            if (!card) return;

            const customerId = card.dataset.customerId;
            const customer = customers.find(c => c.customerID === customerId);
            if (!customer) return;

            const actionTarget = e.target.closest('[data-action]');

            if (actionTarget) {
                const action = actionTarget.getAttribute('data-action');
                if (action === 'view-notes') {
                    showCustomerNotes(customer);
                } else if (action === 'open-details') {
                    showCustomerDetails(customer);
                }
            }
        });

        customerDetailModal.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;

            switch (action) {
                case 'call':
                    window.electronAPI.openWhatsapp(button.dataset.phone);
                    break;
                case 'update-contact':
                    setupAndOpenContactModal(selectedCustomer);
                    break;
                case 'update-service':
                    setupAndOpenServiceModal(selectedCustomer);
                    break;
                case 'edit-customer':
                    setupAndOpenUpdateCustomerModal(selectedCustomer);
                    break;
                case 'delete-customer':
                    if (confirm(`Yakin ingin menghapus ${button.dataset.customerName}? Semua riwayat servis juga akan terhapus.`)) {
                        handleApiCall(window.electronAPI.deleteCustomer, button.dataset.customerId, 'Pelanggan berhasil dihapus!', 'Gagal menghapus pelanggan');
                    }
                    break;
                case 'close':
                    closeModal(customerDetailModal);
                    break;
            }
        });

        document.querySelector('#detail-modal-history').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action="edit-note"]');
            if (button) {
                setupAndOpenHistoryNoteModal(button.dataset);
            }
        });

        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="close"]')) {
                    closeModal(modal);
                }
            });
            modal.addEventListener('input', () => validateForm(modal));
            const form = modal.querySelector('form');
            if (form) {
                form.addEventListener('submit', e => e.preventDefault());
            }
        });

        // --- Event Listener Baru untuk Modal Catatan ---
        document.getElementById('edit-notes-btn').addEventListener('click', () => {
            setNotesModalMode('edit');
            const notesEditor = document.getElementById('notes-editor-textarea');
            const currentNotes = (selectedCustomer.customerNotes || '').split('\n')
                .filter(line => line.trim() !== '')
                .map(line => line.trim().startsWith('•') ? line.trim() : `• ${line.trim()}`)
                .join('\n');
            notesEditor.value = currentNotes;
            notesEditor.focus();
        });

        document.getElementById('cancel-edit-notes-btn').addEventListener('click', () => {
            setNotesModalMode('view');
        });

        document.getElementById('notes-editor-textarea').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const textarea = e.target;
                const { selectionStart, selectionEnd, value } = textarea;
                const newValue = `${value.substring(0, selectionStart)}\n• ${value.substring(selectionEnd)}`;
                textarea.value = newValue;
                textarea.selectionStart = textarea.selectionEnd = selectionStart + 3;
            }
        });

        document.getElementById('save-notes-btn').addEventListener('click', async () => {
            showLoading();

            const newNotes = document.getElementById('notes-editor-textarea').value
                .split('\n')
                .map(line => line.trim().replace(/^•\s*/, ''))
                .filter(line => line)
                .join('\n');

            const customerId = selectedCustomer.customerID;

            const updatedData = {
                customerNotes: newNotes
            };

            try {
                const result = await window.electronAPI.updateCustomer(activeSheetId, { customerID: customerId, updatedData });
                if (!result.success) {
                    throw new Error(result.error);
                }

                const refreshResult = await window.electronAPI.refreshData(activeSheetId);
                if (refreshResult.success) {
                    customers = refreshResult.data || [];
                    renderCustomers();

                    const updatedCustomer = customers.find(c => c.customerID === customerId);
                    if (updatedCustomer) {
                        showCustomerNotes(updatedCustomer);
                        setNotesModalMode('view');
                    } else {
                        closeModal(customerNotesModal);
                    }
                } else {
                    throw new Error(refreshResult.error || 'Gagal menyegarkan data setelah menyimpan.');
                }
            } catch (err) {
                alert(`Gagal menyimpan catatan: ${err.message}`);
                showCustomerNotes(selectedCustomer);
            } finally {
                hideLoading();
            }
        });


        async function saveDataAndRefreshDetails(modalToClose, apiFunction, data, successMessage, errorMessagePrefix, customerId) {
            showLoading();
            try {
                const result = await apiFunction(activeSheetId, data);
                if (result.success) {
                    alert(successMessage);
                    const refreshResult = await window.electronAPI.refreshData(activeSheetId);
                    if (refreshResult.success) {
                        customers = refreshResult.data || [];
                        renderCustomers();
                        const updatedCustomer = customers.find(c => c.customerID === customerId);
                        if (updatedCustomer) {
                            showCustomerDetails(updatedCustomer);
                        }
                    }
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

        document.getElementById('contact-modal-save').addEventListener('click', () => {
            const customerToUpdateId = selectedCustomer.customerID;
            const statusMap = { 'not_contacted': 'UPCOMING', 'contacted': 'CONTACTED', 'overdue': 'OVERDUE', 'postponed': 'POSTPONED', 'refused': 'REFUSED' };
            const data = {
                serviceID: selectedCustomer.serviceID,
                newStatus: statusMap[contactModalStatus.value],
                notes: document.getElementById('contact-modal-notes').value,
                postponeDuration: document.getElementById('contact-modal-postpone-duration').value,
                refusalFollowUp: document.getElementById('contact-modal-refusal-follow-up').value
            };
            saveDataAndRefreshDetails(updateContactModal, window.electronAPI.updateContactStatus, data, 'Status kontak berhasil diupdate!', 'Gagal mengupdate status', customerToUpdateId);
        });

        document.getElementById('service-modal-save').addEventListener('click', () => {
            const customerToUpdateId = selectedCustomer.customerID;
            const data = {
                serviceID: selectedCustomer.serviceID,
                newDate: document.getElementById('service-modal-date').value,
                newHandler: document.getElementById('service-modal-handler').value
            };
            saveDataAndRefreshDetails(updateServiceModal, window.electronAPI.updateService, data, 'Layanan berhasil diperbarui!', 'Gagal memperbarui layanan', customerToUpdateId);
        });

        document.getElementById('history-note-modal-save').addEventListener('click', () => {
            const customerToUpdateId = selectedCustomer.customerID;
            const data = {
                serviceID: selectedServiceForNoteEdit.serviceId,
                newNotes: document.getElementById('history-note-modal-notes').value,
                newHandler: document.getElementById('history-note-modal-handler').value
            };
            saveDataAndRefreshDetails(updateHistoryNoteModal, window.electronAPI.updateHistoryNote, data, 'Catatan riwayat berhasil diperbarui!', 'Gagal memperbarui catatan', customerToUpdateId);
        });

        document.getElementById('update-modal-save').addEventListener('click', () => {
            const customerToUpdateId = selectedCustomer.customerID;
            const updatedData = {
                name: document.getElementById('update-modal-name').value,
                phone: document.getElementById('update-modal-phone').value,
                address: document.getElementById('update-modal-address').value,
                kota: document.getElementById('update-modal-kota').value,
            };
            const data = { customerID: customerToUpdateId, updatedData };
            saveDataAndRefreshDetails(updateCustomerModal, window.electronAPI.updateCustomer, data, 'Data pelanggan berhasil diupdate!', 'Gagal mengupdate data pelanggan', customerToUpdateId);
        });

        document.getElementById('add-modal-save').addEventListener('click', () => {
            const customerData = { name: document.getElementById('add-modal-name').value, phone: document.getElementById('add-modal-phone').value, address: document.getElementById('add-modal-address').value, kota: document.getElementById('add-modal-kota').value, customerNotes: document.getElementById('add-modal-customer-notes').value, nextService: document.getElementById('add-modal-nextService').value, handler: document.getElementById('add-modal-handler').value };
            handleApiCall(window.electronAPI.addCustomer, customerData, 'Pelanggan baru berhasil ditambahkan!', 'Gagal menambah pelanggan');
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const visibleModals = Array.from(modals).filter(m => !m.classList.contains('hidden'));
                if (visibleModals.length === 0) return;

                let topModal = visibleModals[0];
                if (visibleModals.length > 1) {
                    topModal = visibleModals.reduce((prev, current) => {
                        const prevZ = parseInt(window.getComputedStyle(prev).zIndex, 10) || 0;
                        const currentZ = parseInt(window.getComputedStyle(current).zIndex, 10) || 0;
                        return prevZ > currentZ ? prev : current;
                    });
                }
                closeModal(topModal);
            }
        });
    }

    // --- App Initialization ---
    async function initializeApp(options = {}) {
        const { keepFilters = false } = options;

        showLoading();
        errorIndicator.classList.add('hidden');
        customerListContainer.innerHTML = '';
        emptyState.classList.add('hidden');

        if (!activeSheetId) {
            console.error("Tidak ada ID sheet aktif. Menunggu data dari main process...");
            hideLoading();
            return;
        }

        try {
            const result = await window.electronAPI.refreshData(activeSheetId);
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
        }
    }

    setupEventListeners();
});