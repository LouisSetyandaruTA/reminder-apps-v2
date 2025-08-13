import { Settings, MessageCircle, UserCheck } from 'lucide-react';

const CustomerCard = ({ customer, onCall, onUpdateContact, onUpdateService }) => {

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

    const getDaysUntilService = (customer) => {
        if (!customer.nextService) return 'No date set';
        const nextServiceDate = new Date(customer.nextService);
        if (isNaN(nextServiceDate.getTime())) return 'Invalid date';
        const daysDiff = Math.ceil((nextServiceDate - today) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0) return `Overdue by ${Math.abs(daysDiff)} days`;
        if (daysDiff === 0) return 'Due today';
        return `Due in ${daysDiff} days`;
    };

    const priority = calculatePriority(customer);
    const mostRecentService = getMostRecentService(customer.services);
    const serviceDays = getDaysUntilService(customer);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div className="flex-1 w-full">
                    {/* Customer Info */}
                    <div className="flex items-center mb-4 flex-wrap">
                        <h3 className="text-xl font-bold text-gray-900 mr-3">{customer.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(priority)} mr-2`}>
                            {priority} Priority
                        </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-4 text-sm">
                        {/* ... (detail lainnya seperti address, phone, dll.) ... */}
                        <div>
                            <p className="text-gray-500">Address</p>
                            <p className="font-semibold text-gray-800">{customer.address || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Phone</p>
                            <p className="font-semibold text-gray-800">{customer.phone || 'N/A'}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 pt-1">
                            <div><p className="text-gray-500">Last Service</p><p className="font-semibold text-gray-800">{formatDate(mostRecentService)}</p></div>
                            <div><p className="text-gray-500">Next Service</p><p className="font-semibold text-gray-800">{formatDate(customer.nextService)}</p></div>
                            <div><p className="text-gray-500">Service Status</p><p className="font-semibold text-blue-600">{serviceDays}</p></div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="w-full md:w-auto md:min-w-[190px] flex flex-row md:flex-col gap-2 pt-2 md:pt-0">
                    <button onClick={() => onCall(customer.phone)} className="flex-1 md:w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-green-600 text-green-600 hover:bg-green-50 transition-colors">
                        <MessageCircle className="w-4 h-4 mr-2" /> Contact via Whatsapp
                    </button>
                    <button onClick={() => onUpdateContact(customer)} className="flex-1 md:w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-purple-600 text-purple-600 hover:bg-purple-50 transition-colors">
                        <UserCheck className="w-4 h-4 mr-2" /> Update Contact Status
                    </button>
                    <button onClick={() => onUpdateService(customer)} className="flex-1 md:w-full px-3 py-2 text-sm rounded-md flex items-center justify-center whitespace-nowrap border border-blue-600 text-blue-600 hover:bg-blue-50 transition-colors">
                        <Settings className="w-4 h-4 mr-2" /> Update Services
                    </button>
                </div>
            </div>
        </div>
    );
};