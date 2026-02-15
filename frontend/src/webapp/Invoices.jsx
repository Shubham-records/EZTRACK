"use client";
import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import {
    FileText, Plus, Search, Filter, Calendar,
    MoreVertical, Eye, Edit, Trash2, Printer, Download, FileSpreadsheet,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import ImportDataModal from './components/ImportDataModal';

const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";

export default function Invoices() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const [filters, setFilters] = useState({
        status: 'all',
        paymentMode: 'all',
        dateFrom: '',
        dateTo: ''
    });

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 30;

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
        fetchInvoices();
    }, []);

    const fetchInvoices = async (skip = 0, currentData = []) => {
        try {
            const limit = 50;
            const res = await fetch(`/api/invoices?limit=${limit}&skip=${skip}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                const newData = Array.isArray(data) ? data : (data.data || []);
                const allData = [...currentData, ...newData];
                setInvoices(allData);

                if (newData.length === limit) {
                    setTimeout(() => fetchInvoices(skip + limit, allData), 100);
                }
            }
        } catch (error) {
            showToast('Failed to fetch invoices', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this invoice?')) return;
        try {
            const res = await fetch(`/api/invoices/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setInvoices(prev => prev.filter(i => i.id !== id));
                showToast('Invoice deleted', 'success');
            }
        } catch (error) {
            showToast('Failed to delete invoice', 'error');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} invoices?`)) return;

        try {
            const res = await fetch('/api/invoices/bulk-delete', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ ids: selectedIds })
            });
            const data = await res.json();
            if (res.ok) {
                setInvoices(prev => prev.filter(i => !selectedIds.includes(i.id)));
                setSelectedIds([]);
                showToast(`Deleted ${data.count} invoices`, 'success');
            } else {
                showToast(data.detail || 'Failed to bulk delete', 'error');
            }
        } catch (error) {
            showToast('Failed to bulk delete', 'error');
        }
    };

    const toggleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(filteredInvoices.map(i => i.id));
        } else {
            setSelectedIds([]);
        }
    };

    const toggleSelectOne = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const filteredInvoices = invoices.filter(inv => {
        if (searchTerm && !inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filters.status !== 'all' && inv.status !== filters.status) return false;
        if (filters.paymentMode !== 'all' && inv.paymentMode !== filters.paymentMode) return false;
        return true;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const paginatedInvoices = filteredInvoices.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'paid': return 'bg-emerald-100 text-emerald-700';
            case 'pending': return 'bg-amber-100 text-amber-700';
            case 'overdue': return 'bg-rose-100 text-rose-700';
            default: return 'bg-zinc-100 text-zinc-700';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Invoices</h1>
                    <p className="text-sm text-zinc-500 mt-1">Manage your invoices and billing</p>
                </div>
                <div className="flex gap-2">
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"
                        >
                            <Trash2 size={16} /> Delete ({selectedIds.length})
                        </button>
                    )}
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                        <FileSpreadsheet size={16} /> Import
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className={`${cardStyle} !p-4`}>
                <div className="flex items-center gap-4">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search by customer name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters(p => ({ ...p, status: e.target.value }))}
                        className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                    >
                        <option value="all">All Status</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                        <option value="overdue">Overdue</option>
                    </select>
                    <select
                        value={filters.paymentMode}
                        onChange={(e) => setFilters(p => ({ ...p, paymentMode: e.target.value }))}
                        className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                    >
                        <option value="all">All Payment Modes</option>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                    </select>
                </div>
            </div>

            {/* Invoices Table */}
            <div className={cardStyle}>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                        <thead>
                            <tr className="text-left text-zinc-500 dark:text-zinc-400">
                                <th className="py-3 px-4 font-semibold text-sm">
                                    <input
                                        type="checkbox"
                                        onChange={toggleSelectAll}
                                        checked={selectedIds.length === filteredInvoices.length && filteredInvoices.length > 0}
                                        className="rounded text-primary focus:ring-primary dark:bg-zinc-700 dark:border-zinc-600"
                                    />
                                </th>

                                <th className="pb-3 px-4 font-semibold text-sm">Customer</th>
                                <th className="pb-3 px-4 font-semibold text-sm">Date</th>
                                <th className="pb-3 px-4 font-semibold text-sm">Items</th>
                                <th className="pb-3 px-4 font-semibold text-sm">Total</th>
                                <th className="pb-3 px-4 font-semibold text-sm">Payment</th>
                                <th className="pb-3 px-4 font-semibold text-sm">Status</th>
                                <th className="pb-3 px-4 font-semibold text-sm">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                            {paginatedInvoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800">
                                    <td className="py-4 px-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(inv.id)}
                                            onChange={() => toggleSelectOne(inv.id)}
                                            className="rounded text-primary focus:ring-primary dark:bg-zinc-700 dark:border-zinc-600"
                                        />
                                    </td>
                                    <td className="py-4 px-4 font-medium">{inv.customerName || '-'}</td>
                                    <td className="py-4 px-4">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}</td>
                                    <td className="py-4 px-4">{Array.isArray(inv.items) ? inv.items.length : 0} items</td>
                                    <td className="py-4 px-4 font-bold">₹{(inv.total || 0).toLocaleString()}</td>
                                    <td className="py-4 px-4 capitalize">{inv.paymentMode || '-'}</td>
                                    <td className="py-4 px-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(inv.status)}`}>
                                            {inv.status || 'pending'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <button
                                            onClick={() => handleDelete(inv.id)}
                                            className="p-2 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg text-rose-500"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {
                        filteredInvoices.length === 0 && (
                            <p className="text-center py-8 text-zinc-500">No invoices found</p>
                        )
                    }
                </div>
            </div>
            {/* Import Modal */}
            <ImportDataModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onSuccess={fetchInvoices}
                dataType="invoice"
            />
        </div>
    );
}
