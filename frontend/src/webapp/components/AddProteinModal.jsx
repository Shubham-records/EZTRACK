import React, { useState } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';
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
        Remark: '',
        lots: [
            { lotNumber: '', quantity: '', purchasePrice: '', sellingPrice: '', expiryDate: '' }
        ]
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleLotChange = (index, key, value) => {
        const next = { ...formData };
        next.lots = next.lots.map((l, i) => i === index ? { ...l, [key]: value } : l);
        setFormData(next);
    };

    const addLot = () => {
        setFormData(prev => ({ ...prev, lots: [...prev.lots, { lotNumber: '', quantity: '', purchasePrice: '', sellingPrice: '', expiryDate: '' }] }));
    };

    const removeLot = (index) => {
        setFormData(prev => ({ ...prev, lots: prev.lots.filter((_, i) => i !== index) }));
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

            // Map frontend field names to backend expected keys
            const payload = {
                Year: finalData.Year,
                Month: finalData.Month,
                Brand: finalData.Brand,
                ProductName: finalData["Product Name"],
                Flavour: finalData.Flavour,
                Weight: finalData.Weight,
                Quantity: finalData.Quantity,
                MRPPrice: finalData["MRP Price(1 pcs)"],
                LandingPrice: finalData["Landing price(1 pcs)"],
                TotalPrice: finalData["Total price"],
                Remark: finalData.Remark,
                lots: finalData.lots.map(l => ({
                    lotNumber: l.lotNumber,
                    quantity: l.quantity,
                    purchasePrice: l.purchasePrice,
                    sellingPrice: l.sellingPrice,
                    expiryDate: l.expiryDate
                }))
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
                Remark: '',
                lots: [ { lotNumber: '', quantity: '', purchasePrice: '', sellingPrice: '', expiryDate: '' } ]
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

                    <div className="col-span-full">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-zinc-800 dark:text-white">Lots / Batches</h3>
                            <button type="button" onClick={addLot} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-md border border-green-100">
                                <Plus size={14} /> Add Lot
                            </button>
                        </div>
                        <div className="space-y-3">
                            {formData.lots.map((lot, idx) => (
                                <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                                    <div className="md:col-span-1">
                                        <label className="text-xs text-zinc-500">Lot No.</label>
                                        <input value={lot.lotNumber} onChange={(e) => handleLotChange(idx, 'lotNumber', e.target.value)} className="w-full px-2 py-1 rounded border border-zinc-200 bg-zinc-50" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs text-zinc-500">Qty</label>
                                        <input type="number" value={lot.quantity} onChange={(e) => handleLotChange(idx, 'quantity', e.target.value)} className="w-full px-2 py-1 rounded border border-zinc-200 bg-zinc-50" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs text-zinc-500">Purchase</label>
                                        <input type="number" value={lot.purchasePrice} onChange={(e) => handleLotChange(idx, 'purchasePrice', e.target.value)} className="w-full px-2 py-1 rounded border border-zinc-200 bg-zinc-50" />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="text-xs text-zinc-500">Selling</label>
                                        <input type="number" value={lot.sellingPrice} onChange={(e) => handleLotChange(idx, 'sellingPrice', e.target.value)} className="w-full px-2 py-1 rounded border border-zinc-200 bg-zinc-50" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-xs text-zinc-500">Expiry</label>
                                        <div className="flex gap-2">
                                            <input type="date" value={lot.expiryDate} onChange={(e) => handleLotChange(idx, 'expiryDate', e.target.value)} className="w-full px-2 py-1 rounded border border-zinc-200 bg-zinc-50" />
                                            <button type="button" onClick={() => removeLot(idx)} className="inline-flex items-center gap-2 px-2 py-1 rounded border border-zinc-200 bg-red-50 text-red-700">
                                                <Trash2 size={14} /> Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
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
