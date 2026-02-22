import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", isDestructive = true }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isDestructive ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 'bg-primary/10 text-primary'}`}>
                        <AlertTriangle size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{title}</h2>
                    <p className="text-sm text-zinc-500">{message}</p>
                </div>

                <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors shadow-sm ${isDestructive ? 'bg-rose-500 hover:bg-rose-600' : 'bg-primary hover:bg-teal-700'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
