import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import {
    Zap, UserPlus, Package, DollarSign, Bell, Send,
    Users, RefreshCw, Database, ChevronRight, CheckCircle2
} from 'lucide-react';

const btnStyle = "flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-primary hover:shadow-md transition-all text-left w-full";

export default function QuickActions({ onNavigate }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState({});
    const [alerts, setAlerts] = useState(null);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName,
        };
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        try {
            const res = await fetch('/api/automation/smart-suggestions', { headers: getAuthHeaders() });
            if (res.ok) {
                setAlerts(await res.json());
            }
        } catch (error) {
            console.error('Failed to fetch alerts');
        }
    };

    const handleAction = async (action) => {
        setLoading(prev => ({ ...prev, [action]: true }));

        try {
            switch (action) {
                case 'sendReminders':
                    const reminderRes = await fetch('/api/automation/expiring-memberships?days=7', { headers: getAuthHeaders() });
                    if (reminderRes.ok) {
                        const data = await reminderRes.json();
                        showToast(`Found ${data.count || 0} expiring memberships`, 'success');
                    }
                    break;
                case 'bulkWhatsApp':
                    const bulkRes = await fetch('/api/automation/bulk-whatsapp-reminder', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ days_before_expiry: 7 })
                    });
                    if (bulkRes.ok) {
                        const data = await bulkRes.json();
                        if (data.links && data.links.length > 0) {
                            // Open first 3 WhatsApp links
                            data.links.slice(0, 3).forEach((item, idx) => {
                                setTimeout(() => window.open(item.whatsappLink, '_blank'), idx * 500);
                            });
                            showToast(`Opening ${Math.min(3, data.links.length)} WhatsApp reminders`, 'success');
                        } else {
                            showToast('No pending reminders to send', 'info');
                        }
                    }
                    break;
                case 'seedData':
                    const seedRes = await fetch('/api/audit/seed-sample-data?members_count=100&proteins_count=50', {
                        method: 'POST',
                        headers: getAuthHeaders()
                    });
                    if (seedRes.ok) {
                        const data = await seedRes.json();
                        showToast(data.message, 'success');
                    }
                    break;
                default:
                    showToast('Action completed', 'success');
            }
        } catch (error) {
            showToast('Action failed', 'error');
        } finally {
            setLoading(prev => ({ ...prev, [action]: false }));
        }
    };

    const quickActions = [
        {
            id: 'addMember',
            label: 'Add Member',
            description: 'Register a new gym member',
            icon: UserPlus,
            color: 'text-blue-500',
            onClick: () => onNavigate?.('AddMember')
        },
        {
            id: 'addProtein',
            label: 'Add Stock',
            description: 'Add protein inventory',
            icon: Package,
            color: 'text-purple-500',
            onClick: () => onNavigate?.('Billing')
        },
        {
            id: 'recordExpense',
            label: 'Record Expense',
            description: 'Log a new expense',
            icon: DollarSign,
            color: 'text-rose-500',
            onClick: () => onNavigate?.('Billing')
        },
        {
            id: 'sendReminders',
            label: 'Check Expiring',
            description: 'Find members expiring soon',
            icon: Bell,
            color: 'text-amber-500',
            onClick: () => handleAction('sendReminders')
        },
        {
            id: 'bulkWhatsApp',
            label: 'Send WhatsApp',
            description: 'Bulk renewal reminders',
            icon: Send,
            color: 'text-emerald-500',
            onClick: () => handleAction('bulkWhatsApp')
        },
        {
            id: 'seedData',
            label: 'Generate Demo Data',
            description: '100 members, 50 products',
            icon: Database,
            color: 'text-cyan-500',
            onClick: () => handleAction('seedData')
        }
    ];

    return (
        <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Zap className="text-primary" size={20} />
                    <h3 className="font-bold text-zinc-900 dark:text-white">Quick Actions</h3>
                </div>
                <button onClick={fetchAlerts} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <RefreshCw size={14} className="text-zinc-500" />
                </button>
            </div>

            {/* Alerts */}
            {alerts && (alerts.expiringSoon > 0 || alerts.lowStockItems > 0 || alerts.overduePayments > 0) && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">⚠️ Needs Attention</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                        {alerts.expiringSoon > 0 && (
                            <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                                {alerts.expiringSoon} expiring soon
                            </span>
                        )}
                        {alerts.lowStockItems > 0 && (
                            <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                {alerts.lowStockItems} low stock items
                            </span>
                        )}
                        {alerts.overduePayments > 0 && (
                            <span className="px-2 py-1 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">
                                {alerts.overduePayments} overdue payments
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {quickActions.map(action => {
                    const Icon = action.icon;
                    const isLoading = loading[action.id];
                    return (
                        <button
                            key={action.id}
                            onClick={action.onClick}
                            disabled={isLoading}
                            className={btnStyle}
                        >
                            <div className={`p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 ${action.color}`}>
                                {isLoading ? (
                                    <RefreshCw size={18} className="animate-spin" />
                                ) : (
                                    <Icon size={18} />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-sm text-zinc-900 dark:text-white">{action.label}</p>
                                <p className="text-xs text-zinc-500">{action.description}</p>
                            </div>
                            <ChevronRight size={16} className="text-zinc-400" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
