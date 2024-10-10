import React, { useState, useEffect } from 'react';
import { addMonths, addYears, addDays, subDays, format, parse } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export function NewAdmission() {
  const navigate = useNavigate();

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
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
  
        const response = await fetch('http://127.0.0.1:5000/generateClientNumber', {
          headers: {
            Authorization: `Bearer ${jwtToken}`, 
            'X-Database-Name': databaseName  
          }
        });
  
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const data = await response.json();
        setClientNumber(data.clientNumber);
        setFormData(
          prev => ({ ...prev, MembershipReceiptnumber: data.clientNumber })
        );
      } catch (error) {
        alert(
          `Error fetching client number: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };
  
    fetchClientNumber();
  }, []);

  useEffect(() => {
    if (formData.PlanPeriod && formData.DateOfJoining) {
      updateExpiryDate();
    }
  }, [formData.PlanPeriod, formData.DateOfJoining, formData.extraDays]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    let newValue = type === 'checkbox' ? e.target.checked : value;
    const intFields = ['MembershipReceiptnumber', 'Age', 'weight', 'Mobile', 'Whatsapp', 'Aadhaar', 'LastPaymentAmount', 'RenewalReceiptNumber', 'extraDays'];
    const floatFields = ['height'];
  
    if (intFields.includes(name)) {
      newValue = value === '' ? null : parseInt(value, 10);
    } else if (floatFields.includes(name)) {
      newValue = value === '' ? null : parseFloat(value);
    }
  
    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));
  };

  const updateExpiryDate = () => {
    const joinDate = parse(formData.DateOfJoining, 'yyyy-MM-dd', new Date());
    let expiryDate = joinDate;
    
    switch (formData.PlanPeriod) {
      case 'Monthly':
        expiryDate = subDays(addMonths(joinDate, 1), 1);
        break;
      case 'Quaterly':
        expiryDate = subDays(addMonths(joinDate, 3), 1);
        break;
      case 'HalfYearly':
        expiryDate = subDays(addMonths(joinDate, 6), 1);
        break;
      case 'Yearly':
        expiryDate = subDays(addYears(joinDate, 1), 1);
        break;
    }

    if (formData.extraDays) {
      expiryDate = addDays(expiryDate, parseInt(formData.extraDays));
    }

    setFormData(prev => ({ 
      ...prev, 
      MembershipExpiryDate: format(expiryDate, 'yyyy-MM-dd'),
      NextDuedate: format(addDays(expiryDate, 1), 'yyyy-MM-dd')
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const jwtToken = localStorage.getItem('access_token');
      const databaseName = localStorage.getItem('databaseName');
      if (!jwtToken || !databaseName) {
        throw new Error('No token or database name found.');
      }
  
      // Ensure all required fields are present
      const requiredFields = ['Name', 'MembershipReceiptnumber', 'Gender', 'Age', 'DateOfJoining', 'PlanPeriod', 'PlanType'];
      for (let field of requiredFields) {
        if (!formData[field]) {
          throw new Error(`${field} is required.`);
        }
      }
  
      console.log('Sending data:', JSON.stringify(formData, null, 2));
  
      const response = await fetch('http://127.0.0.1:5000/newAdmission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
          'X-Database-Name': databaseName
        },
        body: JSON.stringify(formData)
      });
  
      const responseData = await response.json();
  
      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
      }
  
      console.log('Response:', responseData);
      alert('Admission submitted successfully!');
      navigate("/webapp");
    } catch (error) {
      console.error('Error details:', error);
      alert(`Error submitting form: ${error.message}`);
    }
  };

  return (
    (<form
      onSubmit={handleSubmit}
      style={{ background: "linear-gradient(135deg, #333333, #1a1a1a)" }}>
      <span
        style={{display:"flex", justifyContent: "space-between",alignItems: "center"}}>
        <h1>New Admission Billing</h1>
        <h2 style={{color:"white"}}>Client No: {clientNumber}</h2>
      </span>
      <div id="gridlayout">
        <span id="gridlayout">
          <input
            type="text"
            name="Name"
            value={formData.Name}
            onChange={handleInputChange}
            placeholder="Full name"
            required />
          <select
            name="Gender"
            value={formData.Gender}
            style={{color:"white"}}
            onChange={handleInputChange}
            required>
            <option value="" disabled hidden>Select Gender</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </span>
        <span
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
          <input
            type="number"
            name="Age"
            value={formData.Age}
            onChange={handleInputChange}
            placeholder="Age"
            required />
          <input
            type="number"
            name="height"
            value={formData.height || ''}
            onChange={handleInputChange}
            placeholder="Height (ft)"
            required />
          <input
            type="number"
            name="weight"
            value={formData.weight}
            onChange={handleInputChange}
            placeholder="Weight (kg)"
            required />
        </span>
        <span id="gridlayout">
          <textarea
            name="Address"
            value={formData.Address}
            style={{color:"white"}}
            onChange={handleInputChange}
            placeholder="Enter your address"
            required></textarea>
          <input
            type="number"
            name="Aadhaar"
            value={formData.Aadhaar}
            onChange={handleInputChange}
            placeholder="Aadhaar NO." />
        </span>
        <span
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
          <input
            type="number"
            name="Mobile"
            value={formData.Mobile}
            onChange={handleInputChange}
            placeholder="Phone NO."
            required />
          <input
            type="number"
            name="Whatsapp"
            value={formData.Whatsapp}
            onChange={handleInputChange}
            placeholder="WhatsApp NO."
            required />
          <input
            type="text"
            name="Remark"
            value={formData.Remark}
            onChange={handleInputChange}
            placeholder="Remark" />
        </span>
        <span id="gridlayout">
          <select
            name="PlanType"
            value={formData.PlanType}
            style={{color:"white"}}
            onChange={handleInputChange}
            required>
            <option value="" disabled hidden>Select Gym Plan</option>
            <option value="Strength">Strength</option>
            <option value="CardioCrossfit">Cardio Crossfit</option>
            <option value="Combo">Combo</option>
            <option value="Zumba">Zumba</option>
            <option value="Yoga">Yoga</option>
          </select>
          <select
            name="PlanPeriod"
            value={formData.PlanPeriod}
            onChange={handleInputChange}
            style={{color:"white"}}
            required>
            <option value="" disabled hidden>Time period</option>
            <option value="Monthly">Monthly</option>
            <option value="Quaterly">Quaterly</option>
            <option value="HalfYearly">Half Yearly</option>
            <option value="Yearly">Yearly</option>
          </select>
        </span>
        <span
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
          <input
            type="date"
            name="DateOfJoining"
            value={formData.DateOfJoining}
            onChange={handleInputChange}
            required />
          <input
            type="date"
            name="MembershipExpiryDate"
            value={formData.MembershipExpiryDate}
            readOnly />
          <input
            type="number"
            name="extraDays"
            value={formData.extraDays}
            onChange={handleInputChange}
            placeholder="Extra Days" />
        </span>
        <div style={{ display: "inline-flex" }}>
          <input
            type="checkbox"
            id="agreeTerms"
            name="agreeTerms"
            checked={formData.agreeTerms}
            onChange={handleInputChange}
            style={{ width: "auto" }}
            required />
          <label htmlFor="agreeTerms">I agree to the terms and conditions.</label>
        </div>
      </div>
      <button type="submit">Submit</button>
    </form>)
  );
}

export function ReAdmission() {
  const navigate = useNavigate();
  const [clientNumber, setClientNumber] = useState('');
  const [formData, setFormData] = useState({
    Name: '',
    MembershipReceiptnumber: '',
    Gender: '',
    Age: '',
    AccessStatus: 'no',
    height: '',
    weight: '',
    DateOfJoining: '',
    DateOfReJoin: format(new Date(), 'yyyy-MM-dd'),
    Billtype: '',
    Address: '',
    Whatsapp: '',
    PlanPeriod: '',
    PlanType: '',
    MembershipStatus: 'Active',
    MembershipExpiryDate: '',
    LastPaymentDate: '',
    NextDuedate: '',
    LastPaymentAmount: '',
    RenewalReceiptNumber: '',
    Aadhaar: '',
    Remark: '',
    Mobile: '',
    extraDays: '0',
    agreeTerms: false
  });

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const fetchClientData = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const jwtToken = localStorage.getItem('access_token');
      const databaseName = localStorage.getItem('databaseName');
      if (!jwtToken || !databaseName) {
        throw new Error('No token or database name found.');
      }

      const response = await fetch(`http://127.0.0.1:5000/fetchClient/${clientNumber}`, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'X-Database-Name': databaseName
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setFormData(prev => ({
        ...prev,
        ...data,
        DateOfReJoin: format(new Date(), 'yyyy-MM-dd')
      }));
    } catch (error) {
      alert(`Error fetching client data: ${error.message}`);
    }
  };

  useEffect(() => {
    if (clientNumber) {
      fetchClientData();
    }
  }, [clientNumber]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const jwtToken = localStorage.getItem('access_token');
      const databaseName = localStorage.getItem('databaseName');
      if (!jwtToken || !databaseName) {
        throw new Error('No token or database name found.');
      }

      const response = await fetch('http://127.0.0.1:5000/reAdmission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
          'X-Database-Name': databaseName
        },
        body: JSON.stringify(formData)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
      }

      alert('Re-Admission submitted successfully!');
      navigate("/webapp");
    } catch (error) {
      console.error('Error details:', error);
      alert(`Error submitting form: ${error.message}`);
    }
  };

  const updateExpiryDate = () => {
    const joinDate = parse(formData.DateOfReJoin, 'yyyy-MM-dd', new Date());
    let expiryDate = joinDate;
    
    switch (formData.PlanPeriod) {
      case 'Monthly':
        expiryDate = subDays(addMonths(joinDate, 1), 1);
        break;
      case 'Quaterly':
        expiryDate = subDays(addMonths(joinDate, 3), 1);
        break;
      case 'HalfYearly':
        expiryDate = subDays(addMonths(joinDate, 6), 1);
        break;
      case 'Yearly':
        expiryDate = subDays(addYears(joinDate, 1), 1);
        break;
    }

    if (formData.extraDays) {
      expiryDate = addDays(expiryDate, parseInt(formData.extraDays));
    }

    setFormData(prev => ({ 
      ...prev, 
      MembershipExpiryDate: format(expiryDate, 'yyyy-MM-dd'),
      NextDuedate: format(addDays(expiryDate, 1), 'yyyy-MM-dd')
    }));
  };

  useEffect(() => {
    if (formData.PlanPeriod && formData.DateOfReJoin) {
      updateExpiryDate();
    }
  }, [formData.PlanPeriod, formData.DateOfReJoin, formData.extraDays]);

  return (
    <form onSubmit={handleSubmit} style={{ background: "linear-gradient(135deg, #333333, #1a1a1a)" }}>
      <span style={{display:"flex", justifyContent: "space-between",alignItems: "center"}}>
        <h1>Re-Admission Billing</h1>
        <h2 style={{color:"white"}}>Client No: {formData.MembershipReceiptnumber}</h2>
      </span>
      <div id="gridlayout">
        <span id="gridlayout">
          <input
            type="text"
            name="clientNumber"
            value={clientNumber}
            onChange={(e) => setClientNumber(e.target.value)}
            onBlur={fetchClientData}
            placeholder="Enter Client NO."
          />
          <select
            name="Gender"
            value={formData.Gender}
            onChange={handleInputChange}
            style={{color:"white"}}
            required
          >
            <option value="" disabled hidden>Select Gender</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="O">Other</option>
          </select>
        </span>
        <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
          <input
            type="number"
            name="Age"
            value={formData.Age}
            onChange={handleInputChange}
            placeholder="Age"
            required
          />
          <input
            type="number"
            name="height"
            value={formData.height}
            onChange={handleInputChange}
            placeholder="Height (ft)"
            required
          />
          <input
            type="number"
            name="weight"
            value={formData.weight}
            onChange={handleInputChange}
            placeholder="Weight (kg)"
            required
          />
        </span>
        <span id="gridlayout">
          <textarea
            name="Address"
            value={formData.Address}
            onChange={handleInputChange}
            placeholder="Enter your address"
            style={{color:"white"}}
            required
          ></textarea>
          <input
            type="number"
            name="Aadhaar"
            value={formData.Aadhaar}
            onChange={handleInputChange}
            placeholder="Aadhaar NO."
          />
        </span>
        <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
          <input
            type="number"
            name="Mobile"
            value={formData.Mobile}
            onChange={handleInputChange}
            placeholder="Phone NO."
            required
          />
          <input
            type="number"
            name="Whatsapp"
            value={formData.Whatsapp}
            onChange={handleInputChange}
            placeholder="WhatsApp NO."
            required
          />
          <input
            type="text"
            name="Remark"
            value={formData.Remark}
            onChange={handleInputChange}
            placeholder="Remark"
          />
        </span>
        <span id="gridlayout">
          <select
            name="PlanType"
            value={formData.PlanType}
            onChange={handleInputChange}
            style={{color:"white"}}
            required
          >
            <option value="" disabled hidden>Select Gym Plan</option>
            <option value="Strength">Strength</option>
            <option value="CardioCrossfit">Cardio Crossfit</option>
            <option value="Combo">Combo</option>
            <option value="Zumba">Zumba</option>
            <option value="Yoga">Yoga</option>
          </select>
          <select
            name="PlanPeriod"
            value={formData.PlanPeriod}
            onChange={handleInputChange}
            style={{color:"white"}}
            required
          >
            <option value="" disabled hidden>Time period</option>
            <option value="Monthly">Monthly</option>
            <option value="Quaterly">Quaterly</option>
            <option value="HalfYearly">Half Yearly</option>
            <option value="Yearly">Yearly</option>
          </select>
        </span>
        <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
          <input
            type="date"
            name="DateOfReJoin"
            value={formData.DateOfReJoin}
            onChange={handleInputChange}
            required
          />
          <input
            type="date"
            name="MembershipExpiryDate"
            value={formData.MembershipExpiryDate}
            onChange={handleInputChange}
            readOnly
          />
          <input
            type="number"
            name="extraDays"
            value={formData.extraDays}
            onChange={handleInputChange}
            placeholder="Extra Days"
          />
        </span>
        <div style={{ display: "inline-flex" }}>
          <input
            type="checkbox"
            id="agreeTerms"
            name="agreeTerms"
            checked={formData.agreeTerms}
            onChange={handleInputChange}
            style={{ width: "auto" }}
            required
          />
          <label htmlFor="agreeTerms">I agree to the terms and conditions.</label>
        </div>
      </div>
      <button type="submit">Submit</button>
    </form>
  );
}

export function Renewal() {
    const navigate = useNavigate();
    const [clientNumber, setClientNumber] = useState('');
    const [formData, setFormData] = useState({
      Name: '',
      MembershipReceiptnumber: '',
      LastPaymentDate: '',
      LastValidityDate: '',
      LastMembershipType: '',
      Mobile: '',
      PlanPeriod: '',
      PlanType: '',
      DateOfRenewal: format(new Date(), 'yyyy-MM-dd'),
      MembershipExpiryDate: '',
      NextDuedate: '',
      LastPaymentAmount: '',
      RenewalReceiptNumber: '',
      extraDays: '0',
      agreeTerms: false
    });
  
    const handleInputChange = (e) => {
      const { name, value, type, checked } = e.target;
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    };
  
    const fetchClientData = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
  
        const response = await fetch(`http://127.0.0.1:5000/fetchClientForRenewal/${clientNumber}`, {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'X-Database-Name': databaseName
          }
        });
  
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          ...data,
          DateOfRenewal: format(new Date(), 'yyyy-MM-dd')
        }));
      } catch (error) {
        alert(`Error fetching client data: ${error.message}`);
      }
    };
  
    useEffect(() => {
      if (clientNumber) {
        fetchClientData();
      }
    }, [clientNumber]);
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
  
        const response = await fetch('http://127.0.0.1:5000/renewal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
            'X-Database-Name': databaseName
          },
          body: JSON.stringify(formData)
        });
  
        const responseData = await response.json();
  
        if (!response.ok) {
          throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
  
        alert('Renewal submitted successfully!');
        navigate("/webapp");
      } catch (error) {
        console.error('Error details:', error);
        alert(`Error submitting form: ${error.message}`);
      }
    };
  
    const updateExpiryDate = () => {
      const renewalDate = parse(formData.DateOfRenewal, 'yyyy-MM-dd', new Date());
      let expiryDate = renewalDate;
      
      switch (formData.PlanPeriod) {
        case 'Monthly':
          expiryDate = subDays(addMonths(renewalDate, 1), 1);
          break;
        case 'Quaterly':
          expiryDate = subDays(addMonths(renewalDate, 3), 1);
          break;
        case 'HalfYearly':
          expiryDate = subDays(addMonths(renewalDate, 6), 1);
          break;
        case 'Yearly':
          expiryDate = subDays(addYears(renewalDate, 1), 1);
          break;
      }
  
      if (formData.extraDays) {
        expiryDate = addDays(expiryDate, parseInt(formData.extraDays));
      }
  
      setFormData(prev => ({ 
        ...prev, 
        MembershipExpiryDate: format(expiryDate, 'yyyy-MM-dd'),
        NextDuedate: format(addDays(expiryDate, 1), 'yyyy-MM-dd')
      }));
    };
  
    useEffect(() => {
      if (formData.PlanPeriod && formData.DateOfRenewal) {
        updateExpiryDate();
      }
    }, [formData.PlanPeriod, formData.DateOfRenewal, formData.extraDays]);
  
    return (
      <form onSubmit={handleSubmit} style={{ background: "linear-gradient(135deg, #333333, #1a1a1a)" }}>
        <h1>Renewal Billing</h1>
        <div id="gridlayout">
          <span>
            <input
              type="text"
              name="clientNumber"
              value={clientNumber}
              onChange={(e) => setClientNumber(e.target.value)}
              onBlur={fetchClientData}
              placeholder="Enter Card NO."
            />
            <img src="/placeholder.svg?height=200&width=150" alt="Member Photo" style={{ width: "9vw", height: "20vh"}}/>
          </span>
          <span style={{display:"flex", flexDirection:"column", gap:"1.5rem"}}>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Member Name:-</p>
              <p>{formData.Name}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Last payment date:-</p>
              <p>{formData.LastPaymentDate}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Last validity:-</p>
              <p>{formData.LastValidityDate}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Last membership type:-</p>
              <p>{formData.LastMembershipType}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Phone No:-</p>
              <input
                type="text"
                name="Mobile"
                value={formData.Mobile}
                onChange={handleInputChange}
                style={{margin:"0", width:"auto"}}
              />           
            </span>
          </span>  
          <span id="gridlayout">
            <select
              name="PlanType"
              value={formData.PlanType}
              onChange={handleInputChange}
              style={{color:"white"}}
              required
            >
              <option value="" disabled hidden>Select Gym Plan</option>
              <option value="Strength">Strength</option>
              <option value="CardioCrossfit">Cardio Crossfit</option>
              <option value="Combo">Combo</option>
              <option value="Zumba">Zumba</option>
              <option value="Yoga">Yoga</option>
            </select>
            <select
              name="PlanPeriod"
              value={formData.PlanPeriod}
              onChange={handleInputChange}
              style={{color:"white"}}
              required
            >
              <option value="" disabled hidden>Time period</option>
              <option value="Monthly">Monthly</option>
              <option value="Quaterly">Quaterly</option>
              <option value="HalfYearly">Half Yearly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
            <input
              type="date"
              name="DateOfRenewal"
              value={formData.DateOfRenewal}
              onChange={handleInputChange}
              required
            />
            <input
              type="date"
              name="MembershipExpiryDate"
              value={formData.MembershipExpiryDate}
              onChange={handleInputChange}
              readOnly
            />
            <input
              type="number"
              name="extraDays"
              value={formData.extraDays}
              onChange={handleInputChange}
              placeholder="Extra Days"
            />
          </span>
          <div style={{ display: "inline-flex" }}>
            <input
              type="checkbox"
              id="agreeTerms"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleInputChange}
              style={{ width: "auto" }}
              required
            />
            <label htmlFor="agreeTerms">I agree to the terms and conditions.</label>
          </div>
        </div>
        <button type="submit">Submit</button>
      </form>
    );
}

