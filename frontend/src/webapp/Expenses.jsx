"use client";
import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import {
    Receipt, Plus, Search, Filter, Calendar, Trash2, Edit, X
} from 'lucide-react';

const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";

export default function Expenses() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [filters, setFilters] = useState({
        category: 'all',
        dateFrom: '',
        dateTo: ''
    });
    const [formData, setFormData] = useState({
        description: '',
        amount: '',
        category: 'Other',
        date: new Date().toISOString().split('T')[0],
        paymentMode: 'cash',
        notes: ''
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
        fetchExpenses();
        fetchCategories();
    }, []);

    const fetchExpenses = async () => {
        try {
            const res = await fetch('/api/expenses', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setExpenses(data);
            }
        } catch (error) {
            showToast('Failed to fetch expenses', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/expenses/categories', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (error) {
            setCategories(['Rent', 'Electricity', 'Salaries', 'Maintenance', 'Supplies', 'Marketing', 'Equipment', 'Other']);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/expenses/', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...formData,
                    amount: parseFloat(formData.amount) || 0
                })
            });
            if (res.ok) {
                const newExpense = await res.json();
                setExpenses(prev => [newExpense, ...prev]);
                setShowAddModal(false);
                setFormData({ description: '', amount: '', category: 'Other', date: new Date().toISOString().split('T')[0], paymentMode: 'cash', notes: '' });
                showToast('Expense added', 'success');
            }
        } catch (error) {
            showToast('Failed to add expense', 'error');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this expense?')) return;
        try {
            const res = await fetch(`/api/expenses/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                setExpenses(prev => prev.filter(e => e.id !== id));
                showToast('Expense deleted', 'success');
            }
        } catch (error) {
            showToast('Failed to delete expense', 'error');
        }
    };

    const filteredExpenses = expenses.filter(exp => {
        if (searchTerm && !exp.description?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filters.category !== 'all' && exp.category !== filters.category) return false;
        return true;
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const thisMonthExpenses = expenses.filter(e => {
        if (!e.date) return false;
        const expDate = new Date(e.date);
        const now = new Date();
        return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
    }).reduce((sum, e) => sum + (e.amount || 0), 0);

    const getCategoryColor = (category) => {
        const colors = {
            'Rent': 'bg-blue-100 text-blue-700',
            'Electricity': 'bg-yellow-100 text-yellow-700',
            'Salaries': 'bg-emerald-100 text-emerald-700',
            'Maintenance': 'bg-purple-100 text-purple-700',
            'Supplies': 'bg-cyan-100 text-cyan-700',
            'Marketing': 'bg-pink-100 text-pink-700',
            'Equipment': 'bg-orange-100 text-orange-700',
            'Other': 'bg-zinc-100 text-zinc-700'
        };
        return colors[category] || colors.Other;
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
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Expenses</h1>
                    <p className="text-sm text-zinc-500 mt-1">Track and manage your expenses</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                    <Plus size={16} /> Add Expense
                </button>
            </div>

            {/* Filters */}
            <div className={`${cardStyle} !p-4`}>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search by description..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <select
                        value={filters.category}
                        onChange={(e) => setFilters(p => ({ ...p, category: e.target.value }))}
                        className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                    >
                        <option value="all">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Total Expenses</p>
                    <p className="text-2xl font-bold text-rose-500 mt-1">₹{totalExpenses.toLocaleString()}</p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">This Month</p>
                    <p className="text-2xl font-bold text-amber-500 mt-1">₹{thisMonthExpenses.toLocaleString()}</p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Expense Count</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{expenses.length}</p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Average</p>
                    <p className="text-2xl font-bold text-blue-500 mt-1">
                        ₹{expenses.length > 0 ? Math.round(totalExpenses / expenses.length).toLocaleString() : 0}
                    </p>
                </div>
            </div>

            {/* Expenses Table */}
            <div className={cardStyle}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs font-bold text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-700">
                                <th className="pb-3">Date</th>
                                <th className="pb-3">Description</th>
                                <th className="pb-3">Category</th>
                                <th className="pb-3">Amount</th>
                                <th className="pb-3">Payment</th>
                                <th className="pb-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {filteredExpenses.map((exp, idx) => (
                                <tr key={exp.id || idx} className="border-b border-zinc-100 dark:border-zinc-800">
                                    <td className="py-4">{exp.date ? new Date(exp.date).toLocaleDateString() : '-'}</td>
                                    <td className="py-4 font-medium">{exp.description || '-'}</td>
                                    <td className="py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(exp.category)}`}>
                                            {exp.category || 'Other'}
                                        </span>
                                    </td>
                                    <td className="py-4 font-bold text-rose-600">₹{(exp.amount || 0).toLocaleString()}</td>
                                    <td className="py-4 capitalize">{exp.paymentMode || '-'}</td>
                                    <td className="py-4">
                                        <button
                                            onClick={() => handleDelete(exp.id)}
                                            className="p-2 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg text-rose-500"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredExpenses.length === 0 && (
                        <p className="text-center py-8 text-zinc-500">No expenses found</p>
                    )}
                </div>
            </div>

            {/* Add Expense Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-xl max-w-md w-full mx-4">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold">Add Expense</h2>
                            <button onClick={() => setShowAddModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                                    required
                                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Amount</label>
                                    <input
                                        type="number"
                                        value={formData.amount}
                                        onChange={(e) => setFormData(p => ({ ...p, amount: e.target.value }))}
                                        required
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Date</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData(p => ({ ...p, category: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                    >
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Payment</label>
                                    <select
                                        value={formData.paymentMode}
                                        onChange={(e) => setFormData(p => ({ ...p, paymentMode: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="upi">UPI</option>
                                        <option value="card">Card</option>
                                        <option value="bank">Bank Transfer</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                                    rows={2}
                                    className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                            >
                                Add Expense
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
