import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

export default function AddMemberModal({ isOpen, onClose, onSuccess }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        Name: '',
        MembershipReceiptnumber: '',
        Gender: 'Male',
        Age: '',
        "height(ft)": '',
        "weight(kg)": '',
        DateOfJoining: new Date().toISOString().split('T')[0],
        DateOfReJoin: '',
        Billtype: '',
        PlanPeriod: '',
        PlanType: '',
        LastPaymentDate: '',
        NextDuedate: '',
        LastPaymentAmount: '',
        RenewalReceiptNumber: '',
        MembershipStatus: 'Active',
        MembershipExpiryDate: '',
        AccessStatus: 'Active',
        Aadhaar: '',
        Address: '',
        Mobile: '',
        Whatsapp: '',
        Remark: ''
    });

    const [plans, setPlans] = useState([]);
    const [pricingMatrix, setPricingMatrix] = useState({});

    useEffect(() => {
        if (!isOpen) return;
        const fetchPlans = async () => {
            try {
                const token = localStorage.getItem('eztracker_jwt_access_control_token');
                const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
                if (!token || !dbName) return;

                const res = await fetch('/api/settings/pricing/member-matrix', {
                    headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
                });
                if (res.ok) {
                    const data = await res.json();
                    setPricingMatrix(data);
                    setPlans(Object.keys(data));
                }
            } catch (e) {
                console.error("Failed to fetch plans", e);
            }
        };
        fetchPlans();
    }, [isOpen]);

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
        // ... (rest of handleSubmit same as before)
        try {
            const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

            const response = await fetch('/api/members', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`,
                    'X-Database-Name': dbName
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) throw new Error('Failed to add member');

            showToast('Member added successfully', 'success');
            onSuccess();
            onClose();
            // Reset form
            setFormData({
                Name: '', MembershipReceiptnumber: '', Gender: 'Male', Age: '', "height(ft)": '', "weight(kg)": '',
                DateOfJoining: new Date().toISOString().split('T')[0], DateOfReJoin: '', Billtype: '',
                PlanPeriod: '', PlanType: '', LastPaymentDate: '', NextDuedate: '', LastPaymentAmount: '',
                RenewalReceiptNumber: '', MembershipStatus: 'Active', MembershipExpiryDate: '', AccessStatus: 'Active',
                Aadhaar: '', Address: '', Mobile: '', Whatsapp: '', Remark: ''
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
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto stitch-scrollbar flex flex-col">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Add New Member</h2>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Personal Info */}
                    {/* ... (keep personal info fields same) ... */}
                    <div className="col-span-full border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-2">
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Personal Information</h3>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Name *</label>
                        <input name="Name" value={formData.Name} onChange={handleChange} required className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Gender</label>
                        <select name="Gender" value={formData.Gender} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Age</label>
                        <input type="number" name="Age" value={formData.Age} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Height (ft)</label>
                        <input name="height(ft)" value={formData["height(ft)"]} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Weight (kg)</label>
                        <input name="weight(kg)" value={formData["weight(kg)"]} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Mobile</label>
                        <input name="Mobile" value={formData.Mobile} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp</label>
                        <input name="Whatsapp" value={formData.Whatsapp} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-span-2">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Address</label>
                        <input name="Address" value={formData.Address} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>

                    {/* Membership Info */}
                    <div className="col-span-full border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-2 mt-4">
                        <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Membership Details</h3>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Joining Date</label>
                        <input type="date" name="DateOfJoining" value={formData.DateOfJoining} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Receipt No.</label>
                        <input name="MembershipReceiptnumber" value={formData.MembershipReceiptnumber} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Status</label>
                        <select name="MembershipStatus" value={formData.MembershipStatus} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                            <option value="Active">Active</option>
                            <option value="Expired">Expired</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Plan Type</label>
                        <select name="PlanType" value={formData.PlanType} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                            <option value="" disabled hidden>Select Plan</option>
                            {plans.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Duration</label>
                        <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
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
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Amount Paid</label>
                        <input type="number" name="LastPaymentAmount" value={formData.LastPaymentAmount} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Remark</label>
                        <input name="Remark" value={formData.Remark} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800" />
                    </div>

                    <div className="col-span-full mt-6 sticky bottom-0 bg-white dark:bg-zinc-900 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
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
