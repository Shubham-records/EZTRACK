import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { Search, Filter, DollarSign, Phone, MessageCircle, Plus, X } from 'lucide-react';
import { format } from 'date-fns';

const inputStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all";
const labelStyle = "block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1";
const selectStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none";
const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";

export default function PendingBalances() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [balances, setBalances] = useState([]);
    const [summary, setSummary] = useState({ totalPending: 0, totalCount: 0, overdueCount: 0 });
    const [filter, setFilter] = useState('all'); // 'all', 'pending', 'partial', 'overdue'
    const [showAddModal, setShowAddModal] = useState(false);
    const [showPayModal, setShowPayModal] = useState(null);
    const [newBalance, setNewBalance] = useState({
        entityType: 'member',
        entityName: '',
        phone: '',
        amount: '',
        dueDate: format(new Date(), 'yyyy-MM-dd'),
        notes: ''
    });
    const [paymentData, setPaymentData] = useState({
        amount: '',
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
        fetchBalances();
        fetchSummary();
    }, [filter]);

    const fetchBalances = async () => {
        try {
            let url = '/api/pending';
            if (filter === 'overdue') {
                url = '/api/pending/overdue';
            } else if (filter !== 'all') {
                url += `?status_filter=${filter}`;
            }

            const res = await fetch(url, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setBalances(data);
            }
        } catch (e) {
            showToast('Failed to load pending balances', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const res = await fetch('/api/pending/summary', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setSummary(data);
            }
        } catch (e) {
            console.error('Failed to load summary', e);
        }
    };

    const handleAddBalance = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/pending', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...newBalance,
                    amount: parseFloat(newBalance.amount)
                })
            });
            if (res.ok) {
                showToast('Pending balance added', 'success');
                setShowAddModal(false);
                setNewBalance({ entityType: 'member', entityName: '', phone: '', amount: '', dueDate: format(new Date(), 'yyyy-MM-dd'), notes: '' });
                fetchBalances();
                fetchSummary();
            }
        } catch (e) {
            showToast('Failed to add pending balance', 'error');
        }
    };

    const handlePayment = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/pending/${showPayModal.id}/pay`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...paymentData,
                    amount: parseFloat(paymentData.amount),
                    date: format(new Date(), 'yyyy-MM-dd')
                })
            });
            if (res.ok) {
                showToast('Payment recorded', 'success');
                setShowPayModal(null);
                setPaymentData({ amount: '', paymentMode: 'cash', notes: '' });
                fetchBalances();
                fetchSummary();
            }
        } catch (e) {
            showToast('Failed to record payment', 'error');
        }
    };

    const sendWhatsAppReminder = async (balance) => {
        try {
            const res = await fetch(`/api/pending/${balance.id}/whatsapp-link`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                window.open(data.link, '_blank');
            } else {
                showToast('No phone number available', 'error');
            }
        } catch (e) {
            showToast('Failed to generate WhatsApp link', 'error');
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            partial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
        };
        return (
            <span className={`px-2 py-1 text-xs font-bold uppercase rounded ${styles[status] || styles.pending}`}>
                {status}
            </span>
        );
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
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Pending Balances</h1>
                    <p className="text-sm text-zinc-500 mt-1">Track and collect outstanding payments</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary hover:bg-teal-700 shadow-md transition-all"
                >
                    <Plus size={16} />
                    Add Pending
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Total Pending</p>
                    <p className="text-2xl font-bold text-rose-500 mt-1">₹{summary.totalPending.toLocaleString()}</p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Pending Count</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{summary.totalCount}</p>
                </div>
                <div className={cardStyle}>
                    <p className="text-xs font-bold text-zinc-500 uppercase">Overdue</p>
                    <p className="text-2xl font-bold text-amber-500 mt-1">{summary.overdueCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {['all', 'pending', 'partial', 'overdue'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${filter === f
                            ? 'bg-primary text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Balances List */}
            <div className={cardStyle}>
                <div className="space-y-3">
                    {balances.map(balance => {
                        const remaining = balance.amount - (balance.paidAmount || 0);
                        const isOverdue = balance.dueDate && balance.dueDate < format(new Date(), 'yyyy-MM-dd');

                        return (
                            <div
                                key={balance.id || balance._id}
                                className={`p-4 rounded-lg border ${isOverdue ? 'border-rose-300 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-zinc-900 dark:text-white">{balance.entityName}</h3>
                                            {getStatusBadge(balance.status)}
                                            <span className="text-xs text-zinc-500 uppercase">{balance.entityType}</span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                                            {balance.phone && (
                                                <span className="flex items-center gap-1">
                                                    <Phone size={14} />
                                                    {balance.phone}
                                                </span>
                                            )}
                                            {balance.dueDate && (
                                                <span className={isOverdue ? 'text-rose-500 font-medium' : ''}>
                                                    Due: {balance.dueDate}
                                                </span>
                                            )}
                                        </div>
                                        {balance.notes && (
                                            <p className="text-xs text-zinc-500 mt-2 whitespace-pre-line">{balance.notes}</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-rose-500">₹{remaining.toLocaleString()}</p>
                                        {balance.paidAmount > 0 && (
                                            <p className="text-xs text-emerald-500">Paid: ₹{balance.paidAmount.toLocaleString()}</p>
                                        )}
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => sendWhatsAppReminder(balance)}
                                                className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors"
                                                title="Send WhatsApp Reminder"
                                            >
                                                <MessageCircle size={16} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setPaymentData({ amount: String(remaining), paymentMode: 'cash', notes: '' });
                                                    setShowPayModal(balance);
                                                }}
                                                className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                                                title="Record Payment"
                                            >
                                                <DollarSign size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {balances.length === 0 && (
                        <p className="text-center text-zinc-500 py-12">No pending balances found</p>
                    )}
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add Pending Balance</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-700">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleAddBalance} className="space-y-4">
                            <div>
                                <label className={labelStyle}>Type</label>
                                <select
                                    value={newBalance.entityType}
                                    onChange={(e) => setNewBalance(p => ({ ...p, entityType: e.target.value }))}
                                    className={selectStyle}
                                >
                                    <option value="member">Member</option>
                                    <option value="protein">Protein Sale</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelStyle}>Name</label>
                                <input
                                    type="text"
                                    value={newBalance.entityName}
                                    onChange={(e) => setNewBalance(p => ({ ...p, entityName: e.target.value }))}
                                    className={inputStyle}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelStyle}>Phone</label>
                                <input
                                    type="tel"
                                    value={newBalance.phone}
                                    onChange={(e) => setNewBalance(p => ({ ...p, phone: e.target.value }))}
                                    className={inputStyle}
                                />
                            </div>
                            <div>
                                <label className={labelStyle}>Amount (₹)</label>
                                <input
                                    type="number"
                                    value={newBalance.amount}
                                    onChange={(e) => setNewBalance(p => ({ ...p, amount: e.target.value }))}
                                    className={inputStyle}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelStyle}>Due Date</label>
                                <input
                                    type="date"
                                    value={newBalance.dueDate}
                                    onChange={(e) => setNewBalance(p => ({ ...p, dueDate: e.target.value }))}
                                    className={inputStyle}
                                />
                            </div>
                            <div>
                                <label className={labelStyle}>Notes</label>
                                <textarea
                                    value={newBalance.notes}
                                    onChange={(e) => setNewBalance(p => ({ ...p, notes: e.target.value }))}
                                    className={inputStyle}
                                    rows={2}
                                />
                            </div>
                            <button type="submit" className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-3 rounded-xl transition-all">
                                Add Pending Balance
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Pay Modal */}
            {showPayModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Record Payment</h2>
                            <button onClick={() => setShowPayModal(null)} className="text-zinc-500 hover:text-zinc-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="mb-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                            <p className="font-bold text-zinc-900 dark:text-white">{showPayModal.entityName}</p>
                            <p className="text-sm text-zinc-500">Outstanding: ₹{(showPayModal.amount - (showPayModal.paidAmount || 0)).toLocaleString()}</p>
                        </div>
                        <form onSubmit={handlePayment} className="space-y-4">
                            <div>
                                <label className={labelStyle}>Payment Amount (₹)</label>
                                <input
                                    type="number"
                                    value={paymentData.amount}
                                    onChange={(e) => setPaymentData(p => ({ ...p, amount: e.target.value }))}
                                    className={inputStyle}
                                    required
                                />
                            </div>
                            <div>
                                <label className={labelStyle}>Payment Mode</label>
                                <select
                                    value={paymentData.paymentMode}
                                    onChange={(e) => setPaymentData(p => ({ ...p, paymentMode: e.target.value }))}
                                    className={selectStyle}
                                >
                                    <option value="cash">Cash</option>
                                    <option value="upi">UPI</option>
                                    <option value="card">Card</option>
                                    <option value="bank">Bank Transfer</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelStyle}>Notes</label>
                                <input
                                    type="text"
                                    value={paymentData.notes}
                                    onChange={(e) => setPaymentData(p => ({ ...p, notes: e.target.value }))}
                                    className={inputStyle}
                                />
                            </div>
                            <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-all">
                                Record Payment
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
