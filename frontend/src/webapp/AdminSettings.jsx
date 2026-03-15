import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { Save, Settings, DollarSign, Bell, Package, FileText, Plus, Trash2, Dumbbell, Pencil, Check, Building2, MessageSquare, Upload, Image as ImageIcon } from 'lucide-react';
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

    // Terms & Conditions
    const [terms, setTerms] = useState([]);
    const [isEditingTerm, setIsEditingTerm] = useState(null);
    const [termForm, setTermForm] = useState({ text: '', appliesTo: [] });

    // Gym Details
    const [gymDetails, setGymDetails] = useState({
        gymName: '', phone: '', whatsapp: '', email: '',
        slogan: '', website: '', address: '', city: '', state: '', pincode: '',
        phoneCountryCode: '+91',
    });
    const [gymLogoPreview, setGymLogoPreview] = useState(null);
    const [gymLogoFile, setGymLogoFile] = useState(null);
    const [savingGymDetails, setSavingGymDetails] = useState(false);

    // WhatsApp Templates
    const [waTemplates, setWaTemplates] = useState([]);
    const [activeTemplateType, setActiveTemplateType] = useState('Admission');
    const [editingTemplate, setEditingTemplate] = useState('');
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [templatePreview, setTemplatePreview] = useState('');

    const tabs = [
        { id: 'gymDetails', label: 'Gym Details', icon: Building2 },
        { id: 'general', label: 'General', icon: Settings },
        { id: 'gst', label: 'GST & Tax', icon: FileText },
        { id: 'pricing', label: 'Member Pricing', icon: DollarSign },
        { id: 'ptPricing', label: 'PT Pricing', icon: Dumbbell },
        { id: 'billing', label: 'Billing', icon: FileText },
        { id: 'stock', label: 'Stock Settings', icon: Package },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'terms', label: 'Terms & Conditions', icon: FileText },
        { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    ];

    useEffect(() => {
        fetchSettings();
        fetchPricingMatrix();
        fetchPtPricingMatrix();
        fetchTerms();
        fetchGymDetails();
        fetchWaTemplates();
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

    const fetchTerms = async () => {
        try {
            const res = await fetch('/api/terms', { headers: getAuthHeaders() });
            if (res.ok) setTerms(await res.json());
        } catch (e) {
            console.error('Failed to load terms', e);
        }
    };

    const fetchProteinDefaults = async () => {
        // deprecated: protein defaults managed per-supplement now
    };

    // ---- Gym Details ----
    const fetchGymDetails = async () => {
        try {
            const res = await fetch('/api/branch-details?include_logo=true', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setGymDetails({
                    gymName: data.gymName || '',
                    phone: data.phone || '',
                    whatsapp: data.whatsapp || '',
                    email: data.email || '',
                    slogan: data.slogan || '',
                    website: data.website || '',
                    address: data.address || '',
                    city: data.city || '',
                    state: data.state || '',
                    pincode: data.pincode || '',
                    phoneCountryCode: data.phoneCountryCode || '+91',
                });
                if (data.hasLogo && data.logoUrl) {
                    setGymLogoPreview(data.logoUrl);
                }
            }
        } catch (e) {
            console.error('Failed to load gym details', e);
        }
    };

    const handleGymDetailsChange = (e) => {
        setGymDetails(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleLogoSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            showToast('Only PNG, JPEG, or WebP images are allowed', 'error');
            return;
        }
        setGymLogoFile(file);
        setGymLogoPreview(URL.createObjectURL(file));
    };

    const handleSaveGymDetails = async () => {
        setSavingGymDetails(true);
        try {
            // Save details
            const res = await fetch('/api/branch-details', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(gymDetails)
            });
            if (!res.ok) throw new Error('Failed to save');

            // Upload logo if selected
            if (gymLogoFile) {
                const formData = new FormData();
                formData.append('file', gymLogoFile);
                const token = localStorage.getItem('eztracker_jwt_access_control_token');
                const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
                const logoRes = await fetch('/api/branch-details/logo', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'X-Database-Name': dbName,
                    },
                    body: formData
                });
                if (!logoRes.ok) throw new Error('Failed to upload logo');
                setGymLogoFile(null);
            }

            showToast('Gym details saved successfully', 'success');
        } catch (e) {
            showToast(e.message || 'Failed to save gym details', 'error');
        } finally {
            setSavingGymDetails(false);
        }
    };

    // ---- WhatsApp Templates ----
    const fetchWaTemplates = async () => {
        try {
            const res = await fetch('/api/whatsapp-templates', { headers: getAuthHeaders() });
            if (res.ok) {
                const data = await res.json();
                setWaTemplates(data);
                const active = data.find(t => t.templateType === activeTemplateType);
                if (active) setEditingTemplate(active.messageTemplate);
            }
        } catch (e) {
            console.error('Failed to load WhatsApp templates', e);
        }
    };

    useEffect(() => {
        const active = waTemplates.find(t => t.templateType === activeTemplateType);
        if (active) {
            setEditingTemplate(active.messageTemplate);
        }
    }, [activeTemplateType, waTemplates]);

    // Live preview
    useEffect(() => {
        const gymName = gymDetails.gymName || 'Your Gym';
        let rendered = editingTemplate
            .replace(/{customerName}/g, 'John Doe')
            .replace(/{gymName}/g, gymName)
            .replace(/{total}/g, '3,000')
            .replace(/{paidAmount}/g, '3,000')
            .replace(/{balance}/g, '0')
            .replace(/{planType}/g, 'Strength')
            .replace(/{planPeriod}/g, 'Monthly')
            .replace(/{date}/g, new Date().toLocaleDateString())
            .replace(/{paymentMode}/g, 'CASH')
            .replace(/{branchName}/g, 'Main Branch');
        setTemplatePreview(rendered);
    }, [editingTemplate, gymDetails.gymName]);

    const handleSaveTemplate = async () => {
        setSavingTemplate(true);
        try {
            const res = await fetch(`/api/whatsapp-templates/${activeTemplateType}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ messageTemplate: editingTemplate })
            });
            if (res.ok) {
                showToast('Template saved successfully', 'success');
                fetchWaTemplates();
            } else {
                showToast('Failed to save template', 'error');
            }
        } catch (e) {
            showToast('Failed to save template', 'error');
        } finally {
            setSavingTemplate(false);
        }
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

    const handleEditTerm = (term) => {
        setIsEditingTerm(term.id);
        setTermForm({ text: term.text, appliesTo: term.appliesTo });
    };

    const handleCancelEditTerm = () => {
        setIsEditingTerm(null);
        setTermForm({ text: '', appliesTo: [] });
    };

    const handleSaveTerm = async () => {
        if (!termForm.text || termForm.appliesTo.length === 0) {
            showToast('Text and at least one billing page are required', 'error');
            return;
        }
        try {
            const method = isEditingTerm ? 'PUT' : 'POST';
            const url = isEditingTerm ? `/api/terms/${isEditingTerm}` : '/api/terms';
            const res = await fetch(url, {
                method,
                headers: getAuthHeaders(),
                body: JSON.stringify({ ...termForm, isActive: true, sortOrder: 0 })
            });
            if (res.ok) {
                fetchTerms();
                handleCancelEditTerm();
                showToast(isEditingTerm ? 'Term updated' : 'Term added', 'success');
            } else {
                showToast('Failed to save term', 'error');
            }
        } catch (e) {
            showToast('Failed to save term', 'error');
        }
    };

    const handleDeleteTerm = async (id) => {
        setConfirmModal({
            isOpen: true,
            title: 'Delete Term',
            message: 'Are you sure you want to delete this term?',
            action: async () => {
                try {
                    const res = await fetch(`/api/terms/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
                    if (res.ok) {
                        fetchTerms();
                        showToast('Term deleted', 'success');
                    } else {
                        showToast('Failed to delete term', 'error');
                    }
                } catch (e) {
                    showToast('Failed to delete term', 'error');
                }
            }
        });
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

            {/* Terms & Conditions Tab */}
            {activeTab === 'terms' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Terms & Conditions Management</h2>
                    <p className="text-sm text-zinc-500 mb-6">Manage terms that appear on different billing pages and invoices. You can specify which billing type each term applies to.</p>

                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 mb-6">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3">{isEditingTerm ? 'Edit Term' : 'Add New Term'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className={labelStyle}>Term Text</label>
                                <textarea
                                    value={termForm.text}
                                    onChange={e => setTermForm({ ...termForm, text: e.target.value })}
                                    className={inputStyle}
                                    rows={3}
                                    placeholder="Enter term conditions here..."
                                />
                            </div>
                            <div>
                                <div>
                                    <label className={labelStyle}>Applies To</label>
                                    <div className="flex flex-wrap gap-3 mt-2">
                                        {['Admission', 'Re-Admission', 'Renewal', 'Protein'].map(page => (
                                            <label key={page} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                                <input
                                                    type="checkbox"
                                                    checked={termForm.appliesTo.includes(page)}
                                                    onChange={(e) => {
                                                        const newAppliesTo = e.target.checked
                                                            ? [...termForm.appliesTo, page]
                                                            : termForm.appliesTo.filter(p => p !== page);
                                                        setTermForm({ ...termForm, appliesTo: newAppliesTo });
                                                    }}
                                                    className="w-4 h-4 text-primary rounded focus:ring-primary"
                                                />
                                                {page}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                {isEditingTerm && (
                                    <button
                                        onClick={handleCancelEditTerm}
                                        className="px-4 py-2 text-sm font-bold bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    onClick={handleSaveTerm}
                                    disabled={!termForm.text || termForm.appliesTo.length === 0}
                                    className="px-4 py-2 text-sm font-bold bg-primary hover:bg-teal-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isEditingTerm ? <><Check size={16} /> Update Term</> : <><Plus size={16} /> Add Term</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {terms.length === 0 ? (
                            <div className="text-center py-8 text-sm text-zinc-500">No terms configured yet.</div>
                        ) : (
                            terms.map((term, idx) => (
                                <div key={term.id} className="bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-md px-2 py-0.5">#{idx + 1}</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {term.appliesTo.map(page => (
                                                        <span key={page} className="px-2 py-0.5 text-[10px] font-bold bg-primary/10 text-primary rounded-full uppercase tracking-wider">
                                                            {page}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">{term.text}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => handleEditTerm(term)} className="p-1.5 text-zinc-400 hover:text-primary transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700">
                                                <Pencil size={15} />
                                            </button>
                                            <button onClick={() => handleDeleteTerm(term.id)} className="p-1.5 text-zinc-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Gym Details Tab */}
            {activeTab === 'gymDetails' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Gym / Business Details</h2>
                    <p className="text-sm text-zinc-500 mb-6">These details appear on invoices, receipts, and WhatsApp messages.</p>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Logo Section */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-32 h-32 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-800">
                                {gymLogoPreview ? (
                                    <img src={gymLogoPreview} alt="Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <ImageIcon size={40} className="text-zinc-300" />
                                )}
                            </div>
                            <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium transition-colors">
                                <Upload size={16} />
                                {gymLogoFile ? 'Change Logo' : 'Upload Logo'}
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoSelect} />
                            </label>
                            {gymLogoFile && <span className="text-xs text-primary">{gymLogoFile.name}</span>}
                        </div>

                        {/* Details Fields */}
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelStyle}>Gym Name <span className="text-rose-500">*</span></label>
                                <input name="gymName" value={gymDetails.gymName} onChange={handleGymDetailsChange} className={inputStyle} placeholder="Your gym name" />
                            </div>
                            <div>
                                <label className={labelStyle}>Phone Country Code</label>
                                <input name="phoneCountryCode" value={gymDetails.phoneCountryCode} onChange={handleGymDetailsChange} className={inputStyle} placeholder="+91" />
                                <p className="text-xs text-zinc-400 mt-1">Auto-applied to phone/WhatsApp fields in billing forms</p>
                            </div>
                            <div>
                                <label className={labelStyle}>Phone</label>
                                <input name="phone" value={gymDetails.phone} onChange={handleGymDetailsChange} className={inputStyle} placeholder="Phone number" />
                            </div>
                            <div>
                                <label className={labelStyle}>WhatsApp</label>
                                <input name="whatsapp" value={gymDetails.whatsapp} onChange={handleGymDetailsChange} className={inputStyle} placeholder="WhatsApp number" />
                            </div>
                            <div>
                                <label className={labelStyle}>Email</label>
                                <input name="email" value={gymDetails.email} onChange={handleGymDetailsChange} className={inputStyle} placeholder="Email address" />
                            </div>
                            <div>
                                <label className={labelStyle}>Slogan / Tagline</label>
                                <input name="slogan" value={gymDetails.slogan} onChange={handleGymDetailsChange} className={inputStyle} placeholder="e.g. Train Hard, Stay Fit" />
                            </div>
                            <div>
                                <label className={labelStyle}>Website</label>
                                <input name="website" value={gymDetails.website} onChange={handleGymDetailsChange} className={inputStyle} placeholder="https://" />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelStyle}>Address</label>
                                <input name="address" value={gymDetails.address} onChange={handleGymDetailsChange} className={inputStyle} placeholder="Full address" />
                            </div>
                            <div>
                                <label className={labelStyle}>City</label>
                                <input name="city" value={gymDetails.city} onChange={handleGymDetailsChange} className={inputStyle} placeholder="City" />
                            </div>
                            <div>
                                <label className={labelStyle}>State</label>
                                <input name="state" value={gymDetails.state} onChange={handleGymDetailsChange} className={inputStyle} placeholder="State" />
                            </div>
                            <div>
                                <label className={labelStyle}>Pincode</label>
                                <input name="pincode" value={gymDetails.pincode} onChange={handleGymDetailsChange} className={inputStyle} placeholder="Pincode" />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end mt-6">
                        <button onClick={handleSaveGymDetails} disabled={savingGymDetails} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary hover:bg-teal-700 shadow-md transition-all disabled:opacity-50">
                            <Save size={16} />
                            {savingGymDetails ? 'Saving...' : 'Save Gym Details'}
                        </button>
                    </div>
                </div>
            )}

            {/* WhatsApp Templates Tab */}
            {activeTab === 'whatsapp' && (
                <div className={cardStyle}>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">WhatsApp Message Templates</h2>
                    <p className="text-sm text-zinc-500 mb-6">Customize the greeting message sent with invoice PDFs for each billing type.</p>

                    {/* Template Type Selector */}
                    <div className="flex gap-2 mb-6 flex-wrap">
                        {['Admission', 'Re-Admission', 'Renewal', 'Protein'].map(type => (
                            <button
                                key={type}
                                onClick={() => setActiveTemplateType(type)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTemplateType === type
                                    ? 'bg-primary text-white shadow-md'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Editor */}
                        <div>
                            <label className={labelStyle}>Message Template</label>
                            <textarea
                                value={editingTemplate}
                                onChange={(e) => setEditingTemplate(e.target.value)}
                                rows={6}
                                className={inputStyle + ' resize-none font-mono'}
                                placeholder="Type your WhatsApp message template here..."
                            />
                            <div className="mt-3">
                                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Available Placeholders (click to insert):</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {['{customerName}', '{gymName}', '{total}', '{paidAmount}', '{balance}', '{planType}', '{planPeriod}', '{date}', '{paymentMode}', '{branchName}'].map(ph => (
                                        <button
                                            key={ph}
                                            type="button"
                                            onClick={() => setEditingTemplate(prev => prev + ' ' + ph)}
                                            className="px-2 py-1 text-[11px] font-mono bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors cursor-pointer"
                                        >
                                            {ph}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Live Preview */}
                        <div>
                            <label className={labelStyle}>Live Preview</label>
                            <div className="bg-[#DCF8C6] dark:bg-[#005C4B] rounded-xl p-4 min-h-[160px] text-sm text-zinc-900 dark:text-white whitespace-pre-wrap shadow-inner">
                                {templatePreview || <span className="text-zinc-400 italic">Preview will appear here...</span>}
                            </div>
                            <p className="text-xs text-zinc-400 mt-2">This is how the message will appear in WhatsApp (with actual customer data).</p>
                        </div>
                    </div>

                    <div className="flex justify-end mt-6">
                        <button onClick={handleSaveTemplate} disabled={savingTemplate} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary hover:bg-teal-700 shadow-md transition-all disabled:opacity-50">
                            <Save size={16} />
                            {savingTemplate ? 'Saving...' : 'Save Template'}
                        </button>
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
