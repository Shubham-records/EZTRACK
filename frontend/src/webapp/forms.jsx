"use client";
import React, { useState, useEffect } from 'react';
import { addMonths, addYears, addDays, subDays, format, parse, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from "@/context/ToastContext";

// Billing helper functions inlined (moved from billingHelpers.js)
async function fetchJson(url, token, dbName) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Database-Name': dbName } });
  if (!res.ok) return null;
  return res.json();
}

async function loadPricingAndSettings() {
  try {
    const token = localStorage.getItem('eztracker_jwt_access_control_token');
    const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
    if (!token || !dbName) return {};

    const [pricingData, settingsData, ptData] = await Promise.all([
      fetchJson('/api/settings/pricing/member-matrix', token, dbName),
      fetchJson('/api/settings', token, dbName),
      fetchJson('/api/settings/pricing/pt-matrix', token, dbName)
    ]);

    const pricingMatrix = pricingData || {};
    const ptPricingMatrix = ptData || {};

    const settings = settingsData || {};
    if (settings.dateFormat) settings.dateFormat = settings.dateFormat.replace(/D/g, 'd').replace(/Y/g, 'y');

    return {
      pricingMatrix,
      plans: Object.keys(pricingMatrix),
      ptPricingMatrix,
      ptPlans: Object.keys(ptPricingMatrix),
      settings
    };
  } catch (err) {
    console.error('Failed to load pricing/settings', err);
    return {};
  }
}

function computeBasePrice(formData, pricingMatrix) {
  if (!formData || !formData.PlanType || !formData.PlanPeriod || !pricingMatrix) return 0;
  const cfg = pricingMatrix[formData.PlanType]?.[formData.PlanPeriod];
  return cfg && cfg.price ? parseFloat(cfg.price) || 0 : 0;
}

function computePtAmount(formData, ptPricingMatrix) {
  if (!formData || !formData.ptPlanType || !formData.PlanPeriod || !ptPricingMatrix) return 0;
  const cfg = ptPricingMatrix[formData.ptPlanType]?.[formData.PlanPeriod];
  return cfg && cfg.price ? parseFloat(cfg.price) || 0 : 0;
}

function computeExtraAmount(basePrice, planPeriod, extraDays) {
  const days = parseInt(extraDays) || 0;
  if (days <= 0) return 0;
  let duration = 30;
  if (planPeriod === 'Monthly') duration = 30;
  else if (planPeriod === 'Quaterly') duration = 90;
  else if (planPeriod === 'HalfYearly') duration = 180;
  else if (planPeriod === 'Yearly') duration = 365;
  return Math.round((basePrice / duration) * days);
}

