import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

const inputClass = "w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-primary outline-none transition-all";
const labelClass = "text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider";

export default function AddMemberModal({ isOpen, onClose, onSuccess }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const getInitialFormData = () => ({
        Name: '',
        MembershipReceiptnumber: '',
        Gender: 'Male',
        Age: '',
        height: '',
        weight: '',
        DateOfJoining: new Date().toISOString().split('T')[0],
        DateOfReJoin: '',
        Billtype: '',
        PlanPeriod: '',
        PlanType: '',
        LastPaymentDate: new Date().toISOString().split('T')[0],
        NextDuedate: '',
        LastPaymentAmount: '',
        RenewalReceiptNumber: '',
        MembershipExpiryDate: '',
        Aadhaar: '',
        Address: '',
        Mobile: '',
        Whatsapp: '',
        Remark: '',
    });

    const [formData, setFormData] = useState(getInitialFormData());
    const [plans, setPlans] = useState([]);
    const [pricingMatrix, setPricingMatrix] = useState({});

    const getAuthHeaders = () => {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName
        };
    };

    useEffect(() => {
        if (!isOpen) return;

        // Fetch plans
        const fetchPlans = async () => {
            try {
                const res = await fetch('/api/settings/pricing/member-matrix', { headers: getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setPricingMatrix(data);
                    setPlans(Object.keys(data));
                }
            } catch (e) {
                console.error("Failed to fetch plans", e);
            }
        };

        // Fetch next client number
        const fetchClientNumber = async () => {
            try {
                const res = await fetch('/api/members/generate-client-number', { headers: getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    setFormData(prev => ({ ...prev, MembershipReceiptnumber: data.clientNumber }));
                }
            } catch (e) {
                console.error("Failed to fetch client number", e);
            }
        };

        fetchPlans();
        fetchClientNumber();
    }, [isOpen]);

    // Auto-calculate NextDuedate and MembershipExpiryDate from PlanPeriod
    useEffect(() => {
        if (formData.PlanPeriod && formData.DateOfJoining) {
            const periodMap = {
                'Monthly': 1, 'Quarterly': 3, 'Half Yearly': 6, 'Yearly': 12,
                '1 Month': 1, '3 Months': 3, '6 Months': 6, '12 Months': 12,
            };
            const months = periodMap[formData.PlanPeriod];
            if (months) {
                const joinDate = new Date(formData.DateOfJoining);
                const dueDate = new Date(joinDate);
                dueDate.setMonth(dueDate.getMonth() + months);
                const dueDateStr = dueDate.toISOString().split('T')[0];
                setFormData(prev => ({
                    ...prev,
                    NextDuedate: dueDateStr,
                    MembershipExpiryDate: dueDateStr
                }));
            }
        }
    }, [formData.PlanPeriod, formData.DateOfJoining]);

    // Auto-set price from plan matrix
    useEffect(() => {
        if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
            const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
            if (priceConfig && priceConfig.price) {
                setFormData(prev => ({ ...prev, LastPaymentAmount: priceConfig.price }));
            }
        }
    }, [formData.PlanType, formData.PlanPeriod]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await fetch('/api/members', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.detail || 'Failed to add member');
            }

            showToast('Member added successfully', 'success');
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
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto stitch-scrollbar flex flex-col">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add New Member</h2>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <form autoComplete="off" onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Personal Information */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">Personal Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className={labelClass}>Name *</label>
                                <input name="Name" value={formData.Name} onChange={handleChange} required className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Client No.</label>
                                <input type="number" name="MembershipReceiptnumber" value={formData.MembershipReceiptnumber} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Gender</label>
                                <select name="Gender" value={formData.Gender} onChange={handleChange} className={inputClass}>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Age</label>
                                <input type="number" name="Age" value={formData.Age} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Height</label>
                                <input name="height" value={formData.height} onChange={handleChange} placeholder="e.g. 5.8" className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Weight (kg)</label>
                                <input type="number" name="weight" value={formData.weight} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Mobile</label>
                                <input name="Mobile" value={formData.Mobile} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>WhatsApp</label>
                                <input name="Whatsapp" value={formData.Whatsapp} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Aadhaar</label>
                                <input name="Aadhaar" value={formData.Aadhaar} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1 md:col-span-2 lg:col-span-3">
                                <label className={labelClass}>Address</label>
                                <input name="Address" value={formData.Address} onChange={handleChange} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Membership Details */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">Membership Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label className={labelClass}>Joining Date</label>
                                <input type="date" name="DateOfJoining" value={formData.DateOfJoining} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Bill Type</label>
                                <select name="Billtype" value={formData.Billtype} onChange={handleChange} className={inputClass}>
                                    <option value="">Select</option>
                                    <option value="Admission">Admission</option>
                                    <option value="Re-Admission">Re-Admission</option>
                                    <option value="Renewal">Renewal</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Plan Type</label>
                                <select name="PlanType" value={formData.PlanType} onChange={handleChange} className={inputClass}>
                                    <option value="" disabled hidden>Select Plan</option>
                                    {plans.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Duration</label>
                                <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleChange} className={inputClass}>
                                    <option value="" disabled hidden>Select Duration</option>
                                    {formData.PlanType && pricingMatrix[formData.PlanType] ? (
                                        Object.keys(pricingMatrix[formData.PlanType]).map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))
                                    ) : (
                                        <option value="" disabled>Select a Plan first</option>
                                    )}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Last Payment Date</label>
                                <input type="date" name="LastPaymentDate" value={formData.LastPaymentDate} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Next Due Date</label>
                                <input type="date" name="NextDuedate" value={formData.NextDuedate} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Membership Expiry Date</label>
                                <input type="date" name="MembershipExpiryDate" value={formData.MembershipExpiryDate} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Amount Paid (₹)</label>
                                <input type="number" name="LastPaymentAmount" value={formData.LastPaymentAmount} onChange={handleChange} className={inputClass} />
                            </div>
                            <div className="space-y-1">
                                <label className={labelClass}>Renewal Receipt No.</label>
                                <input type="number" name="RenewalReceiptNumber" value={formData.RenewalReceiptNumber} onChange={handleChange} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Additional */}
                    <div>
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">Additional</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className={labelClass}>Remark</label>
                                <textarea name="Remark" value={formData.Remark} onChange={handleChange} rows={2} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    <div className="sticky bottom-0 bg-white dark:bg-zinc-900 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50">
                            {loading ? 'Saving...' : <><Save size={18} /> Save Member</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
