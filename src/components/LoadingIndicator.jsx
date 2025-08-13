import React from 'react';

const LoadingIndicator = () => (
    <div className="fixed inset-0 bg-gray-50 flex items-center justify-center z-50">
        <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading customer data...</p>
        </div>
    </div>
);

export default LoadingIndicator;