function computeTotal(formData, pricingMatrix, ptPricingMatrix, options = {}) {
  const base = computeBasePrice(formData, pricingMatrix);
  const admission = options.applyAdmissionFee ? (parseFloat(formData.admissionPrice) || 0) : 0;
  const extra = parseFloat(formData.extraAmount) || 0;
  const pt = formData.ptPlanType ? (parseFloat(formData.ptAmount) || computePtAmount(formData, ptPricingMatrix)) : 0;
  const total = base + admission + extra + pt;
  return { base, admission, extra, pt, total };
}

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
    height: null,
    weight: null,
    DateOfJoining: format(new Date(), 'yyyy-MM-dd'),
    DateOfReJoin: '',
    Billtype: '',
    Address: '',
    Whatsapp: null,
    PlanPeriod: '',
    PlanType: '',
    MembershipStatus: '',
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
    const init = async () => {
      const { pricingMatrix, plans: pList, ptPricingMatrix, ptPlans: ptList, settings } = await loadPricingAndSettings();
      if (pricingMatrix) setPricingMatrix(pricingMatrix);
      if (pList) setPlans(pList);
      if (ptPricingMatrix) setPtPricingMatrix(ptPricingMatrix);
      if (ptList) setPtPlans(ptList);
      if (settings) {
        if (settings.admissionFee) setFormData(prev => ({ ...prev, admissionPrice: settings.admissionFee }));
        if (settings.enablePersonalTraining) setEnablePersonalTraining(true);
      }
    };
    init();
  }, []);

  // Auto-fill amount based on PlanType and PlanPeriod
  useEffect(() => {
    const { total } = computeTotal(formData, pricingMatrix, ptPricingMatrix, { applyAdmissionFee });
    setFormData(prev => ({ ...prev, LastPaymentAmount: total, paidAmount: total }));
  }, [formData.PlanType, formData.PlanPeriod, formData.admissionPrice, formData.extraAmount, applyAdmissionFee, formData.ptPlanType, formData.ptAmount, pricingMatrix, ptPricingMatrix]);

  // Auto-fill PT amount based on PT plan + gym PlanPeriod
  useEffect(() => {
    // keep ptAmount sync using helper
    const pt = computePtAmount(formData, ptPricingMatrix);
    setFormData(prev => ({ ...prev, ptAmount: pt }));
  }, [formData.ptPlanType, formData.PlanPeriod, ptPricingMatrix]);

  // Calculate extra amount based on extra days
  useEffect(() => {
    const base = computeBasePrice(formData, pricingMatrix);
    const calculatedExtra = computeExtraAmount(base, formData.PlanPeriod, formData.extraDays);
    setFormData(prev => ({ ...prev, extraAmount: calculatedExtra }));
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
        body: JSON.stringify({ ...formData, Billtype: 'Admission', LastPaymentDate: formData.DateOfJoining })
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
    Name: '', MembershipReceiptnumber: '', Gender: '', Age: '', height: '', weight: '',
    DateOfJoining: '', DateOfReJoin: format(new Date(), 'yyyy-MM-dd'), Billtype: '', Address: '', Whatsapp: '',
    PlanPeriod: '', PlanType: '', MembershipStatus: '', MembershipExpiryDate: '', LastPaymentDate: '',
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
    const init = async () => {
      const { pricingMatrix: pm, plans: pList, ptPricingMatrix: ptpm, ptPlans: ptList, settings } = await loadPricingAndSettings();
      if (pm) setPricingMatrix(pm);
      if (pList) setPlans(pList);
      if (ptpm) setPtPricingMatrix(ptpm);
      if (ptList) setPtPlans(ptList);
      if (settings) {
        const s = {
          admissionFee: parseFloat(settings.admissionFee) || 0,
          reAdmissionFee: parseFloat(settings.reAdmissionFee) || 0,
          readmissionDiscount: parseFloat(settings.readmissionDiscount) || 50,
          admissionExpiryDays: parseInt(settings.admissionExpiryDays) || 365
        };
        setGymSettings(s);
        setFormData(prev => ({ ...prev, admissionPrice: s.reAdmissionFee }));
        if (settings.enablePersonalTraining) setEnablePersonalTraining(true);
      }
    };
    init();
  }, []);

  // Auto-fill amount based on PlanType and PlanPeriod
  useEffect(() => {
    const { total } = computeTotal(formData, pricingMatrix, ptPricingMatrix, { applyAdmissionFee });
    setFormData(prev => ({ ...prev, LastPaymentAmount: total, paidAmount: total }));
  }, [formData.PlanType, formData.PlanPeriod, formData.admissionPrice, formData.extraAmount, applyAdmissionFee, formData.ptPlanType, formData.ptAmount, pricingMatrix]);

  // Auto-fill PT amount based on PT plan + gym PlanPeriod
  useEffect(() => {
    const pt = computePtAmount(formData, ptPricingMatrix);
    setFormData(prev => ({ ...prev, ptAmount: pt }));
  }, [formData.ptPlanType, formData.PlanPeriod, ptPricingMatrix]);

  // Calculate extra amount based on extra days
  useEffect(() => {
    const base = computeBasePrice(formData, pricingMatrix);
    const calculatedExtra = computeExtraAmount(base, formData.PlanPeriod, formData.extraDays);
    setFormData(prev => ({ ...prev, extraAmount: calculatedExtra }));
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
            Name: '', MembershipReceiptnumber: '', Gender: '', Age: '', height: '', weight: '',
            DateOfJoining: '', DateOfReJoin: format(new Date(), 'yyyy-MM-dd'), Billtype: '', Address: '', Whatsapp: '',
            PlanPeriod: '', PlanType: '', MembershipStatus: '', MembershipExpiryDate: '', LastPaymentDate: '',
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
        Name: '', MembershipReceiptnumber: '', Gender: '', Age: '', height: '', weight: '',
        DateOfJoining: '', DateOfReJoin: format(new Date(), 'yyyy-MM-dd'), Billtype: '', Address: '', Whatsapp: '',
        PlanPeriod: '', PlanType: '', MembershipStatus: '', MembershipExpiryDate: '', LastPaymentDate: '',
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
        body: JSON.stringify({ ...formData, Billtype: 'Re-Admission', LastPaymentDate: formData.DateOfReJoin })
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

          {/* Age / Height / Weight / Receipt — pre-filled from member data, editable */}
          <div className="col-span-1 md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelStyle}>Age</label>
              <input type="number" name="Age" value={formData.Age || ''} onChange={handleInputChange} placeholder="Years" className={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>Height (ft)</label>
              <input type="number" name="height" value={formData.height || ''} onChange={handleInputChange} placeholder="e.g. 5.7" step="0.1" className={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>Weight (kg)</label>
              <input type="number" name="weight" value={formData.weight || ''} onChange={handleInputChange} placeholder="e.g. 65" className={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>Receipt No.</label>
              <input type="number" name="RenewalReceiptNumber" value={formData.RenewalReceiptNumber || ''} onChange={handleInputChange} placeholder="Ref#" className={inputStyle} />
            </div>
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
    const init = async () => {
      const { pricingMatrix: pm, plans: pList, ptPricingMatrix: ptpm, ptPlans: ptList, settings } = await loadPricingAndSettings();
      if (pm) setPricingMatrix(pm);
      if (pList) setPlans(pList);
      if (ptpm) setPtPricingMatrix(ptpm);
      if (ptList) setPtPlans(ptList);
      if (settings) {
        if (settings.enablePersonalTraining) setEnablePersonalTraining(true);
        if (settings.dateFormat) setDateFormat(settings.dateFormat);
      }
    };
    init();
  }, []);

  // Auto-fill amount based on PlanType and PlanPeriod
  useEffect(() => {
    const { total } = computeTotal(formData, pricingMatrix, ptPricingMatrix, { applyAdmissionFee: false });
    setFormData(prev => ({ ...prev, LastPaymentAmount: total, paidAmount: total }));
  }, [formData.PlanType, formData.PlanPeriod, formData.extraAmount, formData.ptPlanType, formData.ptAmount, pricingMatrix, ptPricingMatrix]);

  // Calculate extra amount based on extra days
  useEffect(() => {
    const base = computeBasePrice(formData, pricingMatrix);
    const calculatedExtra = computeExtraAmount(base, formData.PlanPeriod, formData.extraDays);
    setFormData(prev => ({ ...prev, extraAmount: calculatedExtra }));
  }, [formData.extraDays, formData.PlanType, formData.PlanPeriod, pricingMatrix]);

  // PT Amount effect remains separate as it depends on its own matrix
  useEffect(() => {
    const pt = computePtAmount(formData, ptPricingMatrix);
    setFormData(prev => ({ ...prev, ptAmount: pt }));
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
        const basePrice = computeBasePrice(data, pricingMatrix);
        const extra = 0; // we reset extraAmount to 0 on load
        const pt = computePtAmount(data, ptPricingMatrix);
        const total = basePrice + extra + pt;
        setFormData(prev => ({ ...prev, LastPaymentAmount: total, paidAmount: total }));
      } catch (err) {
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

      if (!formData.MembershipReceiptnumber) throw new Error('Please search for a client first.');
      if (!formData.DateOfRenewal) throw new Error('Renewal Date is required.');
      if (!formData.PlanType) throw new Error('Plan is required.');
      if (!formData.PlanPeriod) throw new Error('Duration is required.');

      // Map DateOfRenewal → LastPaymentDate so backend sets it correctly
      const payload = {
        ...formData,
        Billtype: 'Renewal',
        LastPaymentDate: formData.DateOfRenewal,
        DateOfReJoin: formData.DateOfRenewal,
        RenewalReceiptNumber: formData.RenewalReceiptNumber
      };

      const response = await fetch('/api/members/renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();
      if (!response.ok) throw new Error(responseData.detail || responseData.error || `HTTP error! status: ${response.status}`);

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
            <div>
              <label className={labelStyle}>Receipt No.</label>
              <input type="number" name="RenewalReceiptNumber" value={formData.RenewalReceiptNumber || ''} onChange={handleInputChange} placeholder="Renewal Ref#" className={inputStyle} />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedProduct, setHighlightedProduct] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    paymentMode: 'CASH',
    paymentStatus: 'PAID',
    paidAmount: '',
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

  const getProductPrice = (p) => {
    return p.SellingPrice || parseFloat(p.MRPPrice) || parseFloat(p.LandingPrice) || 0;
  };

  const filteredProteins = proteins.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.ProductName || '').toLowerCase().includes(q) ||
      (p.Brand || '').toLowerCase().includes(q) ||
      (p.Flavour || '').toLowerCase().includes(q) ||
      (p.Weight || '').toLowerCase().includes(q)
    );
  });

  const addItem = (protein) => {
    const existing = selectedItems.find(i => i.id === protein.id);
    if (existing) {
      setSelectedItems(prev => prev.map(i => i.id === protein.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setSelectedItems(prev => [...prev, {
        id: protein.id,
        productName: protein.ProductName || '',
        brand: protein.Brand || '',
        flavour: protein.Flavour || '',
        weight: protein.Weight || '',
        mrp: parseFloat(protein.MRPPrice) || 0,
        price: getProductPrice(protein),
        quantity: 1
      }]);
    }
    setSearchQuery('');
    setIsDropdownOpen(false);
    setHighlightedProduct(protein);
  };

  const removeItem = (id) => {
    setSelectedItems(prev => prev.filter(i => i.id !== id));
    if (highlightedProduct && highlightedProduct.id === id) {
      setHighlightedProduct(null);
    }
  };

  const updateQuantity = (id, qty) => {
    if (qty < 1) return removeItem(id);
    setSelectedItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  };

  const subtotal = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItems = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = Math.max(0, subtotal - (parseFloat(discount) || 0));

  // Auto-set paidAmount when paymentStatus changes or total changes
  useEffect(() => {
    if (formData.paymentStatus === 'PAID') {
      setFormData(prev => ({ ...prev, paidAmount: total }));
    } else if (formData.paymentStatus === 'UNPAID') {
      setFormData(prev => ({ ...prev, paidAmount: 0 }));
    }
  }, [formData.paymentStatus, total]);

  const pendingBalance = total - (parseFloat(formData.paidAmount) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      showToast('Please add at least one product', 'error');
      return;
    }
    setLoading(true);
    try {
      const paidAmt = parseFloat(formData.paidAmount) || 0;
      let status = 'PENDING';
      if (paidAmt >= total) status = 'PAID';
      else if (paidAmt > 0) status = 'PARTIAL';

      const invoiceData = {
        customerName: formData.customerName,
        invoiceType: 'Protein',
        items: selectedItems.map(i => ({
          description: `${i.brand} - ${i.productName}${i.flavour ? ' (' + i.flavour + ')' : ''}${i.weight ? ' - ' + i.weight : ''}`,
          quantity: i.quantity,
          rate: i.price,
          amount: i.price * i.quantity
        })),
        tax: 0,
        discount: parseFloat(discount) || 0,
        status: status,
        paymentMode: formData.paymentMode,
        paidAmount: paidAmt
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
        setHighlightedProduct(null);
        setDiscount(0);
        setFormData({ customerName: '', customerPhone: '', paymentMode: 'CASH', paymentStatus: 'PAID', paidAmount: '', remarks: '' });
      } else {
        throw new Error('Failed to create invoice');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Find full protein data for highlighted product
  const specProduct = highlightedProduct ? proteins.find(p => p.id === highlightedProduct.id) || highlightedProduct : null;

  return (
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto">
      <form autoComplete="off" onSubmit={handleSubmit} className="space-y-6">
        <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Protein Billing</h1>
          <p className="text-sm text-zinc-500 mt-1">Sell protein supplements and products</p>
        </div>
        {/* Two-column layout: Left = Product Selection + Cart, Right = Specs + Bill */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT COLUMN - 3/5 width */}
          <div className="lg:col-span-3 space-y-4">
            {/* Searchable Product Dropdown */}
            <div className="relative">
              <div className="grid grid-cols-1 md:grid-cols-2 mb-6 gap-6">
                <div>
                  <label className={labelStyle}>Customer Name</label>
                  <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} placeholder="Customer name" className={inputStyle} required />
                </div>
                <div>
                  <label className={labelStyle}>Phone</label>
                  <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} placeholder="Phone number" className={inputStyle} />
                </div>
              </div>
              <label className={labelStyle}>Search & Select Product</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="🔍 Search by product name, brand, flavour, weight..."
                  className={inputStyle}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setIsDropdownOpen(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Dropdown Results */}
              {isDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl max-h-64 overflow-y-auto stitch-scrollbar">
                  {filteredProteins.length === 0 ? (
                    <div className="p-4 text-center text-zinc-400 text-sm">No products found</div>
                  ) : (
                    filteredProteins.map(p => {
                      const inCart = selectedItems.find(i => i.id === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addItem(p)}
                          className="w-full p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 border-b border-zinc-100 dark:border-zinc-700 last:border-b-0 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-zinc-900 dark:text-white truncate">{p.ProductName}</span>
                              {inCart && (
                                <span className="flex-shrink-0 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">×{inCart.quantity}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-zinc-500">{p.Brand}</span>
                              {p.Flavour && <span className="text-xs text-zinc-400">• {p.Flavour}</span>}
                              {p.Weight && <span className="text-xs text-zinc-400">• {p.Weight}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-primary">₹{getProductPrice(p).toLocaleString()}</p>
                            {p.MRPPrice && parseFloat(p.MRPPrice) > getProductPrice(p) && (
                              <p className="text-[10px] text-zinc-400 line-through">MRP ₹{parseFloat(p.MRPPrice).toLocaleString()}</p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Close dropdown on outside click */}
            {isDropdownOpen && (
              <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
            )}

            {/* Cart with detailed rows */}
            {selectedItems.length > 0 && (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm uppercase tracking-wider">Cart ({totalItems} items)</h3>
                  <button type="button" onClick={() => { setSelectedItems([]); setHighlightedProduct(null); }} className="text-xs text-rose-500 hover:text-rose-600 font-medium transition-colors">Clear All</button>
                </div>

                <div className="space-y-2">
                  {selectedItems.map(item => (
                    <div
                      key={item.id}
                      className={`bg-white dark:bg-zinc-700/50 p-3 rounded-lg border transition-all cursor-pointer ${highlightedProduct?.id === item.id ? 'border-primary ring-1 ring-primary/30' : 'border-zinc-200 dark:border-zinc-600 hover:border-zinc-300 dark:hover:border-zinc-500'}`}
                      onClick={() => setHighlightedProduct(proteins.find(p => p.id === item.id) || item)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{item.productName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-600/50 px-1.5 py-0.5 rounded">{item.brand}</span>
                            {item.flavour && <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-600/50 px-1.5 py-0.5 rounded">{item.flavour}</span>}
                            {item.weight && <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-600/50 px-1.5 py-0.5 rounded">{item.weight}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity - 1); }}
                            className="w-7 h-7 flex items-center justify-center bg-zinc-100 dark:bg-zinc-600 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-500 transition-colors font-bold text-sm">−</button>
                          <span className="w-8 text-center font-bold text-sm text-zinc-900 dark:text-white">{item.quantity}</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.quantity + 1); }}
                            className="w-7 h-7 flex items-center justify-center bg-zinc-100 dark:bg-zinc-600 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-500 transition-colors font-bold text-sm">+</button>
                          <span className="w-20 text-right font-bold text-primary text-sm">₹{(item.price * item.quantity).toLocaleString()}</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                            className="w-7 h-7 flex items-center justify-center text-rose-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors text-xs">✕</button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-xs text-zinc-400">
                        <span>₹{item.price.toLocaleString()} × {item.quantity}</span>
                        {item.mrp > item.price && <span className="line-through">MRP ₹{item.mrp.toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - 2/5 width: Product Specs + Bill Summary */}
          <div className="lg:col-span-2 space-y-4">
            {/* Product Specs Card */}
            {specProduct ? (
              <div className="bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-800 dark:to-zinc-800/50 rounded-xl p-5 border border-zinc-200 dark:border-zinc-700">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Product Details</h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Product', value: specProduct.ProductName },
                    { label: 'Brand', value: specProduct.Brand },
                    { label: 'Flavour', value: specProduct.Flavour || '—' },
                    { label: 'Weight', value: specProduct.Weight || '—' },
                    { label: 'MRP', value: specProduct.MRPPrice ? `₹${parseFloat(specProduct.MRPPrice).toLocaleString()}` : '—' },
                    { label: 'Selling Price', value: `₹${getProductPrice(specProduct).toLocaleString()}`, highlight: true },
                    { label: 'Stock', value: specProduct.Quantity || specProduct.AvailableStock || '—' },
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-700/50 last:border-b-0">
                      <span className="text-xs text-zinc-500 font-medium">{row.label}</span>
                      <span className={`text-sm font-semibold ${row.highlight ? 'text-primary' : 'text-zinc-900 dark:text-white'}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6 border border-dashed border-zinc-300 dark:border-zinc-600 text-center">
                <p className="text-zinc-400 text-sm">Select a product to view details</p>
              </div>
            )}

            {/* Bill Summary */}
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-5 space-y-3 border border-zinc-200 dark:border-zinc-700">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 border-b border-zinc-200 dark:border-zinc-700 pb-2">Bill Summary</h3>

              {/* Line items */}
              {selectedItems.map(item => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[60%]">{item.productName} × {item.quantity}</span>
                  <span className="font-medium text-zinc-900 dark:text-white">₹{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}

              {selectedItems.length === 0 && (
                <p className="text-center text-zinc-400 text-sm py-2">No items added</p>
              )}

              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Subtotal</span>
                  <span className="font-medium text-zinc-900 dark:text-white">₹{subtotal.toLocaleString()}</span>
                </div>

                {/* Editable Discount */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                    Discount
                    <span className="text-zinc-400 text-[10px]">Editable</span>
                  </span>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-24 text-right bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-primary outline-none"
                    min="0"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Total Payable */}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-zinc-900 dark:text-white">Total Payable</span>
                  <span className="font-bold text-xl text-primary">₹{total.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Fields */}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Payment Status</label>
                    <select name="paymentStatus" value={formData.paymentStatus} onChange={handleChange} className={selectStyle}>
                      <option value="PAID">Paid</option>
                      <option value="PARTIAL">Partial</option>
                      <option value="UNPAID">Unpaid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Paid Amount</label>
                    <input
                      type="number"
                      name="paidAmount"
                      value={formData.paidAmount === '' ? '' : formData.paidAmount}
                      onChange={handleChange}
                      className={inputStyle}
                      min="0"
                      max={total}
                      placeholder="0"
                      disabled={formData.paymentStatus === 'PAID' || formData.paymentStatus === 'UNPAID'}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Payment Mode</label>
                    <select name="paymentMode" value={formData.paymentMode} onChange={handleChange} className={selectStyle}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Remarks</label>
                    <input type="text" name="remarks" value={formData.remarks} onChange={handleChange} placeholder="Optional" className={inputStyle} />
                  </div>
                </div>

                {/* Pending Balance Display */}
                {pendingBalance > 0 && formData.paymentStatus !== 'PAID' && (
                  <div className="flex justify-between items-center bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2 border border-rose-200 dark:border-rose-800">
                    <span className="text-sm font-medium text-rose-600 dark:text-rose-400">Pending Balance</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">₹{pendingBalance.toLocaleString()}</span>
                  </div>
                )}

                {formData.paymentStatus === 'PAID' && total > 0 && (
                  <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Fully Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{total.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading || selectedItems.length === 0} className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50">
          {loading ? 'Processing...' : formData.paymentStatus === 'PAID' ? `Complete Sale (₹${total.toLocaleString()})` : formData.paymentStatus === 'PARTIAL' ? `Complete Sale — Paying ₹${(parseFloat(formData.paidAmount) || 0).toLocaleString()} of ₹${total.toLocaleString()}` : `Record Sale (₹${total.toLocaleString()} — Unpaid)`}
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

