import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

export default function AddProteinModal({ isOpen, onClose, onSuccess }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        Year: new Date().getFullYear(),
        Month: new Date().toLocaleString('default', { month: 'long' }),
        Brand: '',
        "Product Name": '',
        Flavour: '',
        Weight: '',
        Quantity: '',
        "MRP Price(1 pcs)": '',
        "Landing price(1 pcs)": '',
        "Total price": '',
        Remark: ''
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

            // Calculate total price if not manually entered
            let finalData = { ...formData };
            if (finalData.Quantity && finalData["Landing price(1 pcs)"] && !finalData["Total price"]) {
                finalData["Total price"] = (parseFloat(finalData.Quantity) * parseFloat(finalData["Landing price(1 pcs)"])).toString();
            }

            const response = await fetch('/api/proteins', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`,
                    'X-Database-Name': dbName
                },
                body: JSON.stringify(finalData)
            });

            if (!response.ok) throw new Error('Failed to add supplement');

            showToast('Supplement added successfully', 'success');
            onSuccess();
            onClose();
            // Reset form
            setFormData({
                Year: new Date().getFullYear(),
                Month: new Date().toLocaleString('default', { month: 'long' }),
                Brand: '',
                "Product Name": '',
                Flavour: '',
                Weight: '',
                Quantity: '',
                "MRP Price(1 pcs)": '',
                "Landing price(1 pcs)": '',
                "Total price": '',
                Remark: ''
            });
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto stitch-scrollbar flex flex-col">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add New Supplement</h2>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <form autoComplete="off" onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Year</label>
                        <input type="number" name="Year" value={formData.Year} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Month</label>
                        <select name="Month" value={formData.Month} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Brand *</label>
                        <input name="Brand" value={formData.Brand} onChange={handleChange} required className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Product Name *</label>
                        <input name="Product Name" value={formData["Product Name"]} onChange={handleChange} required className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Flavour</label>
                        <input name="Flavour" value={formData.Flavour} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Weight</label>
                        <input name="Weight" value={formData.Weight} onChange={handleChange} placeholder="e.g. 1kg, 5lbs" className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Quantity *</label>
                        <input type="number" name="Quantity" value={formData.Quantity} onChange={handleChange} required className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">MRP (per pcs)</label>
                        <input type="number" name="MRP Price(1 pcs)" value={formData["MRP Price(1 pcs)"]} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Landing Price (per pcs)</label>
                        <input type="number" name="Landing price(1 pcs)" value={formData["Landing price(1 pcs)"]} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Total Price</label>
                        <input type="number" name="Total price" value={formData["Total price"]} onChange={handleChange} placeholder="Auto-calc if empty" className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="col-span-full space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Remark</label>
                        <textarea name="Remark" value={formData.Remark} onChange={handleChange} rows={2} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>

                    <div className="col-span-full mt-6 sticky bottom-0 bg-white dark:bg-zinc-900 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
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
