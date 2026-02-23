import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Calendar } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

export default function StockAlertsSection() {
    const [data, setData] = useState({ lowStock: [], expiring: [] });
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    useEffect(() => {
        const fetchStockAlerts = async () => {
            try {
                const token = localStorage.getItem('eztracker_jwt_access_control_token');
                const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
                const headers = {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Database-Name': dbName
                };

                const res = await fetch('/api/dashboard/stock-alerts', { headers });
                if (res.ok) {
                    const result = await res.json();
                    setData(result);
                } else {
                    showToast('Failed to fetch stock alerts', 'error');
                }
            } catch (e) {
                showToast('Failed to fetch stock alerts', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchStockAlerts();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
        );
    }

    const { lowStock, expiring } = data;

    if (lowStock.length === 0 && expiring.length === 0) {
        return (
            <div className="text-center py-10 text-zinc-500 flex flex-col items-center">
                <Package className="w-12 h-12 mb-3 text-zinc-300 dark:text-zinc-600" />
                <p className="text-sm font-medium">No stock alerts</p>
                <p className="text-xs">Stocks and expiries are looking good.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Low Stock Lots */}
            <div>
                <h4 className="text-sm font-bold text-rose-500 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Low Stock Supplements ({lowStock.length})
                </h4>
                {lowStock.length > 0 ? (
                    <div className="space-y-2">
                        {lowStock.map((lot) => (
                            <div key={lot.lotId} className="flex items-center justify-between p-3 bg-red-50 dark:bg-rose-900/10 border border-red-100 dark:border-rose-900/30 rounded-lg">
                                <div>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {lot.productName}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        Lot: <span className="font-mono">{lot.lotNumber || 'N/A'}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-rose-600 dark:text-rose-400 font-bold text-sm">
                                        {lot.quantity} left
                                    </p>
                                    <p className="text-xs text-zinc-400">
                                        (Threshold: {lot.threshold})
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700">
                        <p className="text-sm text-zinc-500">No low stock items</p>
                    </div>
                )}
            </div>

            {/* Expiring Soon Lots */}
            <div>
                <h4 className="text-sm font-bold text-amber-500 mb-3 flex items-center gap-2">
                    <Calendar size={16} />
                    Expiring Soon ({expiring.length})
                </h4>
                {expiring.length > 0 ? (
                    <div className="space-y-2">
                        {expiring.map((lot) => (
                            <div key={lot.lotId} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                                <div>
                                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                        {lot.productName}
                                    </p>
                                    <div className="flex gap-2">
                                        <p className="text-xs text-zinc-500">
                                            Lot: <span className="font-mono">{lot.lotNumber || 'N/A'}</span>
                                        </p>
                                        <span className="text-zinc-300 dark:text-zinc-600">•</span>
                                        <p className="text-xs text-zinc-500">
                                            Qty: {lot.quantity}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                                        {lot.daysToExpiry < 0 ? `Expired ${Math.abs(lot.daysToExpiry)} days ago` : lot.daysToExpiry === 0 ? 'Expires today' : `In ${lot.daysToExpiry} days`}
                                    </p>
                                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                        {lot.expiryDate}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700">
                        <p className="text-sm text-zinc-500">No items expiring soon</p>
                    </div>
                )}
            </div>
        </div>
    );
}
