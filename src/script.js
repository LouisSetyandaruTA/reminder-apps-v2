document.addEventListener('DOMContentLoaded', () => {

    // --- MOCK ELECTRON API & DATA ---
    const getMockData = () => ([
        { rowIndex: 0, name: 'Budi Santoso', address: 'Jl. Merdeka 1, Jakarta', phone: '6281234567890', nextService: '2025-07-20', contactStatus: 'contacted', contactNotes: 'Confirmed for next week.', services: { 'Service 1': '2024-07-15' }, serviceColumns: ['Service 1', 'Service 2', 'Service 3'] },
        { rowIndex: 1, name: 'Citra Lestari', address: 'Jl. Kemerdekaan 2, Bandung', phone: '6281298765432', nextService: '2025-08-25', contactStatus: 'not_contacted', contactNotes: '', services: {}, serviceColumns: ['Service 1', 'Service 2', 'Service 3'] },
        { rowIndex: 2, name: 'Agus Wijaya', address: 'Jl. Pahlawan 3, Surabaya', phone: '6281211223344', nextService: '2025-09-05', contactStatus: 'overdue', contactNotes: 'Called twice, no answer.', services: { 'Service 1': '2024-08-01' }, serviceColumns: ['Service 1', 'Service 2', 'Service 3'] },
        { rowIndex: 3, name: 'Dewi Anggraini', address: 'Jl. Nusantara 4, Medan', phone: '6281255667788', nextService: '2026-01-10', contactStatus: null, contactNotes: '', services: {}, serviceColumns: ['Service 1', 'Service 2', 'Service 3'] },
        { rowIndex: 4, name: 'Eko Prasetyo', address: 'Jl. Garuda 5, Makassar', phone: '6281244332211', nextService: null, contactStatus: 'not_contacted', contactNotes: '', services: {}, serviceColumns: ['Service 1', 'Service 2', 'Service 3'] }
    ]);
    
    // --- APPLICATION STATE ---
    let customers = [];
    let selectedCustomer = null;
    let sortBy = 'nextService';
    let filterBy = 'all';
    let searchTerm = '';
    
    // --- MOCK API ---
    const electronAPI = {
        refreshData: async () => {
            await new Promise(res => setTimeout(res, 500));
            customers = getMockData();
            return { success: true, data: customers };
        },
        updateService: async ({ rowIndex, serviceColumn, newDate }) => {
            const customer = customers.find(c => c.rowIndex === rowIndex);
            if (customer) {
                if (!customer.services) customer.services = {};
                customer.services[serviceColumn] = newDate;
                return { success: true };
            }
            return { success: false, error: 'Customer not found.' };
        },
        updateContactStatus: async ({ rowIndex, status, contactDate, notes }) => {
            const customer = customers.find(c => c.rowIndex === rowIndex);
            if (customer) {
                customer.contactStatus = status;
                customer.contactNotes = notes;
                return { success: true };
            }
            return { success: false, error: 'Customer not found.' };
        },
        addCustomer: async (customerData) => {
            const newCustomer = {
                ...customerData,
                rowIndex: customers.length ? Math.max(...customers.map(c => c.rowIndex)) + 1 : 0,
                services: {},
                serviceColumns: ['Service 1', 'Service 2', 'Service 3', 'Service 4'],
                contactStatus: 'not_contacted',
                contactNotes: ''
            };
            customers.push(newCustomer);
            return { success: true };
        },
        openWhatsApp: (phoneNumber) => {
            if (!phoneNumber) return;
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            window.open(`https://wa.me/${cleanPhone}`, '_blank');
        }
    };

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
        if (!customer.nextService) return 'Low';
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Low';
        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return 'High';
        if (daysDiff <= 7) return 'High';
        if (daysDiff <= 30) return 'Medium';
        return 'Low';
    };

    const getContactStatusDisplay = (customer) => {
        const nextService = new Date(customer.nextService);
        if (customer.contactStatus === 'contacted' && !isNaN(nextService.getTime()) && nextService < today) {
            return { color: 'bg-red-100 text-red-800', icon: 'alert-circle', text: 'Not Contacted' };
        }
        switch (customer.contactStatus) {
            case 'contacted': return { color: 'bg-green-100 text-green-800', icon: 'check-circle', text: 'Contacted' };
            case 'overdue': return { color: 'bg-red-100 text-red-800', icon: 'alert-circle', text: 'Contact Overdue' };
            default: return { color: 'bg-gray-100 text-gray-800', icon: 'clock', text: 'Not Contacted' };
        }
    };
    
    const getDaysUntilService = (customer) => {
        if (!customer.nextService) return 'No date set';
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Invalid date';
        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return `Overdue by ${Math.abs(daysDiff)} days`;
        if (daysDiff === 0) return 'Due today';
        return `Due in ${daysDiff} days`;
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'High': return 'bg-red-100 text-red-800';
            case 'Medium': return 'bg-yellow-100 text-yellow-800';
            case 'Low': return 'bg-green-100 text-green-800';
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
                if (!customer.name) return false;
                const lowerSearchTerm = searchTerm.toLowerCase();
                const matchesSearch = customer.name.toLowerCase().includes(lowerSearchTerm) ||
                    (customer.address && customer.address.toLowerCase().includes(lowerSearchTerm)) ||
                    (customer.phone && customer.phone.toLowerCase().includes(lowerSearchTerm));
                if (!matchesSearch) return false;
                switch(filterBy) {
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
                    case 'contacted': return customer.contactStatus === 'contacted';
                    case 'not_contacted': return !customer.contactStatus || customer.contactStatus === 'not_contacted';
                    case 'contact_overdue': return customer.contactStatus === 'overdue';
                    default: return true;
                }
            })
            .sort((a, b) => {
                if (sortBy === 'nextService') {
                    const dateA = new Date(a.nextService);
                    const dateB = new Date(b.nextService);
                    if (isNaN(dateA.getTime())) return 1;
                    if (isNaN(dateB.getTime())) return -1;
                    return dateA - dateB;
                }
                if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
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
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)} mr-2">${priority} Priority</span>
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${contactStatusDisplay.color} flex items-center">
                                <i data-lucide="${contactStatusDisplay.icon}" class="w-3.5 h-3.5"></i>
                                <span class="ml-1.5">${contactStatusDisplay.text}</span>
                            </span>
                        </div>
                        <div class="space-y-4 text-sm">
                            <div>
                                <p class="text-gray-500">Next Reminder</p>
                                <p class="font-semibold text-gray-800">${formatDate(customer.nextService)} - <span class="text-blue-600">${serviceDays}</span></p>
                            </div>
                            <div>
                                <p class="text-gray-500">Address</p>
                                <p class="font-semibold text-gray-800">${customer.address || 'N/A'}</p>
                            </div>
                            <div>
                                <p class="text-gray-500">Phone</p>
                                <p class="font-semibold text-gray-800">${customer.phone || 'N/A'}</p>
                            </div>
                            <div class="grid grid-cols-3 gap-4 pt-1">
                                <div><p class="text-gray-500">Last Service</p><p class="font-semibold text-gray-800">${formatDate(mostRecentService)}</p></div>
                                <div><p class="text-gray-500">Next Service</p><p class="font-semibold text-gray-800">${formatDate(customer.nextService)}</p></div>
                                <div><p class="text-gray-500">Service Status</p><p class="font-semibold text-blue-600">${serviceDays}</p></div>
                            </div>
                            <div>
                                <p class="text-gray-500">Last Contact</p>
                                <p class="font-semibold text-gray-800">${customer.contactNotes || 'Never Contacted'}</p>
                            </div>
                        </div>
                        <div class="mt-4">
                            <details class="group text-sm">
                                <summary class="font-medium text-gray-600 cursor-pointer hover:text-gray-900 list-none">
                                    <span class="group-open:hidden">Show Service History</span>
                                    <span class="hidden group-open:inline">Hide Service History</span>
                                </summary>
                                <div class="mt-2 text-xs bg-gray-50 p-2 rounded border">
                                    ${Object.keys(customer.services || {}).length > 0 ? Object.entries(customer.services).map(([key, value]) => `<div><span class="text-gray-500">${key}:</span> ${formatDate(value)}</div>`).join('') : 'No service history.'}
                                </div>
                            </details>
                        </div>
                    </div>
                    <div class="w-full md:w-auto md:min-w-[190px] flex flex-row md:flex-col gap-2 pt-2 md:pt-0">
                        <button data-action="call" data-phone="${customer.phone}" class="flex-1 md:w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-green-600 text-green-600 hover:bg-green-50 transition-colors">
                            <i data-lucide="message-circle" class="w-4 h-4 mr-2"></i> Contact via Whatsapp
                        </button>
                        <button data-action="update-contact" data-row-index="${customer.rowIndex}" class="flex-1 md:w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-purple-600 text-purple-600 hover:bg-purple-50 transition-colors">
                            <i data-lucide="user-check" class="w-4 h-4 mr-2"></i> Update Contact Status
                        </button>
                        <button data-action="update-service" data-row-index="${customer.rowIndex}" class="flex-1 md:w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors">
                            <i data-lucide="settings" class="w-4 h-4 mr-2"></i> Update Services
                        </button>
                    </div>
                </div>`;
            customerListContainer.appendChild(card);
        });

        document.getElementById('stats-total').textContent = customers.length;
        document.getElementById('stats-overdue').textContent = customers.filter(c => { const d = new Date(c.nextService); return !isNaN(d.getTime()) && d < today; }).length;
        document.getElementById('stats-due-month').textContent = customers.filter(c => { const d = new Date(c.nextService); if(isNaN(d.getTime())) return false; const diff = Math.ceil((d - today) / (1000*60*60*24)); return diff >= 0 && diff <= 30; }).length;
        document.getElementById('stats-contacted').textContent = customers.filter(c => c.contactStatus === 'contacted').length;
        document.getElementById('stats-not-contacted').textContent = customers.filter(c => !c.contactStatus || c.contactStatus === 'not_contacted').length;
        document.getElementById('stats-contact-overdue').textContent = customers.filter(c => c.contactStatus === 'overdue').length;

        lucide.createIcons();
    };

    // --- MODAL HANDLING ---
    function openModal(modal) { modal.classList.remove('hidden'); }
    function closeModal(modal) { modal.classList.add('hidden'); }

    modalsContainer.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            closeModal(e.target.closest('.fixed'));
        }
    });

    function setupAndOpenServiceModal(customer) {
        selectedCustomer = customer;
        const select = document.getElementById('service-modal-select');
        select.innerHTML = '<option value="" disabled selected>Select service slot</option>';
        customer.serviceColumns.forEach(col => {
            select.add(new Option(col, col));
        });
        document.getElementById('service-modal-date').value = new Date().toISOString().split('T')[0];
        openModal(updateServiceModal);
    }

    function setupAndOpenContactModal(customer) {
        selectedCustomer = customer;
        document.getElementById('contact-modal-name').textContent = customer.name;
        document.getElementById('contact-modal-phone').textContent = customer.phone;
        document.getElementById('contact-modal-status').value = customer.contactStatus || 'not_contacted';
        document.getElementById('contact-modal-notes').value = customer.contactNotes || '';
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
        const customer = customers.find(c => c.rowIndex === parseInt(button.dataset.rowIndex, 10));

        if (action === 'call') electronAPI.openWhatsApp(button.dataset.phone);
        else if (action === 'update-service' && customer) setupAndOpenServiceModal(customer);
        else if (action === 'update-contact' && customer) setupAndOpenContactModal(customer);
    });
    
    document.getElementById('service-modal-save').addEventListener('click', async () => {
        const serviceColumn = document.getElementById('service-modal-select').value;
        const newDate = document.getElementById('service-modal-date').value;
        if (!serviceColumn || !newDate) return alert('Please select a service slot and a date.');
        
        const result = await electronAPI.updateService({ rowIndex: selectedCustomer.rowIndex, serviceColumn, newDate });
        if (result.success) {
            alert('Service updated successfully!');
            closeModal(updateServiceModal);
            initializeApp();
        } else {
            alert(`Service update failed: ${result.error}`);
        }
    });

    document.getElementById('contact-modal-save').addEventListener('click', async () => {
        const result = await electronAPI.updateContactStatus({
            rowIndex: selectedCustomer.rowIndex,
            status: document.getElementById('contact-modal-status').value,
            contactDate: new Date().toISOString().split('T')[0],
            notes: document.getElementById('contact-modal-notes').value
        });
        if (result.success) {
            alert('Contact status updated successfully!');
            closeModal(updateContactModal);
            initializeApp();
        } else {
            alert(`Contact status update failed: ${result.error}`);
        }
    });

    document.getElementById('add-modal-save').addEventListener('click', async () => {
        const customerData = {
            name: document.getElementById('add-modal-name').value,
            phone: document.getElementById('add-modal-phone').value,
            address: document.getElementById('add-modal-address').value,
            nextService: document.getElementById('add-modal-nextService').value,
        };
        if (!customerData.name || !customerData.phone) return alert('Please provide customer name and phone number.');
        
        const result = await electronAPI.addCustomer(customerData);
        if (result.success) {
            alert('Customer added successfully!');
            closeModal(addCustomerModal);
            initializeApp();
        } else {
            alert(`Failed to add customer: ${result.error}`);
        }
    });

    // --- INITIALIZATION ---
    async function initializeApp() {
        loadingIndicator.classList.remove('hidden');
        errorIndicator.classList.add('hidden');
        try {
            const result = await electronAPI.refreshData();
            if (result.success) {
                renderCustomers();
            } else {
                throw new Error(result.error || 'Unknown error occurred.');
            }
        } catch (err) {
            errorMessage.textContent = err.message;
            errorIndicator.classList.remove('hidden');
        } finally {
            loadingIndicator.classList.add('hidden');
            lucide.createIcons();
        }
    }

    initializeApp();
});