import React from 'react';
import { AlertCircle } from 'lucide-react';

const ErrorDisplay = ({ message, onRetry }) => (
    <div className="fixed inset-0 bg-gray-50 flex items-center justify-center z-50">
        <div className="text-center bg-white p-8 rounded-lg shadow-sm">
            <AlertCircle className="text-red-600 mx-auto mb-4 h-12 w-12" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button onClick={onRetry} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Try Again
            </button>
        </div>
    </div>
);

export default ErrorDisplay;