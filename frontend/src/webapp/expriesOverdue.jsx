import React, { useState, useEffect } from 'react'

export default function ExpriesOverdue() {
    const [display, setdisplay] = useState("EX");
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const token = localStorage.getItem('eztracker_jwt_access_control_token');
                const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

                const res = await fetch('/api/dashboard/alerts', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'X-Database-Name': dbName
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    setAlerts(data.alerts || []);
                }
            } catch (error) {
                console.error("Failed to fetch alerts", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAlerts();
    }, []);

    const expiries = alerts.filter(a => a.type === 'expiry' || a.type === 'member_expiry');
    const overdues = alerts.filter(a => a.type === 'overdue' || a.type === 'member_overdue' || a.type === 'overdue_balance');

    const currentList = display === "EX" ? expiries : overdues;

    return (
        <div className="w-full">
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-4">
                <button
                    onClick={() => setdisplay("EX")}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${display === "EX"
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    Expiring Soon ({expiries.length})
                </button>
                <button
                    onClick={() => setdisplay("OV")}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${display === "OV"
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    Overdue ({overdues.length})
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
                            <div key={index} className={`p-4 rounded-lg border ${alert.severity === 'high'
                                    ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/30'
                                    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                                }`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-3">
                                        <div className={`mt-0.5 ${alert.severity === 'high' ? 'text-rose-500' : 'text-amber-500'}`}>
                                            <span className="material-symbols-outlined text-[20px]">
                                                {alert.type.includes('expiry') ? 'avg_pace' : 'warning'}
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
                                    <button className="text-xs font-medium text-primary hover:text-teal-700">
                                        View
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-40 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
                            {display === "EX" ? 'No Expiries Coming Soon' : 'No Overdues Found'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
