"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from "@/context/ToastContext";
import {
    FileText, Search, Trash2, FileSpreadsheet, X,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    User, Phone, CreditCard, CheckCircle, Clock, AlertCircle,
    Calendar, Package, Hash, Dumbbell, MapPin, Activity,
    ExternalLink, ArrowRight, ShieldCheck, Flame
} from 'lucide-react';
import ImportDataModal from './components/ImportDataModal';
import ConfirmModal from './components/ConfirmModal';

const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";

// Detect invoice type from editReason or items
function detectInvoiceType(invoice) {
    const reason = (invoice?.editReason || '').toLowerCase();
    if (reason.includes('renewal')) return 'renewal';
    if (reason.includes('re-admission') || reason.includes('readmission')) return 're-admission';
    if (reason.includes('protein') || reason.includes('supplement')) return 'protein';
    if (reason.includes('new admission')) return 'new-admission';
    // check items as fallback
    const items = invoice?.items || [];
    const desc = (items[0]?.description || '').toLowerCase();
    if (desc.includes('renewal')) return 'renewal';
    if (desc.includes('re-admission')) return 're-admission';
    if (desc.includes('new admission')) return 'new-admission';
    return 'general';
}

// ── Detail field helper
function Field({ icon, label, value, mono = false, highlight = false }) {
    if (!value && value !== 0) return null;
    return (
        <div className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${highlight ? 'bg-primary/5 border border-primary/20' : 'bg-zinc-50 dark:bg-zinc-800/60'}`}>
            <div className="mt-0.5 text-primary flex-shrink-0">{icon}</div>
            <div className="flex-1">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
                <p className={`text-sm font-semibold text-zinc-900 dark:text-white break-words whitespace-pre-wrap ${mono ? 'font-mono' : ''}`}>{value}</p>
            </div>
        </div>
    );
}

// ─── Invoice Detail Modal ───────────────────────────────────────────────────
function InvoiceDetailModal({ invoice, onClose, onNavigateToMember, onRefresh }) {
    const { showToast } = useToast();
    const [member, setMember] = useState(null);
    const [loadingMember, setLoadingMember] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payMode, setPayMode] = useState('CASH');
    const [isPaying, setIsPaying] = useState(false);

    useEffect(() => {
        if (!invoice?.memberId) return;
        const fetchMember = async () => {
            setLoadingMember(true);
            try {
                const token = localStorage.getItem('eztracker_jwt_access_control_token');
                const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
                const res = await fetch(`/api/members/${invoice.memberId}`, {
                    headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
                });
                if (res.ok) setMember(await res.json());
            } catch { }
            setLoadingMember(false);
        };
        fetchMember();
    }, [invoice?.memberId]);

    if (!invoice) return null;

    const invType = detectInvoiceType(invoice);
    const total = invoice.total || 0;

    // Use backend-provided paidAmount and balance, fallback to parsing editReason for older records
    let paidAmount = invoice.paidAmount !== undefined ? invoice.paidAmount : total;
    let balance = invoice.balance !== undefined ? invoice.balance : 0;

    if (invoice.paidAmount === undefined) {
        const reasonStr = invoice.editReason || '';
        const paidMatch = reasonStr.match(/Paid:\s*₹([\d.]+)/);
        const balMatch = reasonStr.match(/Balance:\s*₹([\d.]+)/);
        if (paidMatch) paidAmount = parseFloat(paidMatch[1]);
        if (balMatch) balance = parseFloat(balMatch[1]);
        else if (invoice.status?.toUpperCase() !== 'PAID') balance = total - paidAmount;
    }

    const statusMap = {
        PAID: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: <CheckCircle size={14} />, label: 'Paid in Full' },
        PARTIAL: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: <Clock size={14} />, label: 'Partial Payment' },
        PENDING: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-400', icon: <AlertCircle size={14} />, label: 'Pending' },
    };
    const sc = statusMap[invoice.status?.toUpperCase()] || statusMap.PENDING;

    const typeLabels = {
        'new-admission': { label: '🆕 New Admission', color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
        'renewal': { label: '🔄 Renewal', color: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
        're-admission': { label: '🔁 Re-Admission', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
        'protein': { label: '🥤 Protein/Supplement', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
        'general': { label: '📄 Invoice', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
    };
    const typeInfo = typeLabels[invType] || typeLabels.general;

    const handlePay = async () => {
        if (!payAmount || isNaN(payAmount) || Number(payAmount) <= 0) return showToast('Enter valid amount', 'error');
        if (Number(payAmount) > balance) return showToast('Amount exceeds balance', 'error');

        setIsPaying(true);
        try {
            const token = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
            const res = await fetch(`/api/invoices/${invoice.id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Database-Name': dbName },
                body: JSON.stringify({ amount: Number(payAmount), paymentMode: payMode })
            });
            if (res.ok) {
                showToast('Payment logged successfully', 'success');
                onRefresh && onRefresh();
            } else {
                showToast('Failed to log payment', 'error');
            }
        } catch { showToast('Network error', 'error'); }
        setIsPaying(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col"
                style={{ maxHeight: '92vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-primary/5 to-teal-500/5 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                            <FileText size={20} className="text-primary" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-zinc-900 dark:text-white text-lg">Invoice Details</h2>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
                            </div>
                            <p className="text-xs text-zinc-500">
                                {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <X size={18} className="text-zinc-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Customer + Status */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <button
                                onClick={() => { onNavigateToMember && onNavigateToMember(invoice, invType); onClose(); }}
                                className="group flex items-center gap-2 text-left"
                                title="Go to member record"
                            >
                                <span className="text-xl font-bold text-zinc-900 dark:text-white group-hover:text-primary transition-colors">
                                    {invoice.customerName || member?.Name || '—'}
                                </span>
                                <ExternalLink size={14} className="text-zinc-400 group-hover:text-primary transition-colors mt-0.5" />
                            </button>
                            <p className="text-xs text-zinc-400 mt-0.5">Click name to view in Members / Supplements table</p>
                        </div>
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0 ${sc.bg} ${sc.text}`}>
                            {sc.icon} {sc.label}
                        </span>
                    </div>

                    {/* ── Member Details (fetched from server) ── */}
                    {loadingMember ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                            <span className="ml-2 text-sm text-zinc-400">Loading member details…</span>
                        </div>
                    ) : member ? (
                        <div className="space-y-4">
                            {/* Group: Personal Info */}
                            <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <User size={11} className="text-primary" /> Personal Information
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Field icon={<User size={14} />} label="Full Name" value={member.Name} />
                                    <Field icon={<Hash size={14} />} label="Client ID" value={member.MembershipReceiptnumber} mono />
                                    <Field icon={<User size={14} />} label="Gender" value={member.Gender === 'M' ? 'Male' : member.Gender === 'F' ? 'Female' : member.Gender} />
                                    <Field icon={<Activity size={14} />} label="Age" value={member.Age ? `${member.Age} yrs` : null} />
                                    <Field icon={<Activity size={14} />} label="Height / Weight" value={member.height || member.weight ? `${member.height || '—'} ft / ${member.weight || '—'} kg` : null} />
                                    <Field icon={<Phone size={14} />} label="Mobile" value={member.Mobile} mono />
                                    <Field icon={<Phone size={14} />} label="WhatsApp" value={member.Whatsapp} mono />
                                    <Field icon={<ShieldCheck size={14} />} label="Aadhaar" value={member.Aadhaar} mono />
                                    <Field icon={<MapPin size={14} />} label="Address" value={member.Address} />
                                    <Field icon={<FileText size={14} />} label="Remark" value={member.Remark} />
                                </div>
                            </div>

                            {/* Group: Plan Info */}
                            <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Dumbbell size={11} className="text-primary" /> Membership Plan
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Field icon={<Dumbbell size={14} />} label="Plan Type" value={member.PlanType} highlight />
                                    <Field icon={<Clock size={14} />} label="Duration" value={member.PlanPeriod} highlight />
                                    <Field icon={<Calendar size={14} />} label="Join Date" value={member.DateOfJoining} />
                                    {(invType === 're-admission' || invType === 'renewal') && (
                                        <Field icon={<Calendar size={14} />} label={invType === 'renewal' ? 'Renewed On' : 'Re-Join Date'} value={member.DateOfReJoin || member.LastPaymentDate} />
                                    )}
                                    <Field icon={<Calendar size={14} />} label="Last Payment Date" value={member.LastPaymentDate} />
                                    <Field icon={<Calendar size={14} />} label="Expiry Date" value={member.MembershipExpiryDate} />
                                    <Field icon={<Calendar size={14} />} label="Next Due Date" value={member.NextDuedate} />
                                    <Field icon={<Hash size={14} />} label="Extra Days" value={member.extraDays !== '0' && member.extraDays ? `+${member.extraDays} days` : null} />
                                    <Field icon={<Hash size={14} />} label="Renewal Receipt #" value={member.RenewalReceiptNumber} mono />
                                    <Field icon={<Activity size={14} />} label="Membership Status" value={member.MembershipStatus} highlight />
                                </div>
                            </div>
                        </div>
                    ) : invoice.memberId ? (
                        <div className="text-sm text-zinc-400 italic py-2">Could not load member details.</div>
                    ) : null}

                    {/* ── Invoice Items Breakdown ── */}
                    {Array.isArray(invoice.items) && invoice.items.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Package size={11} className="text-primary" /> Bill Items
                            </p>
                            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                                <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
                                    {invoice.items.map((item, i) => (
                                        <div key={i} className="flex justify-between items-center px-4 py-3 text-sm">
                                            <div>
                                                <p className="font-semibold text-zinc-900 dark:text-white">{item.description || `Item ${i + 1}`}</p>
                                                {item.quantity !== undefined && item.rate !== undefined && (
                                                    <p className="text-xs text-zinc-400">Qty: {item.quantity} × ₹{(item.rate || 0).toLocaleString()}</p>
                                                )}
                                            </div>
                                            <span className="font-bold text-zinc-900 dark:text-white ml-4">₹{(item.amount || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Payment Summary ── */}
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <CreditCard size={11} className="text-primary" /> Payment Summary
                        </p>
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-2">
                            {invoice.subTotal !== invoice.total && (
                                <div className="flex justify-between text-sm text-zinc-500">
                                    <span>Subtotal</span><span>₹{(invoice.subTotal || 0).toLocaleString()}</span>
                                </div>
                            )}
                            {invoice.tax > 0 && (
                                <div className="flex justify-between text-sm text-zinc-500">
                                    <span>Tax</span><span>₹{invoice.tax.toLocaleString()}</span>
                                </div>
                            )}
                            {invoice.discount > 0 && (
                                <div className="flex justify-between text-sm text-emerald-600">
                                    <span>Discount</span><span>-₹{invoice.discount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-base pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                <span className="text-zinc-900 dark:text-white">Total</span>
                                <span className="text-zinc-900 dark:text-white">₹{total.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">Payment Mode</span>
                                <span className="font-semibold text-zinc-900 dark:text-white">{invoice.paymentMode || '—'}</span>
                            </div>

                            {invoice.status?.toUpperCase() !== 'PAID' && (
                                <>
                                    <div className="flex justify-between text-sm pt-1">
                                        <span className="text-emerald-600 font-medium">Amount Paid</span>
                                        <span className="font-bold text-emerald-600">₹{paidAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-rose-500 font-medium flex items-center gap-1">
                                            <AlertCircle size={13} /> Outstanding Balance
                                        </span>
                                        <span className="font-bold text-rose-500 text-base">₹{Math.max(0, balance).toLocaleString()}</span>
                                    </div>

                                    {invoice.status?.toUpperCase() === 'PARTIAL' && (
                                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 mt-1">
                                            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                                                <Clock size={12} />
                                                Partial payment — ₹{Math.max(0, balance).toLocaleString()} still due from member
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Payment Logs & Add Payment ── */}
                    <div>
                        {Array.isArray(invoice.paymentLogs) && invoice.paymentLogs.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Clock size={11} className="text-primary" /> Payment History Logs
                                </p>
                                <div className="space-y-2">
                                    {invoice.paymentLogs.map((pl, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg text-sm">
                                            <div>
                                                <p className="font-semibold text-zinc-900 dark:text-white">Logged Payment</p>
                                                <p className="text-xs text-zinc-400">{new Date(pl.date).toLocaleDateString()} at {new Date(pl.date).toLocaleTimeString()} • {pl.paymentMode}</p>
                                            </div>
                                            <span className="font-bold text-emerald-600">+₹{(pl.amount || 0).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {invoice.status?.toUpperCase() !== 'PAID' && (
                            <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl mt-4">
                                <p className="text-sm font-bold text-primary mb-3">Record Partial / Balance Payment</p>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        placeholder={`Amount (Max: ₹${Math.max(0, balance)})`}
                                        value={payAmount}
                                        onChange={e => setPayAmount(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    />
                                    <select
                                        value={payMode}
                                        onChange={e => setPayMode(e.target.value)}
                                        className="w-32 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    >
                                        <option value="CASH">CASH</option>
                                        <option value="UPI">UPI</option>
                                        <option value="CARD">CARD</option>
                                        <option value="BANK">BANK</option>
                                    </select>
                                    <button
                                        onClick={handlePay}
                                        disabled={isPaying || !payAmount}
                                        className="px-4 py-2 bg-primary hover:bg-teal-700 text-white font-bold rounded-lg transition-colors text-sm disabled:opacity-50"
                                    >
                                        {isPaying ? 'Saving...' : 'Add'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex gap-3 flex-shrink-0">
                    {invoice.memberId && onNavigateToMember && (
                        <button
                            onClick={() => { onNavigateToMember(invoice, invType); onClose(); }}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary/5 transition-colors text-sm"
                        >
                            <ArrowRight size={16} /> View in Members Table
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 bg-primary hover:bg-teal-700 text-white font-bold rounded-xl transition-colors text-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Invoices Component ─────────────────────────────────────────────────
export default function Invoices({ initialFilter = '', onNavigate }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [invoices, setInvoices] = useState([]);
    const [searchTerm, setSearchTerm] = useState(initialFilter);
    const [selectedIds, setSelectedIds] = useState([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [filters, setFilters] = useState({ status: 'all', paymentMode: 'all' });
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, title: '', message: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 30;

    const getAuthHeaders = useCallback(() => {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Database-Name': dbName };
    }, []);

    useEffect(() => { fetchInvoices(); }, []);

    const fetchInvoices = async (skip = 0, currentData = []) => {
        try {
            const limit = 50;
            const res = await fetch(`/api/invoices?limit=${limit}&skip=${skip}`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                const newData = Array.isArray(data) ? data : (data.data || []);
                const allData = [...currentData, ...newData];
                setInvoices(allData);
                if (newData.length === limit) setTimeout(() => fetchInvoices(skip + limit, allData), 100);
            }
        } catch { showToast('Failed to fetch invoices', 'error'); }
        finally { setLoading(false); }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        setConfirmModal({
            isOpen: true,
            title: 'Delete Invoice',
            message: 'Delete this invoice? This action cannot be undone.',
            action: async () => {
                try {
                    const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
                    if (res.ok) {
                        setInvoices(prev => prev.filter(i => i.id !== id));
                        if (selectedInvoice?.id === id) setSelectedInvoice(null);
                        showToast('Invoice deleted', 'success');
                    }
                } catch { showToast('Failed to delete', 'error'); }
            }
        });
    };

    const handleBulkDelete = async () => {
        if (!selectedIds.length) return;
        setConfirmModal({
            isOpen: true,
            title: 'Bulk Delete Invoices',
            message: `Delete ${selectedIds.length} invoices?`,
            action: async () => {
                try {
                    const res = await fetch('/api/invoices/bulk-delete', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ ids: selectedIds }) });
                    const data = await res.json();
                    if (res.ok) {
                        setInvoices(prev => prev.filter(i => !selectedIds.includes(i.id)));
                        setSelectedIds([]);
                        showToast(`Deleted ${data.count} invoices`, 'success');
                    }
                } catch { showToast('Failed to bulk delete', 'error'); }
            }
        });
    };

    // Navigate to member/protein table when clicking name in detail modal
    const handleNavigateToMember = (invoice, invType) => {
        if (!onNavigate) return;
        if (invType === 'protein') {
            // Protein invoices don't have a memberId, match by name
            onNavigate('Protein', invoice.customerName || '', null);
        } else {
            // Use the memberId UUID for exact row matching
            onNavigate('AllMember', invoice.customerName || '', invoice.memberId || null);
        }
    };

    const filteredInvoices = invoices.filter(inv => {
        if (searchTerm && !inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (filters.status !== 'all' && inv.status?.toUpperCase() !== filters.status.toUpperCase()) return false;
        if (filters.paymentMode !== 'all' && inv.paymentMode?.toUpperCase() !== filters.paymentMode.toUpperCase()) return false;
        return true;
    });

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const getStatusConfig = (status) => {
        switch (status?.toUpperCase()) {
            case 'PAID': return { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'PAID' };
            case 'PARTIAL': return { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'PARTIAL' };
            case 'PENDING': return { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400', label: 'PENDING' };
            default: return { cls: 'bg-zinc-100 text-zinc-700', label: status || '—' };
        }
    };

    const getTypeChip = (inv) => {
        const t = detectInvoiceType(inv);
        const map = {
            'new-admission': '🆕',
            'renewal': '🔄',
            're-admission': '🔁',
            'protein': '🥤',
            'general': '📄',
        };
        return map[t] || '📄';
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Invoices</h1>
                    <p className="text-sm text-zinc-500 mt-1">Click any row to view complete billing details</p>
                </div>
                <div className="flex gap-2">
                    {selectedIds.length > 0 && (
                        <button onClick={handleBulkDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 transition-colors text-sm">
                            <Trash2 size={16} /> Delete ({selectedIds.length})
                        </button>
                    )}
                    <button onClick={() => setShowImportModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-sm">
                        <FileSpreadsheet size={16} /> Import
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className={`${cardStyle} !p-4`}>
                <div className="flex items-center gap-3">
                    <div className="relative flex-[4] min-w-[350px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input type="text" placeholder="Search by customer name..."
                            value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                    </div>
                    <select value={filters.status} onChange={e => { setFilters(p => ({ ...p, status: e.target.value })); setCurrentPage(1); }}
                        className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm">
                        <option value="all">All Status</option>
                        <option value="PAID">Paid</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="PENDING">Pending</option>
                    </select>
                    <select value={filters.paymentMode} onChange={e => { setFilters(p => ({ ...p, paymentMode: e.target.value })); setCurrentPage(1); }}
                        className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm">
                        <option value="all">All Payment Modes</option>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK">Bank Transfer</option>
                    </select>
                </div>
                <span className="text-xs text-zinc-400 ml-auto hidden sm:block" style={{ float: "right" }}>{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            <div className={cardStyle}>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                        <thead>
                            <tr className="text-left text-zinc-500 dark:text-zinc-400">
                                <th className="py-3 px-3 w-10">
                                    <input type="checkbox"
                                        onChange={e => e.target.checked ? setSelectedIds(filteredInvoices.map(i => i.id)) : setSelectedIds([])}
                                        checked={selectedIds.length === filteredInvoices.length && filteredInvoices.length > 0}
                                        className="rounded text-primary" />
                                </th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide w-8">Type</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide">Items</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide">Total</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide">Mode</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                                <th className="pb-3 px-3 font-semibold text-xs uppercase tracking-wide w-12">Del</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {paginatedInvoices.map(inv => {
                                const sc = getStatusConfig(inv.status);
                                return (
                                    <tr key={inv.id} onClick={() => setSelectedInvoice(inv)}
                                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition-colors group">
                                        <td className="py-3 px-3">
                                            <input type="checkbox" checked={selectedIds.includes(inv.id)}
                                                onChange={e => { e.stopPropagation(); setSelectedIds(prev => prev.includes(inv.id) ? prev.filter(id => id !== inv.id) : [...prev, inv.id]); }}
                                                onClick={e => e.stopPropagation()}
                                                className="rounded text-primary" />
                                        </td>
                                        <td className="py-3 px-3 text-base">{getTypeChip(inv)}</td>
                                        <td className="py-3 px-3">
                                            <p className="font-semibold text-zinc-900 dark:text-white group-hover:text-primary transition-colors text-sm">
                                                {inv.customerName || '—'}
                                            </p>
                                            {inv.editReason && !inv.editReason.includes('|') && (
                                                <p className="text-xs text-zinc-400 mt-0.5">{inv.editReason}</p>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 text-sm text-zinc-500">
                                            {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="py-3 px-3 text-sm text-zinc-500">
                                            {Array.isArray(inv.items) ? `${inv.items.length} item${inv.items.length !== 1 ? 's' : ''}` : '—'}
                                        </td>
                                        <td className="py-3 px-3 font-bold text-zinc-900 dark:text-white text-sm">
                                            ₹{(inv.total || 0).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-3 text-sm text-zinc-500 capitalize">{inv.paymentMode || '—'}</td>
                                        <td className="py-3 px-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${sc.cls}`}>{sc.label}</span>
                                        </td>
                                        <td className="py-3 px-3">
                                            <button onClick={e => handleDelete(inv.id, e)}
                                                className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg text-rose-400 hover:text-rose-600 transition-colors">
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {filteredInvoices.length === 0 && (
                        <div className="text-center py-16 text-zinc-400">
                            <FileText size={40} className="mx-auto mb-3 opacity-30" />
                            <p>No invoices found</p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                        <p className="text-sm text-zinc-500">Page {currentPage} of {totalPages} ({filteredInvoices.length} total)</p>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronsLeft size={16} /></button>
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronLeft size={16} /></button>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronRight size={16} /></button>
                            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"><ChevronsRight size={16} /></button>
                        </div>
                    </div>
                )}
            </div>

            <ImportDataModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onSuccess={fetchInvoices} dataType="invoice" />

            {selectedInvoice && (
                <InvoiceDetailModal
                    invoice={selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    onNavigateToMember={handleNavigateToMember}
                    onRefresh={async () => {
                        const token = localStorage.getItem('eztracker_jwt_access_control_token');
                        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
                        const res = await fetch(`/api/invoices/${selectedInvoice.id}`, { headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName } });
                        if (res.ok) setSelectedInvoice(await res.json());
                        fetchInvoices();
                    }}
                />
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onClose={() => setConfirmModal({ isOpen: false, action: null, title: '', message: '' })}
                onConfirm={confirmModal.action}
                confirmText="Delete"
                isDestructive={true}
            />
        </div>
    );
}
