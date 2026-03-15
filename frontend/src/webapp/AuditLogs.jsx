import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { History, Filter, ChevronDown, ChevronRight, Clock, User, Edit, Plus, Trash2, RefreshCw } from 'lucide-react';

const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";
const selectStyle = "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all";

export default function AuditLogs() {
    const { showToast } = useToast();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedLog, setExpandedLog] = useState(null);
    const [filters, setFilters] = useState({
        entityType: '',
        action: ''
    });

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
        fetchLogs();
    }, [filters]);

    const fetchLogs = async () => {
        try {
            let url = '/api/audit/?limit=100';
            if (filters.entityType) url += `&entity_type=${filters.entityType}`;
            if (filters.action) url += `&action=${filters.action}`;

            const res = await fetch(url, { headers: getAuthHeaders() });
            if (res.ok) {
                setLogs(await res.json());
            }
        } catch (error) {
            showToast('Failed to load audit logs', 'error');
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (action) => {
        switch (action) {
            case 'CREATE': return <Plus size={14} className="text-emerald-500" />;
            case 'UPDATE': return <Edit size={14} className="text-blue-500" />;
            case 'DELETE': return <Trash2 size={14} className="text-rose-500" />;
            default: return <History size={14} className="text-zinc-500" />;
        }
    };

    const getActionColor = (action) => {
        switch (action) {
            case 'CREATE': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'UPDATE': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'DELETE': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
            default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const renderChanges = (log) => {
        if (!log.changes || typeof log.changes !== 'object') return null;
        const changedFields = Object.keys(log.changes);
        if (changedFields.length === 0) return null;

        return (
            <div className="mt-3 space-y-2">
                <p className="text-xs font-bold text-zinc-500 uppercase">Changed Fields</p>
                <div className="space-y-1">
                    {changedFields.map((field, idx) => {
                        const change = log.changes[field];
                        // Some logs might be just { field: newValue } for CREATE
                        const before = change && typeof change === 'object' && 'from' in change ? change.from : null;
                        const after = change && typeof change === 'object' && 'to' in change ? change.to : change;

                        return (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-zinc-700 dark:text-zinc-300 w-32">{field}:</span>
                                {log.action === 'UPDATE' && (
                                    <>
                                        <span className="text-rose-500 line-through">{JSON.stringify(before) || 'null'}</span>
                                        <span className="text-zinc-400">→</span>
                                    </>
                                )}
                                <span className="text-emerald-500">{JSON.stringify(after) || 'null'}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Audit Logs</h1>
                    <p className="text-sm text-zinc-500 mt-1">Track all changes made in the system</p>
                </div>
                <button onClick={fetchLogs} className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700">
                    <RefreshCw size={18} className="text-zinc-600 dark:text-zinc-400" />
                </button>
            </div>

            {/* Filters */}
            <div className={cardStyle}>
                <div className="flex items-center gap-4">
                    <Filter size={18} className="text-zinc-500" />
                    <select
                        value={filters.entityType}
                        onChange={(e) => setFilters(prev => ({ ...prev, entityType: e.target.value }))}
                        className={selectStyle}
                    >
                        <option value="">All Entities</option>
                        <option value="Member">Members</option>
                        <option value="ProteinStock">Proteins</option>
                        <option value="Invoice">Invoices</option>
                        <option value="Expense">Expenses</option>
                        <option value="PendingBalance">Pending Balances</option>
                    </select>
                    <select
                        value={filters.action}
                        onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
                        className={selectStyle}
                    >
                        <option value="">All Actions</option>
                        <option value="CREATE">Created</option>
                        <option value="UPDATE">Updated</option>
                        <option value="DELETE">Deleted</option>
                    </select>
                </div>
            </div>

            {/* Timeline */}
            <div className={cardStyle}>
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <p className="text-center text-zinc-500 py-12">No audit logs found</p>
                ) : (
                    <div className="space-y-4">
                        {logs.map((log, index) => (
                            <div key={log.id} className="relative">
                                {/* Timeline line */}
                                {index < logs.length - 1 && (
                                    <div className="absolute left-4 top-10 w-0.5 h-full bg-zinc-200 dark:bg-zinc-700" />
                                )}

                                {/* Log entry */}
                                <div
                                    className="flex gap-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-3 rounded-lg transition-colors"
                                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                >
                                    {/* Icon */}
                                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                        {getActionIcon(log.action)}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getActionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                            <span className="font-semibold text-zinc-900 dark:text-white">{log.entityType}</span>
                                            <span className="text-zinc-400 text-sm truncate">{log.entityId}</span>
                                        </div>

                                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} />
                                                {formatDate(log.createdAt)}
                                            </span>
                                            {log.userName && (
                                                <span className="flex items-center gap-1">
                                                    <User size={12} />
                                                    {log.userName}
                                                </span>
                                            )}
                                        </div>

                                        {/* Expanded details */}
                                        {expandedLog === log.id && renderChanges(log)}
                                    </div>

                                    {/* Expand arrow */}
                                    <div className="flex-shrink-0">
                                        {expandedLog === log.id ? (
                                            <ChevronDown size={18} className="text-zinc-400" />
                                        ) : (
                                            <ChevronRight size={18} className="text-zinc-400" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
