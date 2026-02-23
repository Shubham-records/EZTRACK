import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

const inputClass = "w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-primary outline-none transition-all";
const readOnlyClass = "w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 text-sm cursor-not-allowed";
const labelClass = "text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider";

export default function AddProteinModal({ isOpen, onClose, onSuccess }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const getInitialFormData = () => ({
        Year: new Date().getFullYear(),
        Month: new Date().toLocaleString('default', { month: 'long' }),
        Brand: '',
        ProductName: '',
        Flavour: '',
        Weight: '',
        Quantity: '',
        MRPPrice: '',
        LandingPrice: '',
        SellingPrice: '',
        TotalPrice: '',
        ProfitAmount: '',
        ExpiryDate: '',
        Remark: '',
    });

    const [formData, setFormData] = useState(getInitialFormData());

    // Auto-calculate Total Price = Quantity × Landing Price
    useEffect(() => {
        const qty = parseFloat(formData.Quantity) || 0;
        const landing = parseFloat(formData.LandingPrice) || 0;
        if (qty > 0 && landing > 0) {
            setFormData(prev => ({ ...prev, TotalPrice: (qty * landing).toFixed(2) }));
        } else {
            setFormData(prev => ({ ...prev, TotalPrice: '' }));
        }
    }, [formData.Quantity, formData.LandingPrice]);

    // Auto-calculate Profit Amount = Selling - Landing (per pcs)
    useEffect(() => {
        const selling = parseFloat(formData.SellingPrice) || 0;
        const landing = parseFloat(formData.LandingPrice) || 0;
        if (selling > 0 && landing > 0) {
            setFormData(prev => ({ ...prev, ProfitAmount: (selling - landing).toFixed(2) }));
        } else {
            setFormData(prev => ({ ...prev, ProfitAmount: '' }));
        }
    }, [formData.SellingPrice, formData.LandingPrice]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

            const payload = {
                Year: String(formData.Year),
                Month: formData.Month,
                Brand: formData.Brand,
                ProductName: formData.ProductName,
                Flavour: formData.Flavour,
                Weight: formData.Weight,
                Quantity: formData.Quantity,
                MRPPrice: formData.MRPPrice,
                LandingPrice: formData.LandingPrice,
                SellingPrice: formData.SellingPrice ? parseFloat(formData.SellingPrice) : null,
                TotalPrice: formData.TotalPrice,
                ProfitAmount: formData.ProfitAmount ? parseFloat(formData.ProfitAmount) : null,
                ExpiryDate: formData.ExpiryDate || null,
                Remark: formData.Remark,
            };

            const response = await fetch('/api/proteins', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`,
                    'X-Database-Name': dbName
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || 'Failed to add supplement');
            }

            showToast('Supplement added successfully', 'success');
            onSuccess();
            onClose();
            setFormData(getInitialFormData());
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto stitch-scrollbar flex flex-col">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add New Supplement</h2>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <form autoComplete="off" onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Product Info */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">Product Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className={labelClass}>Year *</label>
                                <input type="number" name="Year" value={formData.Year} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Month *</label>
                                <select name="Month" value={formData.Month} onChange={handleChange} required className={inputClass}>
                                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Brand *</label>
                                <input name="Brand" value={formData.Brand} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Product Name *</label>
                                <input name="ProductName" value={formData.ProductName} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Flavour *</label>
                                <input name="Flavour" value={formData.Flavour} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Weight *</label>
                                <input name="Weight" value={formData.Weight} onChange={handleChange} required placeholder="e.g. 1kg, 5lbs" className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Stock & Pricing */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">Stock & Pricing</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className={labelClass}>Quantity *</label>
                                <input type="number" name="Quantity" value={formData.Quantity} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>MRP (per pcs) *</label>
                                <input type="number" name="MRPPrice" value={formData.MRPPrice} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Landing Price (per pcs) *</label>
                                <input type="number" name="LandingPrice" value={formData.LandingPrice} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Selling Price (per pcs) *</label>
                                <input type="number" name="SellingPrice" value={formData.SellingPrice} onChange={handleChange} required placeholder="Your sale price" className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Total Price (auto)</label>
                                <input type="number" name="TotalPrice" value={formData.TotalPrice} readOnly placeholder="Qty × Landing" className={readOnlyClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Profit ₹ / pcs (auto)</label>
                                <input type="number" name="ProfitAmount" value={formData.ProfitAmount} readOnly placeholder="Selling − Landing" className={readOnlyClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Expiry Date *</label>
                                <input type="date" name="ExpiryDate" value={formData.ExpiryDate} onChange={handleChange} required className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Remark */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">Additional</h3>
                        <div className="space-y-1">
                            <label className={labelClass}>Remark</label>
                            <textarea name="Remark" value={formData.Remark} onChange={handleChange} rows={2} className={inputClass} />
                        </div>
                    </div>

                    <div className="sticky bottom-0 bg-white dark:bg-zinc-900 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                            {loading ? 'Saving...' : <><Save size={18} /> Save Supplement</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
