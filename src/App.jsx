import { useState, useEffect, useMemo } from 'react';
import { Bell, Search, Filter, Settings as SettingsIcon, Plus as PlusIcon, Calendar } from 'lucide-react';

const App = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterBy, setFilterBy] = useState('all');
    const [sortBy, setSortBy] = useState('nextService');

    const [isAddModalOpen, setAddModalOpen] = useState(false);
    const [isUpdateContactModalOpen, setUpdateContactModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Periksa apakah API dari preload.js sudah tersedia
            if (window.electronAPI) {
                const result = await window.electronAPI.refreshData();
                if (result.success) {
                    setCustomers(result.data);
                } else {
                    throw new Error(result.error || 'Unknown error from main process.');
                }
            } else {
                // Fallback jika dijalankan di browser biasa (untuk testing UI)
                console.warn("Electron API not found. Using mock data.");
                await new Promise(res => setTimeout(res, 1000));
                setCustomers([
                    { serviceID: 'SVC-001', rowIndex: 0, name: 'Budi (Mock)', address: 'Jl. Merdeka 1, Jakarta', phone: '6281234567890', nextService: '2025-07-20' },
                    { serviceID: 'SVC-002', rowIndex: 1, name: 'Citra (Mock)', address: 'Jl. Kemerdekaan 2, Bandung', phone: '6281298765432', nextService: '2025-08-25' },
                ]);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Logika filter dan sort (tidak berubah)
    const filteredAndSortedCustomers = useMemo(() => {
        // ... (logika ini sama seperti sebelumnya, tidak perlu diubah)
        return customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [customers, searchTerm, filterBy, sortBy]);

    const handleSaveCustomer = async (customerData) => {
        if (window.electronAPI) {
            const result = await window.electronAPI.addCustomer(customerData);
            if (result.success) {
                alert('Customer added successfully!');
                setAddModalOpen(false);
                fetchData(); // Muat ulang data
            } else {
                alert(`Failed to add customer: ${result.error}`);
            }
        }
    };

    const handleUpdateContact = async (updateInfo) => {
        if (window.electronAPI) {
            const result = await window.electronAPI.updateContactStatus(updateInfo);
            if (result.success) {
                alert('Contact status updated!');
                setUpdateContactModalOpen(false);
                fetchData(); // Muat ulang data
            } else {
                alert(`Failed to update status: ${result.error}`);
            }
        }
    };

    const handleCall = (phone) => {
        if (window.electronAPI) {
            window.electronAPI.openWhatsApp(phone);
        }
    }

    if (loading) return <LoadingIndicator />;
    if (error) return <ErrorDisplay message={error} onRetry={fetchData} />;

    return (
        <>
            <AddCustomerModal
                isOpen={isAddModalOpen}
                onClose={() => setAddModalOpen(false)}
                onSave={handleSaveCustomer}
            />
            <UpdateContactModal
                isOpen={isUpdateContactModalOpen}
                onClose={() => setUpdateContactModalOpen(false)}
                onSave={handleUpdateContact}
                customer={selectedCustomer}
            />

            <div className="min-h-screen p-6">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between mb-6">
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                                <SettingsIcon className="mr-3 text-blue-600" />
                                Reminder Water Heater
                            </h1>
                            <div className="flex gap-3">
                                <button onClick={() => setAddModalOpen(true)} className="flex items-center px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                                    <PlusIcon className="h-4 w-4 mr-2" /> Add Customer
                                </button>
                                <button onClick={fetchData} className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                    <Bell className="h-4 w-4 mr-2" /> Refresh
                                </button>
                            </div>
                        </div>
                        {/* Controls */}
                        <div className="flex flex-wrap gap-4 items-center border border-gray-200 rounded-lg p-3">
                            <div className="flex items-center flex-grow relative">
                                <Search className="text-gray-400 ml-2 h-5 w-5 absolute" />
                                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} type="text" placeholder="Search customers..." className="border-gray-300 rounded-lg px-3 py-2 pl-10 w-full focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            {/* ... (Filter dan Sort select tetap di sini) ... */}
                        </div>
                    </div>

                    {/* Customer List */}
                    <div className="space-y-4">
                        {filteredAndSortedCustomers.length > 0 ? (
                            filteredAndSortedCustomers.map(customer => (
                                <CustomerCard
                                    key={customer.serviceID || customer.rowIndex}
                                    customer={customer}
                                    onCall={handleCall}
                                    onUpdateContact={(cust) => { setSelectedCustomer(cust); setUpdateContactModalOpen(true); }}
                                    onUpdateService={(cust) => alert('Update Service Modal to be implemented')}
                                />
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <Calendar className="mx-auto text-gray-400 mb-4 h-12 w-12" />
                                <p className="text-gray-600">No customers match your current filters.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default App;