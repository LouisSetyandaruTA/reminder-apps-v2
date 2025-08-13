import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

const AddCustomerModal = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [nextService, setNextService] = useState('');

    useEffect(() => {
        // Reset form saat modal dibuka
        if (isOpen) {
            setName('');
            setPhone('');
            setAddress('');
            setNextService('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!name || !phone) {
            alert('Please provide customer name and phone number.');
            return;
        }
        onSave({ name, phone, address, nextService });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Add New Customer</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
                        <input value={name} onChange={(e) => setName(e.target.value)} type="text" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Enter customer name" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Phone Number *</label>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} type="text" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Enter phone number" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" rows="2" placeholder="Enter address"></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Next Service Date</label>
                        <input value={nextService} onChange={(e) => setNextService(e.target.value)} type="date" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center">
                        <Plus className="h-4 w-4 mr-2" /> Add Customer
                    </button>
                </div>
            </div>
        </div>
    );
};

export { AddCustomerModal }; // Ekspor sebagai named export