export function PerDayBasis() {
    const navigate = useNavigate();
  
    const [formData, setFormData] = useState({
      Name: '',
      Gender: '',
      Age: null,
      height: null,
      weight: null,
      Address: '',
      Aadhaar: null,
      Mobile: null,
      Whatsapp: null,
      MedicalHistory: '',
      PlanType: '',
      Days: null,
      StartDate: format(new Date(), 'yyyy-MM-dd'),
      EndDate: '',
      Amount: null,
      agreeTerms: false
    });
  
    const handleInputChange = (e) => {
      const { name, value, type, checked } = e.target;
      let newValue = type === 'checkbox' ? checked : value;
      const intFields = ['Age', 'weight', 'Mobile', 'Whatsapp', 'Aadhaar', 'Days', 'Amount'];
      const floatFields = ['height'];
    
      if (intFields.includes(name)) {
        newValue = value === '' ? null : parseInt(value, 10);
      } else if (floatFields.includes(name)) {
        newValue = value === '' ? null : parseFloat(value);
      }
    
      setFormData(prev => ({
        ...prev,
        [name]: newValue
      }));
    };
  
    useEffect(() => {
      if (formData.StartDate && formData.Days) {
        const endDate = addDays(new Date(formData.StartDate), formData.Days);
        setFormData(prev => ({
          ...prev,
          EndDate: format(endDate, 'yyyy-MM-dd')
        }));
      }
    }, [formData.StartDate, formData.Days]);
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
    
        const response = await fetch('http://127.0.0.1:5000/perDayBasis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
            'X-Database-Name': databaseName
          },
          body: JSON.stringify(formData)
        });
    
        const responseData = await response.json();
    
        if (!response.ok) {
          throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
    
        alert('Per Day Basis admission submitted successfully!');
        navigate("/webapp");
      } catch (error) {
        console.error('Error details:', error);
        alert(`Error submitting form: ${error.message}`);
      }
    };
  
    return (
      <form onSubmit={handleSubmit} style={{ background: "linear-gradient(135deg, #333333, #1a1a1a)" }}>
        <h1>Per-Day-Basis Billing</h1>
        <div id="gridlayout">
          <span id="gridlayout">
            <input
              type="text"
              name="Name"
              value={formData.Name}
              onChange={handleInputChange}
              placeholder="Full name"
              required
            />
            <select
              name="Gender"
              value={formData.Gender}
              onChange={handleInputChange}
              style={{color:"white"}}
              required
            >
              <option value="" disabled hidden>Select Gender</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
            <input
              type="number"
              name="Age"
              value={formData.Age || ''}
              onChange={handleInputChange}
              placeholder="Age"
              required
            />
            <input
              type="number"
              name="height"
              value={formData.height || ''}
              onChange={handleInputChange}
              placeholder="Height (ft)"
              required
            />
            <input
              type="number"
              name="weight"
              value={formData.weight || ''}
              onChange={handleInputChange}
              placeholder="Weight (kg)"
              required
            />
          </span>
          <span id="gridlayout">
            <textarea
              name="Address"
              value={formData.Address}
              onChange={handleInputChange}
              placeholder="Enter your address"
              style={{color:"white"}}
              required
            ></textarea>
            <input
              type="number"
              name="Aadhaar"
              value={formData.Aadhaar || ''}
              onChange={handleInputChange}
              placeholder="Aadhaar NO."
            />
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
            <input
              type="number"
              name="Mobile"
              value={formData.Mobile || ''}
              onChange={handleInputChange}
              placeholder="Phone NO."
              required
            />
            <input
              type="number"
              name="Whatsapp"
              value={formData.Whatsapp || ''}
              onChange={handleInputChange}
              placeholder="WhatsApp NO."
              required
            />
            <input
              type="text"
              name="MedicalHistory"
              value={formData.MedicalHistory}
              onChange={handleInputChange}
              placeholder="Medical History"
            />
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
            <select
              name="PlanType"
              value={formData.PlanType}
              onChange={handleInputChange}
              style={{color:"white"}}
              required
            >
              <option value="" disabled hidden>Select Gym Plan</option>
              <option value="Strength">Strength</option>
              <option value="CardioCrossfit">Cardio Crossfit</option>
              <option value="Combo">Combo</option>
              <option value="Zumba">Zumba</option>
              <option value="Yoga">Yoga</option>
            </select>
            <input
              type="number"
              name="Days"
              value={formData.Days || ''}
              onChange={handleInputChange}
              placeholder="Number of Days"
              required
            />
            <input
              type="date"
              name="StartDate"
              value={formData.StartDate}
              onChange={handleInputChange}
              required
            />
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem" }}>
            <input
              type="date"
              name="EndDate"
              value={formData.EndDate}
              readOnly
            />
            <input
              type="number"
              name="Amount"
              value={formData.Amount || ''}
              onChange={handleInputChange}
              placeholder="Amount"
              required
            />
          </span>
          <div style={{ display: "inline-flex" }}>
            <input
              type="checkbox"
              id="agreeTerms"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleInputChange}
              style={{ width: "auto" }}
              required
            />
            <label htmlFor="agreeTerms">I agree to the terms and conditions.</label>
          </div>
        </div>
        <button type="submit">Submit</button>
      </form>
    );
}

