import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { Save, Settings, DollarSign, Bell, Package, FileText, Plus, Trash2, Dumbbell } from 'lucide-react';
import AddPlanModal from './components/AddPlanModal';
import ConfirmModal from './components/ConfirmModal';

const inputStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all";
const labelStyle = "block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1";
const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";

export default function AdminSettings() {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('general');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, title: '', message: '' });
    const [isAddPlanModalOpen, setIsAddPlanModalOpen] = useState(false);
    const [isAddPtPlanModalOpen, setIsAddPtPlanModalOpen] = useState(false);

    const [settings, setSettings] = useState({
        // General
        currency: 'INR',
        dateFormat: 'DD/MM/YYYY',
        timezone: 'Asia/Kolkata',
        financialYearStart: 'April',
        // GST
        enableGST: false,
        memberGSTPercent: 18,
        proteinGSTPercent: 18,
        gstin: '',
        showGSTBreakup: true,
        hsnService: '99979',
        hsnGoods: '21069099',
        // Billing
        invoicePrefix: 'EZT-',
        receiptPrefix: 'RCP-',
        invoiceStartNumber: 1001,
        showLogoOnInvoice: true,
        showTermsOnInvoice: true,
        invoiceTermsText: '',
        // Stock
        lowStockThreshold: 5,
        expiryWarningDays: 30,
        // Notifications
        enableWhatsAppReminders: true,
        reminderDaysBefore: 3,
        expiryRange: 30, // Default 30 days
        postExpiryGraceDays: 30, // Default 30 days
        admissionExpiryDays: 365, // Default 365 days
        readmissionDiscount: 50, // Default 50%
        // Fees
        admissionFee: 0,
        reAdmissionFee: 0,
        enablePersonalTraining: false,
    });

    const [initialSettings, setInitialSettings] = useState(null);
    const [pricingMatrix, setPricingMatrix] = useState({});
    const [initialPricingMatrix, setInitialPricingMatrix] = useState({});

    const [ptPricingMatrix, setPtPricingMatrix] = useState({});
    const [initialPtPricingMatrix, setInitialPtPricingMatrix] = useState({});

    const tabs = [
        { id: 'general', label: 'General', icon: Settings },
        { id: 'gst', label: 'GST & Tax', icon: FileText },
        { id: 'pricing', label: 'Member Pricing', icon: DollarSign },
        { id: 'ptPricing', label: 'PT Pricing', icon: Dumbbell },
        // Removed Protein Pricing tab as pricing will be managed per-supplement
        { id: 'billing', label: 'Billing', icon: FileText },
        { id: 'stock', label: 'Stock Settings', icon: Package },
        { id: 'notifications', label: 'Notifications', icon: Bell },
    ];

    useEffect(() => {
        fetchSettings();
        fetchPricingMatrix();
        fetchPtPricingMatrix();
    }, []);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName,
        };
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setSettings(prev => {
                    const next = { ...prev, ...data };
                    setInitialSettings(next);
                    return next;
                });
            }
        } catch (e) {
            showToast('Failed to load settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchPricingMatrix = async () => {
        try {
            const res = await fetch('/api/settings/pricing/member-matrix', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setPricingMatrix(data);
                setInitialPricingMatrix(data);
            }
        } catch (e) {
            console.error('Failed to load pricing matrix', e);
        }
    };

    const fetchPtPricingMatrix = async () => {
        try {
            const res = await fetch('/api/settings/pricing/pt-matrix', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setPtPricingMatrix(data);
                setInitialPtPricingMatrix(data);
            }
        } catch (e) {
            console.error('Failed to load PT pricing matrix', e);
        }
    };

    const fetchProteinDefaults = async () => {
        // deprecated: protein defaults managed per-supplement now
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value)
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        let success = true;

        try {
            // Save Settings (General, GST, Billing, Stock, Notifications)
            if (JSON.stringify(settings) !== JSON.stringify(initialSettings)) {
                const res = await fetch('/api/settings', {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(settings)
                });
                if (res.ok) {
                    setInitialSettings(settings);
                } else {
                    success = false;
                    showToast('Failed to save general settings', 'error');
                }
            }

            // Save Pricing Matrix
            if (JSON.stringify(pricingMatrix) !== JSON.stringify(initialPricingMatrix)) {
                const data = {};
                for (const [plan, periods] of Object.entries(pricingMatrix)) {
                    data[plan] = {};
                    for (const [period, config] of Object.entries(periods)) {
                        data[plan][period] = config.price;
                    }
                }

                const res = await fetch('/api/settings/pricing/member-matrix/bulk', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    setInitialPricingMatrix(pricingMatrix);
                } else {
                    success = false;
                    showToast('Failed to save pricing', 'error');
                }
            }

            // Save PT Pricing Matrix
            if (JSON.stringify(ptPricingMatrix) !== JSON.stringify(initialPtPricingMatrix)) {
                const data = {};
                for (const [plan, periods] of Object.entries(ptPricingMatrix)) {
                    data[plan] = {};
                    for (const [period, config] of Object.entries(periods)) {
                        data[plan][period] = config.price;
                    }
                }

                const res = await fetch('/api/settings/pricing/pt-matrix/bulk', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    setInitialPtPricingMatrix(ptPricingMatrix);
                } else {
                    success = false;
                    showToast('Failed to save PT pricing', 'error');
                }
            }

            // Protein defaults removed - pricing is handled per-supplement

            if (success) {
                showToast('All changes saved successfully', 'success');
            }
        } catch (e) {
            showToast('An error occurred while saving', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleAddPlan = (name) => {
        if (pricingMatrix[name]) {
            showToast(`Plan "${name}" already exists`, 'error');
            return;
        }
        setPricingMatrix(prev => ({ ...prev, [name]: {} }));
        showToast(`Plan "${name}" added`, 'success');
        setIsAddPlanModalOpen(false);
    };

    const handlePricingChange = (plan, period, value) => {
        setPricingMatrix(prev => ({
            ...prev,
            [plan]: {
                ...(prev[plan] || {}),
                [period]: { ...(prev[plan]?.[period] || {}), price: parseFloat(value) || 0 }
            }
        }));
    };

    const handleAddPtPlan = (name) => {
        if (ptPricingMatrix[name]) {
            showToast(`PT Plan "${name}" already exists`, 'error');
            return;
        }
        setPtPricingMatrix(prev => ({ ...prev, [name]: {} }));
        showToast(`PT Plan "${name}" added`, 'success');
        setIsAddPtPlanModalOpen(false);
    };

    const handlePtPricingChange = (plan, period, value) => {
        setPtPricingMatrix(prev => ({
            ...prev,
            [plan]: {
                ...(prev[plan] || {}),
                [period]: { ...(prev[plan]?.[period] || {}), price: parseFloat(value) || 0 }
            }
        }));
    };

    // Removed individual save handlers as we now have a global save

    // Protein defaults removed

    // Removed individual save handlers as we now have a global save

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const periods = ['Daily', 'Monthly', 'Quaterly', 'HalfYearly', 'Yearly'];
    const defaultBrands = ['Optimum Nutrition', 'MuscleBlaze', 'Dymatize', 'MyProtein', 'GNC', 'MuscleTech'];

    const hasChanges = () => {
        const settingsChanged = JSON.stringify(settings) !== JSON.stringify(initialSettings);
        const pricingChanged = JSON.stringify(pricingMatrix) !== JSON.stringify(initialPricingMatrix);
        const ptPricingChanged = JSON.stringify(ptPricingMatrix) !== JSON.stringify(initialPtPricingMatrix);

        return settingsChanged || pricingChanged || ptPricingChanged;
    };

    const showSaveButton = hasChanges();

    return (
        <div className=" mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h1>
                    <p className="text-sm text-zinc-500 mt-1">Configure your gym's preferences and pricing</p>
                </div>
                {showSaveButton && (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary hover:bg-teal-700 shadow-md transition-all disabled:opacity-50 animate-in fade-in slide-in-from-right-4 duration-300"
                    >
                        <Save size={16} />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">General Settings</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelStyle}>Currency</label>
                            <select name="currency" value={settings.currency} onChange={handleChange} className={inputStyle}>
                                <option value="INR">INR (₹)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelStyle}>Date Format</label>
                            <select name="dateFormat" value={settings.dateFormat} onChange={handleChange} className={inputStyle}>
                                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelStyle}>Timezone</label>
                            <select name="timezone" value={settings.timezone} onChange={handleChange} className={inputStyle}>
                                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                                <option value="UTC">UTC</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelStyle}>Financial Year Start</label>
                            <select name="financialYearStart" value={settings.financialYearStart} onChange={handleChange} className={inputStyle}>
                                <option value="April">April</option>
                                <option value="January">January</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelStyle}>Plan Expiry Alert (Days before Due Date)</label>
                            <input type="number" name="expiryRange" value={settings.expiryRange || 30} onChange={handleChange} className={inputStyle} />
                            <p className="text-xs text-zinc-500 mt-1">Days to consider members as "Expiring Soon"</p>
                        </div>
                        <div>
                            <label className={labelStyle}>Plan Expiry Grace (Days after Due Date)</label>
                            <input type="number" name="postExpiryGraceDays" value={settings.postExpiryGraceDays || 30} onChange={handleChange} className={inputStyle} />
                            <p className="text-xs text-zinc-500 mt-1">Days after expiry to keep in "Expiring Soon"</p>
                        </div>
                        <div>
                            <label className={labelStyle}>Admission Expiry (Days after Due Date)</label>
                            <input type="number" name="admissionExpiryDays" value={settings.admissionExpiryDays || 365} onChange={handleChange} className={inputStyle} />
                            <p className="text-xs text-zinc-500 mt-1">Days until admission is revoked</p>
                        </div>
                        <div>
                            <label className={labelStyle}>Readmission Discount (%)</label>
                            <input type="number" name="readmissionDiscount" value={settings.readmissionDiscount || 50} onChange={handleChange} className={inputStyle} />
                            <p className="text-xs text-zinc-500 mt-1">Discount for returning members</p>
                        </div>
                    </div>
                </div>
            )}

            {/* GST Tab */}
            {activeTab === 'gst' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">GST & Tax Configuration</h2>

                    <div className="flex items-center gap-3 mb-6 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                        <input
                            type="checkbox"
                            id="enableGST"
                            name="enableGST"
                            checked={settings.enableGST}
                            onChange={handleChange}
                            className="w-5 h-5 text-primary rounded focus:ring-primary"
                        />
                        <label htmlFor="enableGST" className="text-sm font-medium text-zinc-900 dark:text-white">
                            Enable GST Calculation
                        </label>
                    </div>

                    {settings.enableGST && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className={labelStyle}>Member GST %</label>
                                    <input type="number" name="memberGSTPercent" value={settings.memberGSTPercent} onChange={handleChange} className={inputStyle} />
                                </div>
                                <div className="space-y-2">
                                    <label className={labelStyle}>Protein GST %</label>
                                    <input
                                        type="number"
                                        name="proteinGSTPercent"
                                        value={settings.proteinGSTPercent}
                                        onChange={handleInputChange}
                                        className={inputStyle}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className={labelStyle}>GSTIN</label>
                                    <input type="text" name="gstin" value={settings.gstin || ''} onChange={handleChange} placeholder="Enter your GSTIN" className={inputStyle} />
                                </div>
                                <div className="flex items-center gap-3 pt-6">
                                    <input
                                        type="checkbox"
                                        id="showGSTBreakup"
                                        name="showGSTBreakup"
                                        checked={settings.showGSTBreakup}
                                        onChange={handleChange}
                                        className="w-4 h-4 text-primary rounded focus:ring-primary"
                                    />
                                    <label htmlFor="showGSTBreakup" className="text-sm text-zinc-700 dark:text-zinc-300">
                                        Show GST breakup on invoices
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelStyle}>HSN Code (Services - Memberships)</label>
                                    <input type="text" name="hsnService" value={settings.hsnService || ''} onChange={handleChange} className={inputStyle} />
                                </div>
                                <div>
                                    <label className={labelStyle}>HSN Code (Goods - Proteins)</label>
                                    <input type="text" name="hsnGoods" value={settings.hsnGoods || ''} onChange={handleChange} className={inputStyle} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Member Pricing Tab */}
            {activeTab === 'pricing' && (
                <div className={cardStyle}>
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Member Pricing Matrix</h2>
                            <p className="text-sm text-zinc-500">Set prices for each plan type. Add custom plans as needed.</p>
                        </div>
                        <button
                            onClick={() => setIsAddPlanModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                        >
                            <Plus size={14} />
                            Add Plan
                        </button>
                    </div>

                    <AddPlanModal
                        isOpen={isAddPlanModalOpen}
                        onClose={() => setIsAddPlanModalOpen(false)}
                        onAdd={handleAddPlan}
                    />

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-800">
                                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase">Plan / Period</th>
                                    {periods.map(p => (
                                        <th key={p} className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">{p}</th>
                                    ))}
                                    <th className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(pricingMatrix).length === 0 && (
                                    <tr>
                                        <td colSpan={periods.length + 2} className="px-4 py-8 text-center text-zinc-500 text-sm">
                                            No plans configured. Click "Add Plan" to start.
                                        </td>
                                    </tr>
                                )}
                                {Object.keys(pricingMatrix).map(plan => (
                                    <tr key={plan} className="border-b border-zinc-100 dark:border-zinc-800">
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">{plan}</td>
                                        {periods.map(period => (
                                            <td key={period} className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={pricingMatrix[plan]?.[period]?.price || ''}
                                                    onChange={(e) => handlePricingChange(plan, period, e.target.value)}
                                                    placeholder="₹"
                                                    className="w-24 text-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                />
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => {
                                                    setConfirmModal({
                                                        isOpen: true,
                                                        title: 'Delete Plan',
                                                        message: `Delete plan "${plan}"? This will hide it from future selections.`,
                                                        action: async () => {
                                                            try {
                                                                const res = await fetch(`/api/settings/pricing/member-matrix/${encodeURIComponent(plan)}`, {
                                                                    method: 'DELETE',
                                                                    headers: getAuthHeaders()
                                                                });
                                                                if (res.ok) {
                                                                    setPricingMatrix(prev => {
                                                                        const next = { ...prev };
                                                                        delete next[plan];
                                                                        setInitialPricingMatrix(next); // Sync initial state
                                                                        return next;
                                                                    });
                                                                    showToast('Plan deleted', 'success');
                                                                } else {
                                                                    throw new Error();
                                                                }
                                                            } catch (e) {
                                                                showToast('Failed to delete plan', 'error');
                                                            }
                                                        }
                                                    });
                                                }}
                                                className="text-zinc-400 hover:text-rose-500 transition-colors p-1"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PT Pricing Tab */}
            {activeTab === 'ptPricing' && (
                <div className={cardStyle}>
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Personal Training Pricing Matrix</h2>
                            <p className="text-sm text-zinc-500">Set prices for each PT plan type. Add custom plans (e.g., 1-on-1, Group, Batch).</p>
                        </div>
                        <button
                            onClick={() => setIsAddPtPlanModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                        >
                            <Plus size={14} />
                            Add PT Plan
                        </button>
                    </div>

                    <div className="flex items-center gap-3 mb-6 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                        <input
                            type="checkbox"
                            id="enablePersonalTraining"
                            name="enablePersonalTraining"
                            checked={settings.enablePersonalTraining}
                            onChange={handleChange}
                            className="w-5 h-5 text-primary rounded focus:ring-primary"
                        />
                        <div>
                            <label htmlFor="enablePersonalTraining" className="text-sm font-medium text-zinc-900 dark:text-white">
                                Enable Personal Training
                            </label>
                            <p className="text-xs text-zinc-500">When enabled, billing forms will show an option to add personal training</p>
                        </div>
                    </div>

                    <AddPlanModal
                        isOpen={isAddPtPlanModalOpen}
                        onClose={() => setIsAddPtPlanModalOpen(false)}
                        onAdd={handleAddPtPlan}
                    />

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-800">
                                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase">PT Plan / Period</th>
                                    {periods.map(p => (
                                        <th key={p} className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">{p}</th>
                                    ))}
                                    <th className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(ptPricingMatrix).length === 0 && (
                                    <tr>
                                        <td colSpan={periods.length + 2} className="px-4 py-8 text-center text-zinc-500 text-sm">
                                            No PT plans configured. Click "Add PT Plan" to start.
                                        </td>
                                    </tr>
                                )}
                                {Object.keys(ptPricingMatrix).map(plan => (
                                    <tr key={plan} className="border-b border-zinc-100 dark:border-zinc-800">
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                                            <Dumbbell size={16} className="text-primary" />
                                            {plan}
                                        </td>
                                        {periods.map(period => (
                                            <td key={period} className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    value={ptPricingMatrix[plan]?.[period]?.price || ''}
                                                    onChange={(e) => handlePtPricingChange(plan, period, e.target.value)}
                                                    placeholder="₹"
                                                    className="w-24 text-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                />
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => {
                                                    setConfirmModal({
                                                        isOpen: true,
                                                        title: 'Delete PT Plan',
                                                        message: `Delete PT plan "${plan}"?`,
                                                        action: async () => {
                                                            try {
                                                                const res = await fetch(`/api/settings/pricing/pt-matrix/${encodeURIComponent(plan)}`, {
                                                                    method: 'DELETE',
                                                                    headers: getAuthHeaders()
                                                                });
                                                                if (res.ok) {
                                                                    setPtPricingMatrix(prev => {
                                                                        const next = { ...prev };
                                                                        delete next[plan];
                                                                        setInitialPtPricingMatrix(next);
                                                                        return next;
                                                                    });
                                                                    showToast('PT plan deleted', 'success');
                                                                } else {
                                                                    throw new Error();
                                                                }
                                                            } catch (e) {
                                                                showToast('Failed to delete PT plan', 'error');
                                                            }
                                                        }
                                                    });
                                                }}
                                                className="text-zinc-400 hover:text-rose-500 transition-colors p-1"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Protein Pricing Tab */}
            {activeTab === 'protein' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Protein Pricing Defaults by Brand</h2>
                    <p className="text-sm text-zinc-500 mb-4">Default margins applied to new products. Can be overridden per product.</p>

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-800">
                                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase">Brand</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">Margin Type</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">Margin Value</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold text-zinc-500 uppercase">Offer Discount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaultBrands.map(brand => (
                                    <tr key={brand} className="border-b border-zinc-100 dark:border-zinc-800">
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">{brand}</td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={proteinDefaults[brand]?.marginType || 'percentage'}
                                                onChange={(e) => handleProteinDefaultChange(brand, 'marginType', e.target.value)}
                                                className="w-full text-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                                            >
                                                <option value="percentage">Percentage (%)</option>
                                                <option value="fixed">Fixed (₹)</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="number"
                                                value={proteinDefaults[brand]?.marginValue || ''}
                                                onChange={(e) => handleProteinDefaultChange(brand, 'marginValue', e.target.value)}
                                                placeholder={proteinDefaults[brand]?.marginType === 'fixed' ? '₹' : '%'}
                                                className="w-24 text-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none mx-auto block"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="number"
                                                value={proteinDefaults[brand]?.offerDiscount || ''}
                                                onChange={(e) => handleProteinDefaultChange(brand, 'offerDiscount', e.target.value)}
                                                placeholder="₹"
                                                className="w-24 text-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary outline-none mx-auto block"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Billing & Invoice Settings</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className={labelStyle}>Invoice Prefix</label>
                            <input type="text" name="invoicePrefix" value={settings.invoicePrefix} onChange={handleChange} className={inputStyle} />
                        </div>
                        <div>
                            <label className={labelStyle}>Receipt Prefix</label>
                            <input type="text" name="receiptPrefix" value={settings.receiptPrefix} onChange={handleChange} className={inputStyle} />
                        </div>
                        <div>
                            <label className={labelStyle}>Starting Invoice Number</label>
                            <input type="number" name="invoiceStartNumber" value={settings.invoiceStartNumber} onChange={handleChange} className={inputStyle} />
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-700">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">Default Fees</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelStyle}>Admission Fee (₹)</label>
                                <input type="number" name="admissionFee" value={settings.admissionFee} onChange={handleChange} className={inputStyle} min="0" />
                            </div>
                            <div>
                                <label className={labelStyle}>Re-Admission Fee (₹)</label>
                                <input type="number" name="reAdmissionFee" value={settings.reAdmissionFee} onChange={handleChange} className={inputStyle} min="0" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 space-y-3">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="showLogoOnInvoice"
                                name="showLogoOnInvoice"
                                checked={settings.showLogoOnInvoice}
                                onChange={handleChange}
                                className="w-4 h-4 text-primary rounded focus:ring-primary"
                            />
                            <label htmlFor="showLogoOnInvoice" className="text-sm text-zinc-700 dark:text-zinc-300">
                                Show logo on invoices
                            </label>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="showTermsOnInvoice"
                                name="showTermsOnInvoice"
                                checked={settings.showTermsOnInvoice}
                                onChange={handleChange}
                                className="w-4 h-4 text-primary rounded focus:ring-primary"
                            />
                            <label htmlFor="showTermsOnInvoice" className="text-sm text-zinc-700 dark:text-zinc-300">
                                Show terms & conditions on invoices
                            </label>
                        </div>
                    </div>

                    {settings.showTermsOnInvoice && (
                        <div className="mt-4">
                            <label className={labelStyle}>Invoice Terms & Conditions</label>
                            <textarea
                                name="invoiceTermsText"
                                value={settings.invoiceTermsText || ''}
                                onChange={handleChange}
                                rows={4}
                                placeholder="Enter terms and conditions to display on invoices..."
                                className={inputStyle}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Stock Tab */}
            {activeTab === 'stock' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Stock Management Settings</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelStyle}>Low Stock Threshold</label>
                            <input type="number" name="lowStockThreshold" value={settings.lowStockThreshold} onChange={handleChange} className={inputStyle} />
                            <p className="text-xs text-zinc-500 mt-1">Alert when quantity falls below this</p>
                        </div>
                        <div>
                            <label className={labelStyle}>Expiry Warning (Days)</label>
                            <input type="number" name="expiryWarningDays" value={settings.expiryWarningDays} onChange={handleChange} className={inputStyle} />
                            <p className="text-xs text-zinc-500 mt-1">Highlight products expiring within</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Notification Settings</h2>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                            <input
                                type="checkbox"
                                id="enableWhatsAppReminders"
                                name="enableWhatsAppReminders"
                                checked={settings.enableWhatsAppReminders}
                                onChange={handleChange}
                                className="w-5 h-5 text-primary rounded focus:ring-primary"
                            />
                            <div>
                                <label htmlFor="enableWhatsAppReminders" className="text-sm font-medium text-zinc-900 dark:text-white">
                                    Enable WhatsApp Reminders
                                </label>
                                <p className="text-xs text-zinc-500">Generate WhatsApp links for expiry reminders</p>
                            </div>
                        </div>

                        {settings.enableWhatsAppReminders && (
                            <div className="max-w-xs">
                                <label className={labelStyle}>Reminder Days Before Expiry</label>
                                <input type="number" name="reminderDaysBefore" value={settings.reminderDaysBefore} onChange={handleChange} className={inputStyle} />
                                <p className="text-xs text-zinc-500 mt-1">Show reminder button this many days before expiry</p>
                            </div>
                        )}
                    </div>
                </div>
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
