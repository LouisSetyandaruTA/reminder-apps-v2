import React, { useState, useEffect } from 'react';
import { Bell, Calendar, CheckCircle, AlertCircle, Phone, Search, Filter, Settings, Save, X, MessageCircle, Clock, UserCheck, Plus } from 'lucide-react';

const UpdateServiceModal = ({ isOpen, onClose, customer, onSave }) => {
    const [selectedService, setSelectedService] = useState('');
    const [serviceDate, setServiceDate] = useState('');

    useEffect(() => {
        if (isOpen) {
            const today = new Date().toISOString().split('T')[0];
            setServiceDate(today);
            setSelectedService('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!selectedService || !serviceDate) {
            alert('Please select a service slot and a date.');
            return;
        }
        onSave({ rowIndex: customer.rowIndex, serviceColumn: selectedService, newDate: serviceDate });
    };

    const serviceColumns = customer?.serviceColumns || [];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Update Service</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                        <X size={20} />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Service Slot</label>
                        <select
                            value={selectedService}
                            onChange={(e) => setSelectedService(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                            <option value="" disabled>Select service slot</option>
                            {serviceColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Service Date</label>
                        <input
                            type="date"
                            value={serviceDate}
                            onChange={(e) => setServiceDate(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center">
                        <Save size={16} className="mr-2" /> Save
                    </button>
                </div>
            </div>
        </div>
    );
};

const UpdateContactModal = ({ isOpen, onClose, customer, onSave }) => {
    const [contactStatus, setContactStatus] = useState('');
    const [contactNotes, setContactNotes] = useState('');

    useEffect(() => {
        if (isOpen && customer) {
            setContactStatus(customer.contactStatus || 'not_contacted');
            setContactNotes(customer.contactNotes || '');
        }
    }, [isOpen, customer]);

    if (!isOpen) return null;

    const handleSave = () => {
        const today = new Date().toISOString().split('T')[0];
        onSave({
            rowIndex: customer.rowIndex,
            status: contactStatus,
            contactDate: contactStatus === 'contacted' ? today : null,
            notes: contactNotes,
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Update Contact Status</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                        <X size={20} />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-medium">{customer?.name}</h3>
                        <p className="text-sm text-gray-600">{customer?.phone}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Status</label>
                        <select
                            value={contactStatus}
                            onChange={(e) => setContactStatus(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                            <option value="not_contacted">Not Contacted</option>
                            <option value="contacted">Contacted</option>
                            <option value="overdue">Overdue (No Response)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                            value={contactNotes}
                            onChange={(e) => setContactNotes(e.target.value)}
                            placeholder="Add contact notes..."
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                            rows="3"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center">
                        <Save size={16} className="mr-2" /> Update
                    </button>
                </div>
            </div>
        </div>
    );
};

const AddCustomerModal = ({ isOpen, onClose, onSave }) => {
    const [customerData, setCustomerData] = useState({
        name: '', address: '', phone: '', nextService: ''
    });

    useEffect(() => {
        if (isOpen) {
            setCustomerData({ name: '', address: '', phone: '', nextService: '' });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!customerData.name || !customerData.phone) {
            alert('Please provide customer name and phone number.');
            return;
        }
        onSave(customerData);
    };

    const handleInputChange = (field, value) => {
        setCustomerData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Add New Customer</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full">
                        <X size={20} />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
                        <input
                            type="text"
                            value={customerData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="Enter customer name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Phone Number *</label>
                        <input
                            type="text"
                            value={customerData.phone}
                            onChange={(e) => handleInputChange('phone', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="Enter phone number"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea
                            value={customerData.address}
                            onChange={(e) => handleInputChange('address', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                            rows="2"
                            placeholder="Enter address"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Next Service Date</label>
                        <input
                            type="date"
                            value={customerData.nextService}
                            onChange={(e) => handleInputChange('nextService', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center">
                        <Plus size={16} className="mr-2" /> Add Customer
                    </button>
                </div>
            </div>
        </div>
    );
};

const CustomerServiceApp = () => {
    const [customers, setCustomers] = useState([]);
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [sortBy, setSortBy] = useState('nextService');
    const [filterBy, setFilterBy] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Listen for data from Electron main process
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onDataLoaded((event, data) => {
                setCustomers(data);
                setLoading(false);
                setError(null);
            });

            window.electronAPI.onDataError((event, errorMessage) => {
                setError(errorMessage);
                setLoading(false);
            });

            return () => {
                window.electronAPI.removeAllListeners('data-loaded');
                window.electronAPI.removeAllListeners('data-error');
            };
        }
    }, []);

    const refreshData = async () => {
        if (window.electronAPI) {
            setLoading(true);
            try {
                const result = await window.electronAPI.refreshData();
                if (result.success) {
                    setCustomers(result.data);
                    setError(null);
                } else {
                    setError(result.error);
                }
            } catch (err) {
                setError('Failed to refresh data');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleOpenServiceModal = (customer) => {
        setSelectedCustomer(customer);
        setIsServiceModalOpen(true);
    };

    const handleOpenContactModal = (customer) => {
        setSelectedCustomer(customer);
        setIsContactModalOpen(true);
    };

    const handleOpenAddCustomerModal = () => {
        setIsAddCustomerModalOpen(true);
    };

    const handleSaveServiceChanges = async (updateInfo) => {
        if (window.electronAPI) {
            const result = await window.electronAPI.updateService(updateInfo);
            if (result.success) {
                alert('Service updated successfully!');
                setIsServiceModalOpen(false);
                setSelectedCustomer(null);
                refreshData();
            } else {
                alert(`Service update failed: ${result.error}`);
            }
        } else {
            alert('Service updated successfully! (Demo mode)');
            setIsServiceModalOpen(false);
            setSelectedCustomer(null);
        }
    };

    const handleSaveContactChanges = async (updateInfo) => {
        if (window.electronAPI) {
            const result = await window.electronAPI.updateContactStatus(updateInfo);
            if (result.success) {
                alert('Contact status updated successfully!');
                setIsContactModalOpen(false);
                setSelectedCustomer(null);
                refreshData();
            } else {
                alert(`Contact status update failed: ${result.error}`);
            }
        } else {
            alert('Contact status updated successfully! (Demo mode)');
            setIsContactModalOpen(false);
            setSelectedCustomer(null);
        }
    };

    const handleAddCustomer = async (customerData) => {
        if (window.electronAPI) {
            const result = await window.electronAPI.addCustomer(customerData);
            if (result.success) {
                alert('Customer added successfully!');
                setIsAddCustomerModalOpen(false);
                refreshData();
            } else {
                alert(`Failed to add customer: ${result.error}`);
            }
        } else {
            const newCustomer = {
                ...customerData,
                services: {},
                serviceColumns: ['Service 1', 'Service 2', 'Service 3', 'Service 4'],
                rowIndex: customers.length
            };
            setCustomers(prev => [...prev, newCustomer]);
            alert('Customer added successfully! (Demo mode)');
            setIsAddCustomerModalOpen(false);
        }
    };

    const handleCallCustomer = (phoneNumber) => {
        if (window.electronAPI && phoneNumber) {
            window.electronAPI.openWhatsApp(phoneNumber);
        } else if (phoneNumber) {
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            window.open(`https://wa.me/${cleanPhone}`, '_blank');
        } else {
            alert('Phone number not available.');
        }
    };

    const getMostRecentService = (services) => {
        if (!services) return null;
        const serviceDates = Object.values(services)
            .filter(date => date && date.trim() !== '')
            .map(date => new Date(date))
            .filter(date => !isNaN(date.getTime()))
            .sort((a, b) => b - a);
        return serviceDates.length > 0 ? serviceDates[0] : null;
    };

    const calculatePriority = (customer) => {
        const today = new Date();
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Low';
        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return 'High';
        if (daysDiff <= 7) return 'High';
        if (daysDiff <= 30) return 'Medium';
        return 'Low';
    };

    const getContactStatusDisplay = (customer) => {
        const today = new Date();
        const nextService = new Date(customer.nextService);

        if (customer.contactStatus === 'contacted' && !isNaN(nextService.getTime()) && nextService < today) {
            return { status: 'overdue', color: 'bg-red-100 text-red-800', icon: <AlertCircle size={14} />, text: 'Not Contacted' };
        }

        switch (customer.contactStatus) {
            case 'contacted':
                return { status: 'contacted', color: 'bg-green-100 text-green-800', icon: <CheckCircle size={14} />, text: 'Contacted' };
            case 'overdue':
                return { status: 'overdue', color: 'bg-red-100 text-red-800', icon: <AlertCircle size={14} />, text: 'Contact Overdue' };
            default:
                return { status: 'not_contacted', color: 'bg-gray-100 text-gray-800', icon: <Clock size={14} />, text: 'Not Contacted' };
        }
    };

    const getDaysUntilService = (customer) => {
        if (!customer.nextService) return 'No date set';
        const today = new Date();
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Invalid date';
        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return `Overdue by ${Math.abs(daysDiff)} days`;
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

    const sortedAndFilteredCustomers = customers
        .filter(customer => {
            if (!customer.name) return false;
            const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (customer.address && customer.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (customer.phone && customer.phone.toLowerCase().includes(searchTerm.toLowerCase()));

            if (filterBy === 'all') return matchesSearch;
            if (filterBy === 'overdue') {
                const nextServiceDate = new Date(customer.nextService);
                const isOverdue = !isNaN(nextServiceDate.getTime()) && nextServiceDate < new Date();
                return isOverdue && matchesSearch;
            }
            if (filterBy === 'upcoming') {
                const nextServiceDate = new Date(customer.nextService);
                if (isNaN(nextServiceDate.getTime())) return false;
                const daysDiff = Math.ceil((nextServiceDate - new Date()) / (1000 * 60 * 60 * 24));
                return daysDiff > 0 && daysDiff <= 30 && matchesSearch;
            }
            if (filterBy === 'contacted') return customer.contactStatus === 'contacted' && matchesSearch;
            if (filterBy === 'not_contacted') return (!customer.contactStatus || customer.contactStatus === 'not_contacted') && matchesSearch;
            if (filterBy === 'contact_overdue') return customer.contactStatus === 'overdue' && matchesSearch;
            return matchesSearch;
        })
        .sort((a, b) => {
            if (sortBy === 'nextService') {
                const dateA = new Date(a.nextService);
                const dateB = new Date(b.nextService);
                if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
                if (isNaN(dateA.getTime())) return 1;
                if (isNaN(dateB.getTime())) return -1;
                return dateA - dateB;
            }
            if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
            return 0;
        });

    // Calculate statistics
    const stats = {
        total: customers.length,
        overdue: customers.filter(c => {
            const nextServiceDate = new Date(c.nextService);
            return !isNaN(nextServiceDate.getTime()) && nextServiceDate < new Date();
        }).length,
        dueThisMonth: customers.filter(c => {
            const nextServiceDate = new Date(c.nextService);
            if (isNaN(nextServiceDate.getTime())) return false;
            const daysDiff = Math.ceil((nextServiceDate - new Date()) / (1000 * 60 * 60 * 24));
            return daysDiff > 0 && daysDiff <= 30;
        }).length,
        contacted: customers.filter(c => c.contactStatus === 'contacted').length,
        notContacted: customers.filter(c => !c.contactStatus || c.contactStatus === 'not_contacted').length,
        contactOverdue: customers.filter(c => c.contactStatus === 'overdue').length
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading customer data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center bg-white p-8 rounded-lg shadow-sm">
                    <AlertCircle className="text-red-600 mx-auto mb-4" size={48} />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button onClick={refreshData} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <UpdateServiceModal
                isOpen={isServiceModalOpen}
                onClose={() => { setIsServiceModalOpen(false); setSelectedCustomer(null); }}
                customer={selectedCustomer}
                onSave={handleSaveServiceChanges}
            />

            <UpdateContactModal
                isOpen={isContactModalOpen}
                onClose={() => { setIsContactModalOpen(false); setSelectedCustomer(null); }}
                customer={selectedCustomer}
                onSave={handleSaveContactChanges}
            />

            <AddCustomerModal
                isOpen={isAddCustomerModalOpen}
                onClose={() => setIsAddCustomerModalOpen(false)}
                onSave={handleAddCustomer}
            />

            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                            <Settings className="mr-3 text-blue-600" size={28} />
                            Reminder Water Heater
                        </h1>
                        <div className="flex gap-3">
                            <button
                                onClick={handleOpenAddCustomerModal}
                                className="flex items-center px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                                <Plus size={16} className="mr-2" />
                                Add Customer
                            </button>
                            <button
                                onClick={refreshData}
                                className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                <Bell size={16} className="mr-2" />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                        <div className="bg-blue-50 p-4 rounded-lg text-center">
                            <p className="text-blue-600 text-sm font-medium">Total Customers</p>
                            <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
                        </div>
                        <div className="bg-red-50 p-4 rounded-lg text-center">
                            <p className="text-red-600 text-sm font-medium">Overdue Services</p>
                            <p className="text-2xl font-bold text-red-900">{stats.overdue}</p>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg text-center">
                            <p className="text-yellow-600 text-sm font-medium">Due This Month</p>
                            <p className="text-2xl font-bold text-yellow-900">{stats.dueThisMonth}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg text-center">
                            <p className="text-green-600 text-sm font-medium">Contacted</p>
                            <p className="text-2xl font-bold text-green-900">{stats.contacted}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg text-center">
                            <p className="text-gray-600 text-sm font-medium">Not Contacted</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.notContacted}</p>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg text-center">
                            <p className="text-purple-600 text-sm font-medium">Contact Overdue</p>
                            <p className="text-2xl font-bold text-purple-900">{stats.contactOverdue}</p>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center">
                            <Search className="text-gray-400 mr-2" size={18} />
                            <input
                                type="text"
                                placeholder="Search customers..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 w-64"
                            />
                        </div>

                        <div className="flex items-center">
                            <Filter className="text-gray-400 mr-2" size={18} />
                            <select
                                value={filterBy}
                                onChange={(e) => setFilterBy(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2"
                            >
                                <option value="all">All Customers</option>
                                <option value="overdue">Overdue Services</option>
                                <option value="upcoming">Due This Month</option>
                                <option value="contacted">Contacted</option>
                                <option value="not_contacted">Not Contacted</option>
                                <option value="contact_overdue">Contact Overdue</option>
                            </select>
                        </div>

                        <div className="flex items-center">
                            <span className="text-gray-600 mr-2">Sort by:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2"
                            >
                                <option value="nextService">Next Service Date</option>
                                <option value="name">Customer Name</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Customer List */}
                <div className="space-y-4">
                    {sortedAndFilteredCustomers.map((customer, index) => {
                        const priority = calculatePriority(customer);
                        const mostRecentService = getMostRecentService(customer.services);
                        const contactStatusDisplay = getContactStatusDisplay(customer);
                        const serviceDays = getDaysUntilService(customer);

                        return (
                            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900 mr-3">{customer.name}</h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(priority)} mr-2`}>
                                                {priority} Priority
                                            </span>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${contactStatusDisplay.color} flex items-center`}>
                                                {contactStatusDisplay.icon}
                                                <span className="ml-1">{contactStatusDisplay.text}</span>
                                            </span>
                                        </div>

                                        <div className="mb-3">
                                            <p className="text-sm text-gray-600">Next Reminder</p>
                                            <p className="font-medium">
                                                {customer.nextService
                                                    ? `${new Date(customer.nextService).toLocaleDateString()} - ${serviceDays}`
                                                    : 'No reminder set'}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-3">
                                            <div>
                                                <p className="text-gray-600">Next Service</p>
                                                <p className="font-medium">
                                                    {customer.nextService && !isNaN(new Date(customer.nextService).getTime())
                                                        ? new Date(customer.nextService).toLocaleDateString()
                                                        : '2/11/2028'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Service Status</p>
                                                <p className="font-medium text-blue-600">{serviceDays}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Last Contact</p>
                                                <p className="font-medium">Never Contacted</p>
                                            </div>
                                        </div>

                                        {/* Service History Dropdown */}
                                        <div className="mb-3">
                                            <details className="group">
                                                <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                                                    Services History
                                                </summary>
                                                <div className="mt-2 text-xs bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-500">Servis 1:</span> 11/08/2020
                                                </div>
                                            </details>
                                        </div>
                                    </div>

                                    <div className="ml-4 flex flex-col gap-2">
                                        <button
                                            onClick={() => handleCallCustomer(customer.phone)}
                                            className="px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center whitespace-nowrap"
                                        >
                                            <MessageCircle size={14} className="mr-1" />
                                            Contact via Whatsapp
                                        </button>
                                        <button
                                            onClick={() => handleOpenContactModal(customer)}
                                            className="px-3 py-2 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center whitespace-nowrap"
                                        >
                                            <UserCheck size={14} className="mr-1" />
                                            Update Contact Status
                                        </button>
                                        <button
                                            onClick={() => handleOpenServiceModal(customer)}
                                            className="px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center whitespace-nowrap"
                                        >
                                            <Settings size={14} className="mr-1" />
                                            Update Services
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {sortedAndFilteredCustomers.length === 0 && (
                    <div className="text-center py-12">
                        <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                        <p className="text-gray-600">No customers match your current filters.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomerServiceApp;