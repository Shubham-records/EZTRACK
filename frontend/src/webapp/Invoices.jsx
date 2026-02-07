"use client";
import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import {
    FileText, Plus, Search, Filter, Calendar,
    MoreVertical, Eye, Edit, Trash2, Printer, Download
} from 'lucide-react';

const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";

export default function Invoices() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        status: 'all',
        paymentMode: 'all',
        dateFrom: '',
        dateTo: ''
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
        fetchInvoices();
    }, []);

    const fetchInvoices = async () => {
        try {
            const res = await fetch('/api/invoices', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setInvoices(data);
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

    const filteredInvoices = invoices.filter(inv => {
        if (searchTerm && !inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filters.status !== 'all' && inv.status !== filters.status) return false;
        if (filters.paymentMode !== 'all' && inv.paymentMode !== filters.paymentMode) return false;
        return true;
    });

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
            </div>

            {/* Filters */}
            <div className={`${cardStyle} !p-4`}>
                <div className="flex flex-wrap items-center gap-4">
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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Total Invoices</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{invoices.length}</p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Total Revenue</p>
                    <p className="text-2xl font-bold text-emerald-500 mt-1">
                        ₹{invoices.reduce((sum, i) => sum + (i.total || 0), 0).toLocaleString()}
                    </p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Paid</p>
                    <p className="text-2xl font-bold text-blue-500 mt-1">
                        {invoices.filter(i => i.status === 'paid').length}
                    </p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Pending</p>
                    <p className="text-2xl font-bold text-amber-500 mt-1">
                        {invoices.filter(i => i.status === 'pending' || i.status === 'overdue').length}
                    </p>
                </div>
            </div>

            {/* Invoices Table */}
            <div className={cardStyle}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs font-bold text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-700">
                                <th className="pb-3">Customer</th>
                                <th className="pb-3">Date</th>
                                <th className="pb-3">Items</th>
                                <th className="pb-3">Total</th>
                                <th className="pb-3">Payment</th>
                                <th className="pb-3">Status</th>
                                <th className="pb-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {filteredInvoices.map((inv, idx) => (
                                <tr key={inv.id || idx} className="border-b border-zinc-100 dark:border-zinc-800">
                                    <td className="py-4 font-medium">{inv.customerName || '-'}</td>
                                    <td className="py-4">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}</td>
                                    <td className="py-4">{Array.isArray(inv.items) ? inv.items.length : 0} items</td>
                                    <td className="py-4 font-bold">₹{(inv.total || 0).toLocaleString()}</td>
                                    <td className="py-4 capitalize">{inv.paymentMode || '-'}</td>
                                    <td className="py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(inv.status)}`}>
                                            {inv.status || 'pending'}
                                        </span>
                                    </td>
                                    <td className="py-4">
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
                    {filteredInvoices.length === 0 && (
                        <p className="text-center py-8 text-zinc-500">No invoices found</p>
                    )}
                </div>
            </div>
        </div>
    );
}
