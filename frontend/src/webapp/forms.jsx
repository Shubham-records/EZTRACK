"use client";
import React, { useState, useEffect } from 'react';
import { addMonths, addYears, addDays, subDays, format, parse } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from "@/context/ToastContext";

// Clean unified input style for all form components
const inputStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder-zinc-400";
const labelStyle = "block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1";
const selectStyle = "w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all appearance-none";

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
    agreeTerms: true
  });

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
    const floatFields = ['height'];

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
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
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
              <option value="Strength">Strength</option>
              <option value="CardioCrossfit">Cardio Crossfit</option>
              <option value="Combo">Combo</option>
              <option value="Zumba">Zumba</option>
              <option value="Yoga">Yoga</option>
            </select>
          </div>

          <div>
            <label className={labelStyle}>Duration</label>
            <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Duration</option>
              <option value="Monthly">Monthly</option>
              <option value="Quaterly">Quaterly</option>
              <option value="HalfYearly">Half Yearly</option>
              <option value="Yearly">Yearly</option>
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
              <input type="number" name="extraDays" value={formData.extraDays} onChange={handleInputChange} className={inputStyle} />
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
      </form>
    </div>
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
    extraDays: '0', agreeTerms: false
  });

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

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setFormData(prev => ({ ...prev, ...data, DateOfReJoin: format(new Date(), 'yyyy-MM-dd') }));
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
    if (clientNumber) fetchClientData();
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
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
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
              <option value="Strength">Strength</option>
              <option value="CardioCrossfit">Cardio Crossfit</option>
              <option value="Combo">Combo</option>
              <option value="Zumba">Zumba</option>
              <option value="Yoga">Yoga</option>
            </select>
          </div>
          <div>
            <label className={labelStyle}>Duration</label>
            <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Duration</option>
              <option value="Monthly">Monthly</option>
              <option value="Quaterly">Quaterly</option>
              <option value="HalfYearly">Half Yearly</option>
              <option value="Yearly">Yearly</option>
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
              <input type="number" name="extraDays" value={formData.extraDays} onChange={handleInputChange} className={inputStyle} />
            </div>
          </div>
        </div>

        <button type="submit" className="w-full bg-primary hover:bg-teal-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 mt-4">
          Submit Re-Admission
        </button>
      </form>
    </div>
  );
}

export function Renewal() {
  const router = useRouter();
  const { showToast } = useToast();
  const [clientNumber, setClientNumber] = useState('');
  const [formData, setFormData] = useState({
    Name: '', MembershipReceiptnumber: '', LastPaymentDate: '', LastValidityDate: '', LastMembershipType: '',
    Mobile: '', PlanPeriod: '', PlanType: '', DateOfRenewal: format(new Date(), 'yyyy-MM-dd'),
    MembershipExpiryDate: '', NextDuedate: '', LastPaymentAmount: '', RenewalReceiptNumber: '', extraDays: '0', agreeTerms: false
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const fetchClientData = async () => {
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      if (!jwtToken || !dbName) throw new Error('No token found.');

      const response = await fetch(`/api/members/renewal/${clientNumber}`, {
        headers: { Authorization: `Bearer ${jwtToken}`, 'X-Database-Name': dbName }
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setFormData(prev => ({ ...prev, ...data, DateOfRenewal: format(new Date(), 'yyyy-MM-dd') }));
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  useEffect(() => {
    if (clientNumber) fetchClientData();
  }, [clientNumber]);

  const updateExpiryDate = () => {
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
    <div className="bg-surface-light dark:bg-surface-dark p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
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
              <option value="Strength">Strength</option>
              <option value="CardioCrossfit">Cardio Crossfit</option>
              <option value="Combo">Combo</option>
              <option value="Zumba">Zumba</option>
              <option value="Yoga">Yoga</option>
            </select>
          </div>
          <div>
            <label className={labelStyle}>Duration</label>
            <select name="PlanPeriod" value={formData.PlanPeriod} onChange={handleInputChange} className={selectStyle} required>
              <option value="" disabled hidden>Select Duration</option>
              <option value="Monthly">Monthly</option>
              <option value="Quaterly">Quaterly</option>
              <option value="HalfYearly">Half Yearly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4 col-span-1 md:col-span-2">
            <div>
              <label className={labelStyle}>Last Expiry</label>
              <input type="text" value={formData.LastValidityDate ? format(new Date(formData.LastValidityDate), 'yyyy-MM-dd') : ''} readOnly className={`${inputStyle} bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelStyle}>Renewal Date</label>
              <input type="date" name="DateOfRenewal" value={formData.DateOfRenewal} onChange={handleInputChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>New Expiry</label>
              <input type="date" name="MembershipExpiryDate" value={formData.MembershipExpiryDate} readOnly className={`${inputStyle} bg-zinc-50 dark:bg-zinc-900 cursor-not-allowed`} />
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