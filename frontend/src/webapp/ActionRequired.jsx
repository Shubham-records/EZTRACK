import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";

export default function ActionRequired() {
    const [display, setDisplay] = useState("EX"); // EX: Expiring Soon, OV: Overdue, ST: Stock Expiry/Low
    const [alerts, setAlerts] = useState({ expiries: [], overdues: [], stocks: [] });
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    useEffect(() => {
        const fetchAllAlerts = async () => {
            try {
                const token = localStorage.getItem('eztracker_jwt_access_control_token');
                const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
                const headers = {
                    Authorization: `Bearer ${token}`,
                    'X-Database-Name': dbName,
                    'Content-Type': 'application/json'
                };

                const [alertsRes, stockRes] = await Promise.all([
                    fetch('/api/dashboard/alerts', { headers }),
                    fetch('/api/dashboard/stock-alerts', { headers })
                ]);

                let fetchedAlerts = [];
                let stockData = { lowStock: [], expiring: [] };

                if (alertsRes.ok) {
                    const data = await alertsRes.json();
                    fetchedAlerts = data.alerts || [];
                }

                if (stockRes.ok) {
                    stockData = await stockRes.json();
                }

                const expiries = fetchedAlerts.filter(a => a.type === 'expiry' || a.type === 'member_expiry');
                const overdues = fetchedAlerts.filter(a => a.type === 'overdue' || a.type === 'member_overdue' || a.type === 'overdue_balance');

                // Combine low stock & expiring stock into 'stocks' tab
                const stocks = [
                    ...stockData.lowStock.map(ls => ({
                        type: 'low_stock',
                        title: `${ls.productName} (Lot ${ls.lotNumber || 'N/A'}) - ${ls.quantity} left`,
                        severity: 'high',
                        entityType: 'low stock'
                    })),
                    ...stockData.expiring.map(ex => ({
                        type: 'stock_expiry',
                        title: `${ex.productName} (Lot ${ex.lotNumber || 'N/A'}) - ${ex.daysToExpiry <= 0 ? 'Expired' : `Expires in ${ex.daysToExpiry} days`}`,
                        severity: ex.daysToExpiry <= 3 ? 'high' : 'medium',
                        entityType: 'stock expiry'
                    }))
                ];

                setAlerts({ expiries, overdues, stocks });

            } catch (error) {
                console.error("Failed to fetch alerts", error);
                showToast("Failed to fetch alerts", "error");
            } finally {
                setLoading(false);
            }
        };

        fetchAllAlerts();
    }, []);

    let currentList = [];
    if (display === "EX") currentList = alerts.expiries;
    else if (display === "OV") currentList = alerts.overdues;
    else if (display === "ST") currentList = alerts.stocks;

    return (
        <div className="w-full">
            <div className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800 mb-4 px-2">
                <button
                    onClick={() => setDisplay("EX")}
                    className={`pb-3 pt-2 text-sm font-semibold transition-colors border-b-2 ${display === "EX"
                        ? 'text-primary border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent'
                        }`}
                >
                    Expiring Soon ({alerts.expiries.length})
                </button>
                <button
                    onClick={() => setDisplay("OV")}
                    className={`pb-3 pt-2 text-sm font-semibold transition-colors border-b-2 ${display === "OV"
                        ? 'text-primary border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent'
                        }`}
                >
                    Overdue ({alerts.overdues.length})
                </button>
                <button
                    onClick={() => setDisplay("ST")}
                    className={`pb-3 pt-2 text-sm font-semibold transition-colors border-b-2 ${display === "ST"
                        ? 'text-primary border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent'
                        }`}
                >
                    Stock Alerts ({alerts.stocks.length})
                </button>
            </div>

            <div className="min-h-[240px] max-h-[400px] overflow-y-auto pr-2 stitch-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : currentList.length > 0 ? (
                    <div className="space-y-3">
                        {currentList.map((alert, index) => (
                            <div key={index} className={`p-4 rounded-lg border flex justify-between items-center ${alert.severity === 'high'
                                ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/30'
                                : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                                }`}>
                                <div className="flex gap-3">
                                    <div className={`mt-0.5 ${alert.severity === 'high' ? 'text-rose-500' : 'text-amber-500'}`}>
                                        <span className="material-symbols-outlined text-[20px]">
                                            {alert.type.includes('expiry') ? 'avg_pace' : alert.type === 'low_stock' ? 'inventory' : 'warning'}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className={`text-sm font-semibold ${alert.severity === 'high' ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'
                                            }`}>
                                            {alert.title}
                                        </h4>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 uppercase tracking-wider font-bold">
                                            {alert.entityType.replace('_', ' ')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-40 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
                            {display === "EX" ? 'No Expiries Coming Soon' : display === "OV" ? 'No Overdues Found' : 'No Stock Alerts'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
