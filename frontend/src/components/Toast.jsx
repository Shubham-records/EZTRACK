"use client";
import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export default function Toast({ message, type = 'info', onClose }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
        // Cleanup handled by parent timeout, but we can animate out if needed.
        return () => setIsVisible(false);
    }, []);

    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-blue-600',
        warning: 'bg-yellow-600',
    };

    const icons = {
        success: <CheckCircle size={20} />,
        error: <AlertCircle size={20} />,
        info: <Info size={20} />,
        warning: <AlertCircle size={20} />,
    };

    return (
        <div
            className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded shadow-lg text-white transition-all duration-300 transform ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
                } ${bgColors[type] || bgColors.info}`}
            style={{ minWidth: '300px' }}
        >
            <div className="flex-shrink-0">
                {icons[type] || icons.info}
            </div>
            <div className="flex-1 text-sm font-medium">
                {message}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
                <X size={16} />
            </button>
        </div>
    );
}
