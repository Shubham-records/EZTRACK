"use client";
import React, { useState, useEffect } from 'react';
import { addMonths, addYears, addDays, subDays, format, parse, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from "@/context/ToastContext";

// Clean unified input style for all form components
const inputStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-zinc-400";
const labelStyle = "block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1";
const selectStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none";

function DuplicateModal({ isOpen, onClose, onContinue, duplicates }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <span className="text-amber-500">⚠️</span> Potential Duplicate Members
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            We found existing members with similar details. Please review before proceeding.
          </p>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {duplicates.map((member) => (
            <div key={member.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">{member.Name}</h3>
                  <p className="text-xs text-zinc-500">ID: {member.MembershipReceiptnumber}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold ${member.computed_status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                  {member.computed_status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <p>📞 {member.Mobile}</p>
                <p>💬 {member.Whatsapp}</p>
                {member.Aadhaar && <p>🆔 {member.Aadhaar}</p>}
                <p>📅 Joined: {member.DateOfJoining}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel & Review
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-primary hover:bg-teal-700 text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewAdmission() {
  const router = useRouter();
  const { showToast } = useToast();
  const [clientNumber, setClientNumber] = useState(null);
  const [formData, setFormData] = useState({
    Name: '',
    MembershipReceiptnumber: null,
    Gender: '',
    Age: null,
    AccessStatus: 'no',
    height: null,
    weight: null,
    DateOfJoining: format(new Date(), 'yyyy-MM-dd'),
    DateOfReJoin: '',
    Billtype: '',
    Address: '',
    Whatsapp: null,
    PlanPeriod: '',
    PlanType: '',
    MembershipStatus: 'Inactive',
    MembershipExpiryDate: '',
    LastPaymentDate: '',
    NextDuedate: '',
    LastPaymentAmount: null,
    RenewalReceiptNumber: null,
    Aadhaar: null,
    Remark: '',
    Mobile: null,
    extraDays: '0',
    agreeTerms: true,
    admissionPrice: 0,
    extraAmount: 0,
    paymentMode: 'CASH',
    paidAmount: null,
    ptPlanType: '',
    ptAmount: 0
  });

  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicates, setDuplicates] = useState([]);

  const [plans, setPlans] = useState([]);
  const [pricingMatrix, setPricingMatrix] = useState({});
  const [applyAdmissionFee, setApplyAdmissionFee] = useState(true);
  const [ptPricingMatrix, setPtPricingMatrix] = useState({});
  const [ptPlans, setPtPlans] = useState([]);
  const [enablePersonalTraining, setEnablePersonalTraining] = useState(false);

  useEffect(() => {
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

    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token || !dbName) return;

        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.admissionFee) {
            setFormData(prev => ({ ...prev, admissionPrice: data.admissionFee }));
          }
          if (data.enablePersonalTraining) {
            setEnablePersonalTraining(true);
          }
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };

    const fetchPtPlans = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token || !dbName) return;

        const res = await fetch('/api/settings/pricing/pt-matrix', {
          headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
        });
        if (res.ok) {
          const data = await res.json();
          setPtPricingMatrix(data);
          setPtPlans(Object.keys(data));
        }
      } catch (e) {
        console.error("Failed to fetch PT plans", e);
      }
    };
    fetchPlans();
    fetchSettings();
    fetchPtPlans();
  }, []);

  // Auto-fill amount based on PlanType and PlanPeriod
  useEffect(() => {
    let basePrice = 0;
    if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
      const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
      if (priceConfig && priceConfig.price) {
        basePrice = parseFloat(priceConfig.price) || 0;
      }
    }
    const admission = applyAdmissionFee ? (parseFloat(formData.admissionPrice) || 0) : 0;
    const extra = parseFloat(formData.extraAmount) || 0;
    const pt = formData.ptPlanType ? (parseFloat(formData.ptAmount) || 0) : 0;
    const total = basePrice + admission + extra + pt;

    setFormData(prev => ({
      ...prev,
      LastPaymentAmount: total,
      paidAmount: total
    }));
  }, [formData.PlanType, formData.PlanPeriod, formData.admissionPrice, formData.extraAmount, applyAdmissionFee, formData.ptPlanType, formData.ptAmount, pricingMatrix]);

  // Auto-fill PT amount based on PT plan + gym PlanPeriod
  useEffect(() => {
    if (formData.ptPlanType && formData.PlanPeriod && ptPricingMatrix[formData.ptPlanType]) {
      const ptConfig = ptPricingMatrix[formData.ptPlanType][formData.PlanPeriod];
      if (ptConfig && ptConfig.price) {
        setFormData(prev => ({ ...prev, ptAmount: parseFloat(ptConfig.price) || 0 }));
      }
    } else if (!formData.ptPlanType) {
      setFormData(prev => ({ ...prev, ptAmount: 0 }));
    }
  }, [formData.ptPlanType, formData.PlanPeriod, ptPricingMatrix]);

  // Calculate extra amount based on extra days
  useEffect(() => {
    if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
      const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
      if (priceConfig && priceConfig.price) {
        const basePrice = parseFloat(priceConfig.price) || 0;
        const extraDays = parseInt(formData.extraDays) || 0;

        if (extraDays >= 0) {
          let duration = 30;
          if (formData.PlanPeriod === 'Monthly') duration = 30;
          else if (formData.PlanPeriod === 'Quaterly') duration = 90;
          else if (formData.PlanPeriod === 'HalfYearly') duration = 180;
          else if (formData.PlanPeriod === 'Yearly') duration = 365;

          const calculatedExtra = Math.round((basePrice / duration) * extraDays);
          setFormData(prev => ({ ...prev, extraAmount: calculatedExtra }));
        }
      }
    }
  }, [formData.extraDays, formData.PlanType, formData.PlanPeriod, pricingMatrix]);

  useEffect(() => {
    const fetchClientNumber = async () => {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!jwtToken || !eztracker_jwt_databaseName_control_token) throw new Error('No token found.');

        const response = await fetch('/api/members/generate-client-number', {
          headers: { Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': eztracker_jwt_databaseName_control_token }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setClientNumber(data.clientNumber);
        setFormData(prev => ({ ...prev, MembershipReceiptnumber: data.clientNumber }));
      } catch (error) {
        showToast(error.message, 'error');
      }
    };
    fetchClientNumber();
  }, []);

  useEffect(() => {
    if (formData.PlanPeriod && formData.DateOfJoining) updateExpiryDate();
  }, [formData.PlanPeriod, formData.DateOfJoining, formData.extraDays]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    let newValue = type === 'checkbox' ? e.target.checked : value;
    const intFields = ['MembershipReceiptnumber', 'Age', 'weight', 'Mobile', 'Whatsapp', 'Aadhaar', 'LastPaymentAmount', 'RenewalReceiptNumber', 'extraDays'];
    const floatFields = ['height', 'admissionPrice', 'extraAmount', 'paidAmount'];

    if (intFields.includes(name)) newValue = value === '' ? null : parseInt(value, 10);
    else if (floatFields.includes(name)) newValue = value === '' ? null : parseFloat(value);

    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const updateExpiryDate = () => {
    const joinDate = parse(formData.DateOfJoining, 'yyyy-MM-dd', new Date());
    let expiryDate = joinDate;

    switch (formData.PlanPeriod) {
      case 'Monthly': expiryDate = subDays(addMonths(joinDate, 1), 1); break;
      case 'Quaterly': expiryDate = subDays(addMonths(joinDate, 3), 1); break;
      case 'HalfYearly': expiryDate = subDays(addMonths(joinDate, 6), 1); break;
      case 'Yearly': expiryDate = subDays(addYears(joinDate, 1), 1); break;
    }

    if (formData.extraDays) expiryDate = addDays(expiryDate, parseInt(formData.extraDays));

    setFormData(prev => ({
      ...prev,
      MembershipExpiryDate: format(expiryDate, 'yyyy-MM-dd'),
      NextDuedate: format(addDays(expiryDate, 1), 'yyyy-MM-dd')
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check for duplicates first
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const dupRes = await fetch('/api/members/search-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName },
        body: JSON.stringify({
          Name: formData.Name,
          Mobile: formData.Mobile,
          Whatsapp: formData.Whatsapp,
          Aadhaar: formData.Aadhaar
        })
      });

      if (dupRes.ok) {
        const potentialDuplicates = await dupRes.json();
        if (potentialDuplicates.length > 0) {
          setDuplicates(potentialDuplicates);
          setShowDuplicateModal(true);
          return; // Stop here and wait for user confirmation
        }
      }
    } catch (error) {
      console.error("Duplicate check failed", error);
      // Fail silently on duplicate check error and proceed? Or block?
      // Let's proceed if check fails, assuming it's a network glitch, or maybe show warning.
      // For now, proceeding.
    }

    await submitAdmission();
  };

  const submitAdmission = async () => {
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const requiredFields = ['Name', 'MembershipReceiptnumber', 'Gender', 'Age', 'DateOfJoining', 'PlanPeriod', 'PlanType'];
      for (let field of requiredFields) {
        if (!formData[field]) throw new Error(`${field} is required.`);
      }

      const response = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName },
        body: JSON.stringify(formData)
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || `HTTP error! status: ${response.status}`);

      showToast('Admission submitted successfully!', 'success');
      router.push("/webapp");
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto">
      <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">New Admission</h1>
          <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg">
            <span className="text-xs font-bold text-zinc-500 uppercase mr-2">Client No</span>
            <span className="text-xl font-bold text-primary">{clientNumber}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-1 md:col-span-2">
            <label className={labelStyle}>Full Name</label>
            <input type="text" name="Name" value={formData.Name} onChange={handleInputChange} placeholder="John Doe" className={inputStyle} required />
          </div>

          <div>
            <label className={labelStyle}>Gender</label>
            <select name="Gender" value={formData.Gender} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Gender</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelStyle}>Age</label>
              <input type="number" name="Age" value={formData.Age || ''} onChange={handleInputChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Height (ft)</label>
              <input type="number" name="height" value={formData.height || ''} onChange={handleInputChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Weight (kg)</label>
              <input type="number" name="weight" value={formData.weight || ''} onChange={handleInputChange} className={inputStyle} required />
            </div>
          </div>

          <div className="col-span-1 md:col-span-2">
            <label className={labelStyle}>Address</label>
            <textarea name="Address" value={formData.Address} onChange={handleInputChange} placeholder="Enter address..." className={inputStyle} rows="2" required></textarea>
          </div>

          <div>
            <label className={labelStyle}>Aadhaar Number</label>
            <input type="number" name="Aadhaar" value={formData.Aadhaar || ''} onChange={handleInputChange} className={inputStyle} />
          </div>
          <div>
            <label className={labelStyle}>Mobile No</label>
            <input type="number" name="Mobile" value={formData.Mobile || ''} onChange={handleInputChange} className={inputStyle} required />
          </div>
          <div>
            <label className={labelStyle}>WhatsApp No</label>
            <input type="number" name="Whatsapp" value={formData.Whatsapp || ''} onChange={handleInputChange} className={inputStyle} required />
          </div>
          <div>
            <label className={labelStyle}>Remark</label>
            <input type="text" name="Remark" value={formData.Remark} onChange={handleInputChange} className={inputStyle} />
          </div>

          <div>
            <label className={labelStyle}>Gym Plan</label>
            <select name="PlanType" value={formData.PlanType} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Plan</option>
              {plans.map(plan => (
                <option key={plan} value={plan}>{plan}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelStyle}>Duration</label>
            <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleInputChange} className={selectStyle} required>
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


          <div className="grid grid-cols-3 gap-4 col-span-1 md:col-span-2">
            <div>
              <label className={labelStyle}>Join Date</label>
              <input type="date" name="DateOfJoining" value={formData.DateOfJoining} onChange={handleInputChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Expiry Date</label>
              <input type="date" name="MembershipExpiryDate" value={formData.MembershipExpiryDate} readOnly className={`${inputStyle} bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelStyle}>Extra Days</label>
              <input type="number" name="extraDays" value={formData.extraDays || ''} onChange={handleInputChange} className={inputStyle} />
            </div>
          </div>

          {/* Personal Training - beside Extra Days */}
          {enablePersonalTraining && ptPlans.length > 0 && (
            <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className={labelStyle}>Personal Training</label>
                <select
                  value={formData.ptPlanType || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, ptPlanType: e.target.value }))}
                  className={selectStyle}
                >
                  <option value="">None</option>
                  {ptPlans.map(p => (<option key={p} value={p}>{p}</option>))}
                </select>
              </div>
            </div>
          )}

          <div className="md:col-span-3 mt-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-700 pb-2">Bill Summary</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">Base Plan Price ({formData.PlanType} - {formData.PlanPeriod})</span>
                <span className="font-medium">₹{(formData.LastPaymentAmount - (parseFloat(formData.admissionPrice) || 0) - (parseFloat(formData.extraAmount) || 0)).toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center group">
                <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  Admission Fee
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 mr-2">
                    <input
                      type="checkbox"
                      checked={applyAdmissionFee}
                      onChange={(e) => setApplyAdmissionFee(e.target.checked)}
                      className="w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <span className="text-xs text-zinc-500">Apply</span>
                  </div>
                  <span className="text-zinc-400 text-xs mr-2">Editable</span>
                  <input
                    type="number"
                    name="admissionPrice"
                    value={formData.admissionPrice}
                    onChange={handleInputChange}
                    className={`w-24 text-right bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none ${!applyAdmissionFee && 'opacity-50'}`}
                    min="0"
                    disabled={!applyAdmissionFee}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center group">
                <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  Extra Charges
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-xs mr-2">Editable</span>
                  <input
                    type="number"
                    name="extraAmount"
                    value={formData.extraAmount}
                    onChange={handleInputChange}
                    className="w-24 text-right bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none"
                    min="0"
                  />
                </div>
              </div>

              {/* Personal Training line item */}
              {formData.ptPlanType && formData.ptAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">🏋️ Personal Training ({formData.ptPlanType})</span>
                  <span className="font-medium">₹{parseFloat(formData.ptAmount).toLocaleString()}</span>
                </div>
              )}



              {/* Payment Details */}
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-zinc-900 dark:text-white">Total Payable</span>
                  <span className="font-bold text-xl text-primary">₹{(parseFloat(formData.LastPaymentAmount) || 0).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Paid Amount</label>
                    <input
                      type="number"
                      name="paidAmount"
                      value={formData.paidAmount === null ? '' : formData.paidAmount}
                      onChange={handleInputChange}
                      className={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Payment Mode</label>
                    <select name="paymentMode" value={formData.paymentMode} onChange={handleInputChange} className={selectStyle}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                {(parseFloat(formData.LastPaymentAmount) - (parseFloat(formData.paidAmount) || 0)) > 0 && (
                  <div className="text-right text-rose-500 font-bold text-sm">
                    Pending Balance: ₹{(parseFloat(formData.LastPaymentAmount) - (parseFloat(formData.paidAmount) || 0)).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-4">
          <input type="checkbox" id="agreeTerms" name="agreeTerms" checked={formData.agreeTerms} onChange={handleInputChange} className="w-5 h-5 text-primary rounded focus:ring-primary" required />
          <label htmlFor="agreeTerms" className="text-sm text-zinc-600 dark:text-zinc-400">I agree to the terms and conditions.</label>
        </div>

        <button type="submit" className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 mt-4">
          Submit Admission
        </button>
      </form >

      <DuplicateModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        onContinue={() => {
          setShowDuplicateModal(false);
          submitAdmission();
        }}
        duplicates={duplicates}
      />
    </div >
  );
}

export function ReAdmission() {
  const router = useRouter();
  const { showToast } = useToast();
  const [clientNumber, setClientNumber] = useState('');
  const [formData, setFormData] = useState({
    Name: '', MembershipReceiptnumber: '', Gender: '', Age: '', AccessStatus: 'no', height: '', weight: '',
    DateOfJoining: '', DateOfReJoin: format(new Date(), 'yyyy-MM-dd'), Billtype: '', Address: '', Whatsapp: '',
    PlanPeriod: '', PlanType: '', MembershipStatus: 'Active', MembershipExpiryDate: '', LastPaymentDate: '',
    NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', Aadhaar: '', Remark: '', Mobile: '',
    extraDays: '0', agreeTerms: false,
    admissionPrice: 0, extraAmount: 0,
    paymentMode: 'CASH', paidAmount: null,
    ptPlanType: '', ptAmount: 0
  });

  const [plans, setPlans] = useState([]);
  const [pricingMatrix, setPricingMatrix] = useState({});
  const [applyAdmissionFee, setApplyAdmissionFee] = useState(true);
  const [gymSettings, setGymSettings] = useState({
    admissionFee: 0,
    reAdmissionFee: 0,
    readmissionDiscount: 50,
    admissionExpiryDays: 365
  });
  const [isAdmissionActive, setIsAdmissionActive] = useState(false);
  const [ptPricingMatrix, setPtPricingMatrix] = useState({});
  const [ptPlans, setPtPlans] = useState([]);
  const [enablePersonalTraining, setEnablePersonalTraining] = useState(false);

  useEffect(() => {
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

    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token || !dbName) return;

        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
        });
        if (res.ok) {
          const data = await res.json();
          const settings = {
            admissionFee: parseFloat(data.admissionFee) || 0,
            reAdmissionFee: parseFloat(data.reAdmissionFee) || 0,
            readmissionDiscount: parseFloat(data.readmissionDiscount) || 50,
            admissionExpiryDays: parseInt(data.admissionExpiryDays) || 365
          };
          setGymSettings(settings);
          // Default to flat reAdmissionFee until member data is loaded
          setFormData(prev => ({ ...prev, admissionPrice: settings.reAdmissionFee }));
          if (data.enablePersonalTraining) {
            setEnablePersonalTraining(true);
          }
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };

    const fetchPtPlans = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token || !dbName) return;

        const res = await fetch('/api/settings/pricing/pt-matrix', {
          headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
        });
        if (res.ok) {
          const data = await res.json();
          setPtPricingMatrix(data);
          setPtPlans(Object.keys(data));
        }
      } catch (e) {
        console.error("Failed to fetch PT plans", e);
      }
    };
    fetchPlans();
    fetchSettings();
    fetchPtPlans();
  }, []);

  // Auto-fill amount based on PlanType and PlanPeriod
  useEffect(() => {
    let basePrice = 0;
    if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
      const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
      if (priceConfig && priceConfig.price) {
        basePrice = parseFloat(priceConfig.price) || 0;
      }
    }
    const admission = applyAdmissionFee ? (parseFloat(formData.admissionPrice) || 0) : 0;
    const extra = parseFloat(formData.extraAmount) || 0;
    const pt = formData.ptPlanType ? (parseFloat(formData.ptAmount) || 0) : 0;
    const total = basePrice + admission + extra + pt;

    setFormData(prev => ({
      ...prev,
      LastPaymentAmount: total,
      paidAmount: total
    }));
  }, [formData.PlanType, formData.PlanPeriod, formData.admissionPrice, formData.extraAmount, applyAdmissionFee, formData.ptPlanType, formData.ptAmount, pricingMatrix]);

  // Auto-fill PT amount based on PT plan + gym PlanPeriod
  useEffect(() => {
    if (formData.ptPlanType && formData.PlanPeriod && ptPricingMatrix[formData.ptPlanType]) {
      const ptConfig = ptPricingMatrix[formData.ptPlanType][formData.PlanPeriod];
      if (ptConfig && ptConfig.price) {
        setFormData(prev => ({ ...prev, ptAmount: parseFloat(ptConfig.price) || 0 }));
      }
    } else if (!formData.ptPlanType) {
      setFormData(prev => ({ ...prev, ptAmount: 0 }));
    }
  }, [formData.ptPlanType, formData.PlanPeriod, ptPricingMatrix]);

  // Calculate extra amount based on extra days
  useEffect(() => {
    if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
      const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
      if (priceConfig && priceConfig.price) {
        const basePrice = parseFloat(priceConfig.price) || 0;
        const extraDays = parseInt(formData.extraDays) || 0;

        if (extraDays >= 0) {
          let duration = 30;
          if (formData.PlanPeriod === 'Monthly') duration = 30;
          else if (formData.PlanPeriod === 'Quaterly') duration = 90;
          else if (formData.PlanPeriod === 'HalfYearly') duration = 180;
          else if (formData.PlanPeriod === 'Yearly') duration = 365;

          const calculatedExtra = Math.round((basePrice / duration) * extraDays);
          setFormData(prev => ({ ...prev, extraAmount: calculatedExtra }));
        }
      }
    }
  }, [formData.extraDays, formData.PlanType, formData.PlanPeriod, pricingMatrix]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const fetchClientData = async () => {
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const response = await fetch(`/api/members/client/${clientNumber}`, {
        headers: { Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName }
      });

      if (!response.ok) {
        if (response.status === 404) {
          setFormData({
            Name: '', MembershipReceiptnumber: '', Gender: '', Age: '', AccessStatus: 'no', height: '', weight: '',
            DateOfJoining: '', DateOfReJoin: format(new Date(), 'yyyy-MM-dd'), Billtype: '', Address: '', Whatsapp: '',
            PlanPeriod: '', PlanType: '', MembershipStatus: 'Active', MembershipExpiryDate: '', LastPaymentDate: '',
            NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', Aadhaar: '', Remark: '', Mobile: '',
            extraDays: '0', agreeTerms: false,
            admissionPrice: gymSettings?.reAdmissionFee || 0, extraAmount: 0,
            paymentMode: 'CASH', paidAmount: null,
            ptPlanType: '', ptAmount: 0
          });
          throw new Error('Client not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      showToast('Client found', 'success');

      // Check if admission is still active based on DateOfJoining
      let admissionActive = false;
      let computedAdmissionPrice = gymSettings.reAdmissionFee;
      if (data.DateOfJoining) {
        try {
          const joinDate = parse(data.DateOfJoining, 'yyyy-MM-dd', new Date());
          const daysSinceJoining = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24));
          if (daysSinceJoining <= gymSettings.admissionExpiryDays) {
            admissionActive = true;
            computedAdmissionPrice = Math.round(
              gymSettings.admissionFee * (gymSettings.readmissionDiscount / 100)
            );
          }
        } catch (e) {
          console.error("Error parsing DateOfJoining", e);
        }
      }

      setIsAdmissionActive(admissionActive);
      setFormData(prev => ({
        ...prev,
        ...data,
        DateOfReJoin: format(new Date(), 'yyyy-MM-dd'),
        admissionPrice: computedAdmissionPrice
      }));
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const updateExpiryDate = () => {
    const joinDate = parse(formData.DateOfReJoin, 'yyyy-MM-dd', new Date());
    let expiryDate = joinDate;

    switch (formData.PlanPeriod) {
      case 'Monthly': expiryDate = subDays(addMonths(joinDate, 1), 1); break;
      case 'Quaterly': expiryDate = subDays(addMonths(joinDate, 3), 1); break;
      case 'HalfYearly': expiryDate = subDays(addMonths(joinDate, 6), 1); break;
      case 'Yearly': expiryDate = subDays(addYears(joinDate, 1), 1); break;
    }

    if (formData.extraDays) expiryDate = addDays(expiryDate, parseInt(formData.extraDays));

    setFormData(prev => ({
      ...prev,
      MembershipExpiryDate: format(expiryDate, 'yyyy-MM-dd'),
      NextDuedate: format(addDays(expiryDate, 1), 'yyyy-MM-dd')
    }));
  };

  useEffect(() => {
    if (clientNumber) {
      fetchClientData();
    } else {
      setFormData({
        Name: '', MembershipReceiptnumber: '', Gender: '', Age: '', AccessStatus: 'no', height: '', weight: '',
        DateOfJoining: '', DateOfReJoin: format(new Date(), 'yyyy-MM-dd'), Billtype: '', Address: '', Whatsapp: '',
        PlanPeriod: '', PlanType: '', MembershipStatus: 'Active', MembershipExpiryDate: '', LastPaymentDate: '',
        NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', Aadhaar: '', Remark: '', Mobile: '',
        extraDays: '0', agreeTerms: false,
        admissionPrice: gymSettings?.reAdmissionFee || 0, extraAmount: 0,
        paymentMode: 'CASH', paidAmount: null,
        ptPlanType: '', ptAmount: 0
      });
      setIsAdmissionActive(false);
    }
  }, [clientNumber]);

  useEffect(() => {
    if (formData.PlanPeriod && formData.DateOfReJoin) updateExpiryDate();
  }, [formData.PlanPeriod, formData.DateOfReJoin, formData.extraDays]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const response = await fetch('/api/members/re-admission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName },
        body: JSON.stringify(formData)
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || `HTTP error! status: ${response.status}`);

      showToast('Re-Admission successful!', 'success');
      router.push("/webapp");
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto">
      <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Re-Admission</h1>
          <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg">
            <span className="text-xs font-bold text-zinc-500 uppercase mr-2">Client No</span>
            <span className="text-xl font-bold text-primary">{formData.MembershipReceiptnumber || '-'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-1 md:col-span-2">
            <label className={labelStyle}>Search Client</label>
            <input type="text" value={clientNumber} onChange={(e) => setClientNumber(e.target.value)} onBlur={fetchClientData} placeholder="Enter Client ID to search" className={inputStyle} />
          </div>

          <div>
            <label className={labelStyle}>Plan</label>
            <select name="PlanType" value={formData.PlanType} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Plan</option>
              {plans.map(plan => (
                <option key={plan} value={plan}>{plan}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Duration</label>
            <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleInputChange} className={selectStyle} required>
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

          <div className="grid grid-cols-3 gap-4 col-span-1 md:col-span-2">
            <div>
              <label className={labelStyle}>Re-Join Date</label>
              <input type="date" name="DateOfReJoin" value={formData.DateOfReJoin} onChange={handleInputChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Expiry Date</label>
              <input type="date" name="MembershipExpiryDate" value={formData.MembershipExpiryDate} readOnly className={`${inputStyle} bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelStyle}>Extra Days</label>
              <input type="number" name="extraDays" value={formData.extraDays || ''} onChange={handleInputChange} className={inputStyle} />
            </div>
          </div>

          {/* Personal Training - beside Extra Days */}
          {enablePersonalTraining && ptPlans.length > 0 && (
            <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className={labelStyle}>Personal Training</label>
                <select
                  value={formData.ptPlanType || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, ptPlanType: e.target.value }))}
                  className={selectStyle}
                >
                  <option value="">None</option>
                  {ptPlans.map(p => (<option key={p} value={p}>{p}</option>))}
                </select>
              </div>
            </div>
          )}

          <div className="md:col-span-3 mt-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-700 pb-2">Bill Summary</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">Base Plan Price ({formData.PlanType} - {formData.PlanPeriod})</span>
                <span className="font-medium">₹{(formData.LastPaymentAmount - (parseFloat(formData.admissionPrice) || 0) - (parseFloat(formData.extraAmount) || 0)).toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center group">
                <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  Admission Fee
                  {isAdmissionActive && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                      Active: ₹{gymSettings.admissionFee} × {gymSettings.readmissionDiscount}%
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 mr-2">
                    <input
                      type="checkbox"
                      checked={applyAdmissionFee}
                      onChange={(e) => setApplyAdmissionFee(e.target.checked)}
                      className="w-4 h-4 text-primary rounded focus:ring-primary"
                    />
                    <span className="text-xs text-zinc-500">Apply</span>
                  </div>
                  <span className="text-zinc-400 text-xs mr-2">Editable</span>
                  <input
                    type="number"
                    name="admissionPrice"
                    value={formData.admissionPrice}
                    onChange={handleInputChange}
                    className={`w-24 text-right bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none ${!applyAdmissionFee && 'opacity-50'}`}
                    min="0"
                    disabled={!applyAdmissionFee}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center group">
                <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  Extra Charges
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-xs mr-2">Editable</span>
                  <input
                    type="number"
                    name="extraAmount"
                    value={formData.extraAmount}
                    onChange={handleInputChange}
                    className="w-24 text-right bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none"
                    min="0"
                  />
                </div>


              </div>

              {/* Personal Training line item */}
              {formData.ptPlanType && formData.ptAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">🏋️ Personal Training ({formData.ptPlanType})</span>
                  <span className="font-medium">₹{parseFloat(formData.ptAmount).toLocaleString()}</span>
                </div>
              )}

              {/* Payment Details */}
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-zinc-900 dark:text-white">Total Payable</span>
                  <span className="font-bold text-xl text-primary">₹{(parseFloat(formData.LastPaymentAmount) || 0).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Paid Amount</label>
                    <input
                      type="number"
                      name="paidAmount"
                      value={formData.paidAmount === null ? '' : formData.paidAmount}
                      onChange={handleInputChange}
                      className={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Payment Mode</label>
                    <select name="paymentMode" value={formData.paymentMode} onChange={handleInputChange} className={selectStyle}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                {(parseFloat(formData.LastPaymentAmount) - (parseFloat(formData.paidAmount) || 0)) > 0 && (
                  <div className="text-right text-rose-500 font-bold text-sm">
                    Pending Balance: ₹{(parseFloat(formData.LastPaymentAmount) - (parseFloat(formData.paidAmount) || 0)).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 mt-4">
          Submit Re-Admission
        </button>
      </form >
    </div >
  );
}

export function Renewal() {
  const router = useRouter();
  const { showToast } = useToast();
  const [clientNumber, setClientNumber] = useState('');
  const [formData, setFormData] = useState({
    Name: '', MembershipReceiptnumber: '', LastPaymentDate: '', LastValidityDate: '', LastMembershipType: '',
    Mobile: '', PlanPeriod: '', PlanType: '', DateOfRenewal: format(new Date(), 'yyyy-MM-dd'),
    MembershipExpiryDate: '', NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', extraDays: '0', agreeTerms: false,
    LastExpiryDate: '',
    extraAmount: 0, paymentMode: 'CASH', paidAmount: null,
    ptPlanType: '', ptAmount: 0
  });

  const [plans, setPlans] = useState([]);
  const [pricingMatrix, setPricingMatrix] = useState({});
  const [ptPricingMatrix, setPtPricingMatrix] = useState({});
  const [ptPlans, setPtPlans] = useState([]);
  const [enablePersonalTraining, setEnablePersonalTraining] = useState(false);
  const [dateFormat, setDateFormat] = useState('dd/MM/yyyy');

  useEffect(() => {
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

    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token || !dbName) return;

        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.enablePersonalTraining) {
            setEnablePersonalTraining(true);
          }
          if (data.dateFormat) {
            // Map DD/MM/YYYY to dd/MM/yyyy for date-fns
            setDateFormat(data.dateFormat.replace(/D/g, 'd').replace(/Y/g, 'y'));
          }
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };

    const fetchPtPlans = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token || !dbName) return;

        const res = await fetch('/api/settings/pricing/pt-matrix', {
          headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName }
        });
        if (res.ok) {
          const data = await res.json();
          setPtPricingMatrix(data);
          setPtPlans(Object.keys(data));
        }
      } catch (e) {
        console.error("Failed to fetch PT plans", e);
      }
    };
    fetchPlans();
    fetchSettings();
    fetchPtPlans();
  }, []);

  // Auto-fill amount based on PlanType and PlanPeriod
  useEffect(() => {
    let basePrice = 0;
    if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
      const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
      if (priceConfig && priceConfig.price) {
        basePrice = parseFloat(priceConfig.price) || 0;
      }
    }
    const extra = parseFloat(formData.extraAmount) || 0;
    const pt = formData.ptPlanType ? (parseFloat(formData.ptAmount) || 0) : 0;
    const total = basePrice + extra + pt;

    setFormData(prev => ({
      ...prev,
      LastPaymentAmount: total,
      paidAmount: total
    }));
  }, [formData.PlanType, formData.PlanPeriod, formData.extraAmount, formData.ptPlanType, formData.ptAmount, pricingMatrix]);

  // Calculate extra amount based on extra days
  useEffect(() => {
    if (formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]) {
      const priceConfig = pricingMatrix[formData.PlanType][formData.PlanPeriod];
      if (priceConfig && priceConfig.price) {
        const basePrice = parseFloat(priceConfig.price) || 0;
        const extraDays = parseInt(formData.extraDays) || 0;

        if (extraDays >= 0) {
          let duration = 30;
          if (formData.PlanPeriod === 'Monthly') duration = 30;
          else if (formData.PlanPeriod === 'Quaterly') duration = 90;
          else if (formData.PlanPeriod === 'HalfYearly') duration = 180;
          else if (formData.PlanPeriod === 'Yearly') duration = 365;

          const calculatedExtra = Math.round((basePrice / duration) * extraDays);
          setFormData(prev => ({ ...prev, extraAmount: calculatedExtra }));
        }
      }
    }
  }, [formData.extraDays, formData.PlanType, formData.PlanPeriod, pricingMatrix]);

  // PT Amount effect remains separate as it depends on its own matrix
  useEffect(() => {
    if (formData.ptPlanType && formData.PlanPeriod && ptPricingMatrix[formData.ptPlanType]) {
      const ptConfig = ptPricingMatrix[formData.ptPlanType][formData.PlanPeriod];
      if (ptConfig && ptConfig.price) {
        setFormData(prev => ({ ...prev, ptAmount: parseFloat(ptConfig.price) || 0 }));
      }
    } else if (!formData.ptPlanType) {
      setFormData(prev => ({ ...prev, ptAmount: 0 }));
    }
  }, [formData.ptPlanType, formData.PlanPeriod, ptPricingMatrix]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const fetchClientData = async () => {
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const response = await fetch(`/api/members/client/${clientNumber}`, {
        headers: { Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName }
      });

      if (!response.ok) {
        if (response.status === 404) {
          setFormData({
            Name: '', MembershipReceiptnumber: '', LastPaymentDate: '', LastValidityDate: '', LastMembershipType: '',
            Mobile: '', PlanPeriod: '', PlanType: '', DateOfRenewal: format(new Date(), 'yyyy-MM-dd'),
            MembershipExpiryDate: '', NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', extraDays: '0', agreeTerms: false,
            LastExpiryDate: '',
            extraAmount: 0, paymentMode: 'CASH', paidAmount: null,
            ptPlanType: '', ptAmount: 0
          });
          throw new Error('Client not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      showToast('Client found', 'success');
      // Use NextDuedate as last expiry, but blank the renewal date for user to fill
      const lastExp = data.NextDuedate ? format(new Date(data.NextDuedate), 'yyyy-MM-dd') : '';
      setFormData(prev => ({
        ...prev,
        ...data,
        LastExpiryDate: lastExp,
        DateOfRenewal: '',
        MembershipExpiryDate: '',
        NextDuedate: '',
        admissionPrice: 0,
        extraAmount: 0,
        extraDays: '0',
        ptPlanType: '',
        ptAmount: 0
      }));

      // Compute total payable immediately from returned client data (fallback)
      try {
        let basePrice = 0;
        if (data.PlanType && data.PlanPeriod && pricingMatrix[data.PlanType]) {
          const priceConfig = pricingMatrix[data.PlanType][data.PlanPeriod];
          if (priceConfig && priceConfig.price) basePrice = parseFloat(priceConfig.price) || 0;
        }

        const extra = 0; // we reset extraAmount to 0 on load

        let pt = 0;
        if (data.ptPlanType && ptPricingMatrix[data.ptPlanType]) {
          const ptConfig = ptPricingMatrix[data.ptPlanType][data.PlanPeriod];
          if (ptConfig && ptConfig.price) pt = parseFloat(ptConfig.price) || 0;
        }

        const total = basePrice + extra + pt;
        setFormData(prev => ({ ...prev, LastPaymentAmount: total, paidAmount: total }));
      } catch (err) {
        // silently ignore calculation errors - auto-fill effect will try again
        console.debug('Could not compute total from client data yet', err);
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  useEffect(() => {
    if (clientNumber) {
      fetchClientData();
    } else {
      setFormData({
        Name: '', MembershipReceiptnumber: '', LastPaymentDate: '', LastValidityDate: '', LastMembershipType: '',
        Mobile: '', PlanPeriod: '', PlanType: '', DateOfRenewal: format(new Date(), 'yyyy-MM-dd'),
        MembershipExpiryDate: '', NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', extraDays: '0', agreeTerms: false,
        LastExpiryDate: '',
        extraAmount: 0, paymentMode: 'CASH', paidAmount: null,
        ptPlanType: '', ptAmount: 0
      });
    }
  }, [clientNumber]);

  const updateExpiryDate = () => {
    if (!formData.DateOfRenewal) return;
    const renewalDate = parse(formData.DateOfRenewal, 'yyyy-MM-dd', new Date());
    let expiryDate = renewalDate;
    switch (formData.PlanPeriod) {
      case 'Monthly': expiryDate = subDays(addMonths(renewalDate, 1), 1); break;
      case 'Quaterly': expiryDate = subDays(addMonths(renewalDate, 3), 1); break;
      case 'HalfYearly': expiryDate = subDays(addMonths(renewalDate, 6), 1); break;
      case 'Yearly': expiryDate = subDays(addYears(renewalDate, 1), 1); break;
    }
    if (formData.extraDays) expiryDate = addDays(expiryDate, parseInt(formData.extraDays));
    setFormData(prev => ({ ...prev, MembershipExpiryDate: format(expiryDate, 'yyyy-MM-dd'), NextDuedate: format(addDays(expiryDate, 1), 'yyyy-MM-dd') }));
  };

  useEffect(() => {
    if (formData.PlanPeriod && formData.DateOfRenewal) updateExpiryDate();
  }, [formData.PlanPeriod, formData.DateOfRenewal, formData.extraDays]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const response = await fetch('/api/members/renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName },
        body: JSON.stringify(formData)
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.error || `HTTP error! status: ${response.status}`);

      showToast('Renewal successful!', 'success');
      router.push("/webapp");
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto">
      <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Renewal</h1>
          <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg">
            <span className="text-xs font-bold text-zinc-500 uppercase mr-2">Info</span>
            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{formData.Name || 'Search User'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-1 md:col-span-2">
            <label className={labelStyle}>Search Client</label>
            <input type="text" value={clientNumber} onChange={(e) => setClientNumber(e.target.value)} onBlur={fetchClientData} placeholder="Enter Client ID to search" className={inputStyle} />
          </div>

          <div>
            <label className={labelStyle}>Plan</label>
            <select name="PlanType" value={formData.PlanType} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Plan</option>
              {plans.map(plan => (
                <option key={plan} value={plan}>{plan}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelStyle}>Duration</label>
            <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleInputChange} className={selectStyle} required>
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

          <div className="grid grid-cols-4 gap-4 col-span-1 md:col-span-2">
            <div>
              <label className={labelStyle}>Last Expiry Date</label>
              <input
                type="text"
                value={formData.LastExpiryDate ? format(parseISO(formData.LastExpiryDate), dateFormat) : ''}
                readOnly
                className={`${inputStyle} bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed`}
              />
            </div>
            <div>
              <label className={labelStyle}>Renewal Date</label>
              <input type="date" name="DateOfRenewal" value={formData.DateOfRenewal} onChange={handleInputChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>New Expiry</label>
              <input
                type="text"
                value={formData.MembershipExpiryDate ? format(parseISO(formData.MembershipExpiryDate), dateFormat) : ''}
                readOnly
                className={`${inputStyle} bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed`}
              />
            </div>
            <div>
              <label className={labelStyle}>Extra Days</label>
              <input type="number" name="extraDays" value={formData.extraDays || ''} onChange={handleInputChange} className={inputStyle} />
            </div>
          </div>

          {/* Personal Training - beside Extra Days */}
          {enablePersonalTraining && ptPlans.length > 0 && (
            <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className={labelStyle}>Personal Training</label>
                <select
                  value={formData.ptPlanType || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, ptPlanType: e.target.value }))}
                  className={selectStyle}
                >
                  <option value="">None</option>
                  {ptPlans.map(p => (<option key={p} value={p}>{p}</option>))}
                </select>
              </div>
            </div>
          )}

          {/* Bill Summary */}
          <div className="col-span-1 md:col-span-2">
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-5 space-y-4 border border-zinc-200 dark:border-zinc-700">
              <h3 className="font-bold text-zinc-900 dark:text-white text-base">Bill Summary</h3>

              <div className="flex justify-between items-center">
                <span className="text-zinc-600 dark:text-zinc-400">Plan Price</span>
                <span className="font-medium text-zinc-900 dark:text-white">
                  ₹{formData.PlanType && formData.PlanPeriod && pricingMatrix[formData.PlanType]?.[formData.PlanPeriod]?.price
                    ? parseFloat(pricingMatrix[formData.PlanType][formData.PlanPeriod].price).toLocaleString()
                    : '0'}
                </span>
              </div>

              <div className="flex justify-between items-center group">
                <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                  Extra Charges
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-xs mr-2">Editable</span>
                  <input
                    type="number"
                    name="extraAmount"
                    value={formData.extraAmount}
                    onChange={handleInputChange}
                    className="w-24 text-right bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none"
                    min="0"
                  />
                </div>
              </div>

              {/* Personal Training line item */}
              {formData.ptPlanType && formData.ptAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">🏋️ Personal Training ({formData.ptPlanType})</span>
                  <span className="font-medium">₹{parseFloat(formData.ptAmount).toLocaleString()}</span>
                </div>
              )}

              {/* Payment Details */}
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-zinc-900 dark:text-white">Total Payable</span>
                  <span className="font-bold text-xl text-primary">₹{(parseFloat(formData.LastPaymentAmount) || 0).toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Paid Amount</label>
                    <input
                      type="number"
                      name="paidAmount"
                      value={formData.paidAmount === null ? '' : formData.paidAmount}
                      onChange={handleInputChange}
                      className={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Payment Mode</label>
                    <select name="paymentMode" value={formData.paymentMode} onChange={handleInputChange} className={selectStyle}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                {(parseFloat(formData.LastPaymentAmount) - (parseFloat(formData.paidAmount) || 0)) > 0 && (
                  <div className="text-right text-rose-500 font-bold text-sm">
                    Pending Balance: ₹{(parseFloat(formData.LastPaymentAmount) - (parseFloat(formData.paidAmount) || 0)).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 mt-4">
          Submit Renewal
        </button>

      </form>
    </div>
  );
}

// Protein Billing Form
export function ProteinBilling() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [proteins, setProteins] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    paymentMode: 'cash',
    remarks: ''
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
    fetchProteins();
  }, []);

  const fetchProteins = async () => {
    try {
      const res = await fetch('/api/proteins', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProteins(data);
      }
    } catch (e) {
      console.error('Failed to fetch proteins', e);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addItem = (protein) => {
    const existing = selectedItems.find(i => i.id === protein.id);
    if (existing) {
      setSelectedItems(prev => prev.map(i => i.id === protein.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setSelectedItems(prev => [...prev, {
        id: protein.id,
        name: `${protein.Brand} - ${protein.ProductName}`,
        price: protein.SellingPrice || parseFloat(protein.LandingPrice) || 0,
        quantity: 1
      }]);
    }
  };

  const removeItem = (id) => {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id, qty) => {
    if (qty < 1) return removeItem(id);
    setSelectedItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const total = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      showToast('Please add at least one product', 'error');
      return;
    }
    setLoading(true);
    try {
      const invoiceData = {
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        invoiceType: 'protein',
        items: selectedItems.map(i => ({
          productId: i.id,
          description: i.name,
          quantity: i.quantity,
          price: i.price
        })),
        total: total,
        paymentMode: formData.paymentMode,
        remarks: formData.remarks
      };

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(invoiceData)
      });

      if (res.ok) {
        // Update stock quantities
        for (const item of selectedItems) {
          await fetch(`/api/proteins/${item.id}/adjust-stock?adjustment=-${item.quantity}`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
        }
        showToast('Protein sale recorded!', 'success');
        setSelectedItems([]);
        setFormData({ customerName: '', customerPhone: '', paymentMode: 'cash', remarks: '' });
      } else {
        throw new Error('Failed to create invoice');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto">
      <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
        <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Protein Billing</h1>
          <p className="text-sm text-zinc-500 mt-1">Sell protein supplements and products</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelStyle}>Customer Name</label>
            <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="Customer name" className={inputStyle} required />
          </div>
          <div>
            <label className={labelStyle}>Phone</label>
            <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} placeholder="Phone number" className={inputStyle} />
          </div>
        </div>

        {/* Product Selection */}
        <div>
          <label className={labelStyle}>Select Products</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
            {proteins.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addItem(p)}
                className="p-3 text-left bg-white dark:bg-zinc-700 rounded-lg border border-zinc-200 dark:border-zinc-600 hover:border-primary transition-colors"
              >
                <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{p.ProductName}</p>
                <p className="text-[10px] text-zinc-500">{p.Brand}</p>
                <p className="text-sm font-bold text-primary mt-1">₹{p.SellingPrice || p.LandingPrice || 0}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        {selectedItems.length > 0 && (
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-4">
            <h3 className="font-bold text-zinc-900 dark:text-white mb-3">Cart</h3>
            <div className="space-y-2">
              {selectedItems.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-white dark:bg-zinc-700 p-3 rounded-lg">
                  <span className="text-sm font-medium text-zinc-900 dark:text-white flex-1">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 rounded">-</button>
                    <span className="w-8 text-center font-bold">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center bg-zinc-200 dark:bg-zinc-600 rounded">+</button>
                    <span className="w-20 text-right font-bold text-primary">₹{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-3 border-t border-zinc-200 dark:border-zinc-600">
                <span className="font-bold text-lg">Total</span>
                <span className="font-bold text-lg text-primary">₹{total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelStyle}>Payment Mode</label>
            <select name="paymentMode" value={formData.paymentMode} onChange={handleChange} className={selectStyle}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className={labelStyle}>Remarks</label>
            <input type="text" name="remarks" value={formData.remarks} onChange={handleChange} placeholder="Optional remarks" className={inputStyle} />
          </div>
        </div>

        <button type="submit" disabled={loading || selectedItems.length === 0} className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50">
          {loading ? 'Processing...' : `Complete Sale (₹${total.toLocaleString()})`}
        </button>
      </form>
    </div>
  );
}

// Expenses Form
export function Expenses() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [formData, setFormData] = useState({
    category: '',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    paymentMode: 'cash',
    reference: '',
    notes: ''
  });

  const categories = ['Rent', 'Electricity', 'Salaries', 'Maintenance', 'Supplies', 'Marketing', 'Equipment', 'Insurance', 'Utilities', 'Other'];

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
  }, []);

  const fetchExpenses = async () => {
    try {
      const res = await fetch('/api/expenses', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.slice(0, 10)); // Show last 10
      }
    } catch (e) {
      console.error('Failed to fetch expenses', e);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        })
      });

      if (res.ok) {
        showToast('Expense recorded!', 'success');
        setFormData({ category: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), paymentMode: 'cash', reference: '', notes: '' });
        fetchExpenses();
      } else {
        throw new Error('Failed to record expense');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
          <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-4">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Record Expense</h1>
            <p className="text-sm text-zinc-500 mt-1">Track gym operational expenses</p>
          </div>

          <div>
            <label className={labelStyle}>Category</label>
            <select name="category" value={formData.category} onChange={handleChange} className={selectStyle} required>
              <option value="" disabled>Select category</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelStyle}>Amount (₹)</label>
            <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="Enter amount" className={inputStyle} required />
          </div>

          <div>
            <label className={labelStyle}>Date</label>
            <input type="date" name="date" value={formData.date} onChange={handleChange} className={inputStyle} required />
          </div>

          <div>
            <label className={labelStyle}>Payment Mode</label>
            <select name="paymentMode" value={formData.paymentMode} onChange={handleChange} className={selectStyle}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank Transfer</option>
              <option value="card">Card</option>
            </select>
          </div>

          <div>
            <label className={labelStyle}>Reference / Invoice No</label>
            <input type="text" name="reference" value={formData.reference} onChange={handleChange} placeholder="Optional reference" className={inputStyle} />
          </div>

          <div>
            <label className={labelStyle}>Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional notes..." className={inputStyle} rows={2} />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-500/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50">
            {loading ? 'Saving...' : 'Record Expense'}
          </button>
        </form>

        {/* Recent Expenses */}
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">Recent Expenses</h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {expenses.map(exp => (
              <div key={exp.id || exp._id} className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg flex justify-between items-start">
                <div>
                  <p className="font-bold text-zinc-900 dark:text-white">{exp.category}</p>
                  <p className="text-xs text-zinc-500">{exp.date} • {exp.paymentMode}</p>
                  {exp.notes && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{exp.notes}</p>}
                </div>
                <span className="font-bold text-rose-500">-₹{parseFloat(exp.amount).toLocaleString()}</span>
              </div>
            ))}
            {expenses.length === 0 && (
              <p className="text-center text-zinc-500 py-8">No expenses recorded yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