export function ReturnMembership() {
    const navigate = useNavigate();
    const [clientNumber, setClientNumber] = useState('');
    const [formData, setFormData] = useState({
      Name: '',
      MembershipReceiptnumber: '',
      LastPaymentDate: '',
      LastValidityDate: '',
      LastMembershipType: '',
      Mobile: '',
      PlanPeriod: '',
      PlanType: '',
      ReturnDate: format(new Date(), 'yyyy-MM-dd'),
      RemainingDays: null,
      RefundAmount: null,
      Reason: '',
      agreeTerms: false
    });
  
    const handleInputChange = (e) => {
      const { name, value, type, checked } = e.target;
      let newValue = type === 'checkbox' ? checked : value;
      const intFields = ['MembershipReceiptnumber', 'Mobile', 'RemainingDays', 'RefundAmount'];
    
      if (intFields.includes(name)) {
        newValue = value === '' ? null : parseInt(value, 10);
      }
    
      setFormData(prev => ({
        ...prev,
        [name]: newValue
      }));
    };
  
    const fetchClientData = async () => {
      try {
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
  
        const response = await fetch(`http://127.0.0.1:5000/fetchClientForReturn/${clientNumber}`, {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'X-Database-Name': databaseName
          }
        });
  
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          ...data,
          ReturnDate: format(new Date(), 'yyyy-MM-dd')
        }));
      } catch (error) {
        alert(`Error fetching client data: ${error.message}`);
      }
    };
  
    useEffect(() => {
      if (clientNumber) {
        fetchClientData();
      }
    }, [clientNumber]);
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
  
        const response = await fetch('http://127.0.0.1:5000/returnMembership', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwtToken}`,
            'X-Database-Name': databaseName
          },
          body: JSON.stringify(formData)
        });
  
        const responseData = await response.json();
  
        if (!response.ok) {
          throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
  
        alert('Membership return processed successfully!');
        navigate("/webapp");
      } catch (error) {
        console.error('Error details:', error);
        alert(`Error submitting form: ${error.message}`);
      }
    };
  
    return (
      <form onSubmit={handleSubmit} style={{ background: "linear-gradient(135deg, #333333, #1a1a1a)" }}>
        <h1>Return Membership</h1>
        <div id="gridlayout">
          <span>
            <input
              type="text"
              name="clientNumber"
              value={clientNumber}
              onChange={(e) => setClientNumber(e.target.value)}
              onBlur={fetchClientData}
              placeholder="Enter Card NO."
            />
            <img src="/placeholder.svg?height=200&width=150" alt="Member Photo" style={{ width: "9vw", height: "20vh"}}/>
          </span>
          <span style={{display:"flex", flexDirection:"column", gap:"1.5rem"}}>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Member Name:</p>
              <p>{formData.Name}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Last payment date:</p>
              <p>{formData.LastPaymentDate}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Last validity:</p>
              <p>{formData.LastValidityDate}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Last membership type:</p>
              <p>{formData.LastMembershipType}</p>            
            </span>
            <span style={{display:"flex", alignItems:"center",gap:"0 1rem"}}>
              <p>Phone No:</p>
              <input
                type="text"
                name="Mobile"
                value={formData.Mobile}
                onChange={handleInputChange}
                style={{margin:"0", width:"auto"}}
              />           
            </span>
          </span>  
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem" }}>
            <input
              type="date"
              name="ReturnDate"
              value={formData.ReturnDate}
              onChange={handleInputChange}
              required
            />
            <input
              type="number"
              name="RemainingDays"
              value={formData.RemainingDays || ''}
              onChange={handleInputChange}
              placeholder="Remaining Days"
              required
            />
          </span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem" }}>
            <input
              type="number"
              name="RefundAmount"
              value={formData.RefundAmount || ''}
              onChange={handleInputChange}
              placeholder="Refund Amount"
              required
            />
            <textarea
              name="Reason"
              value={formData.Reason}
              onChange={handleInputChange}
              placeholder="Reason for return"
              style={{color:"white"}}
              required
            ></textarea>
          </span>
          <div style={{ display: "inline-flex" }}>
            <input
              type="checkbox"
              id="agreeTerms"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleInputChange}
              style={{ width: "auto" }}
              required
            />
            <label htmlFor="agreeTerms">I confirm that I want to return this membership.</label>
          </div>
        </div>
        <button type="submit">Process Return</button>
      </form>
    );
}