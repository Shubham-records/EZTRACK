import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { useToast } from "@/context/ToastContext";
import WebappHeader from "./webappHeader";
import WebappFooter from "./webappFooter";
import Dashboard from "./dashboard";
import Billing from "./Billing";
import TableComponent from "./table";
import Insight from "./insights";
import InvoiceManagerComponent from './invoice-manager';
import BmiCalculator from './bmicalculator';
import StaffComponent from './staff';

// Create context
export const ThemeContext = createContext();

export default function WebappMain() {
  const [selectedPage, setSelectedPage] = useState("Dashboard");
  const [gymmemberdata, Setgymmemberdata] = useState([]);
  const [proteinsdata, Setproteinsdata] = useState([]);
  const [theme, setTheme] = useState('light');
  const { showToast } = useToast();

  function handlenavbarClick(page) {
    setSelectedPage(page);
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        if (!jwtToken || !eztracker_jwt_databaseName_control_token) {
          throw new Error('No token or database name found.');
        }

        const response = await fetch('/api/members', {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'X-Database-Name': eztracker_jwt_databaseName_control_token
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const result = await response.json();
        Setgymmemberdata(result);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    const timeoutId = setTimeout(() => {
      fetchData();
    }, 5000);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        if (!jwtToken || !eztracker_jwt_databaseName_control_token) {
          throw new Error('No token or database name found.');
        }
        const response = await fetch('/api/proteins',
          {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
              'X-Database-Name': eztracker_jwt_databaseName_control_token
            }
          }
        );
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const result = await response.json();
        Setproteinsdata(result);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    const timeoutId = setTimeout(() => {
      fetchData();
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, []);

  const memberscol = [
    'Name',
    'MembershipReceiptnumber',
    'Gender',
    'Age',
    'height(ft)',
    'weight(kg)',
    'DateOfJoining',
    'DateOfReJoin',
    'Billtype',
    'PlanPeriod',
    'PlanType',
    'LastPaymentDate',
    'NextDuedate',
    'LastPaymentAmount',
    'RenewalReceiptNumber',
    'MembershipStatus',
    'MembershipExpiryDate',
    'AccessStatus',
    'Aadhaar',
    'Address',
    'Mobile',
    'Whatsapp',
    'Remark',
  ]
  const proteins = [
    "Year",
    "Month",
    "Brand",
    "Product Name",
    "Flavour",
    "Weight",
    "Quantity",
    "MRP Price(1 pcs)",
    "Landing price(1 pcs)",
    "Total price",
    "Remark",
  ];

  const activeMembersData = useMemo(() => {
    return gymmemberdata.filter(member => member.MembershipStatus === "Active" || member.MembershipStatus === "active");
  }, [gymmemberdata]);

  const inactiveMembersRecentDueDates = useMemo(() => {
    return gymmemberdata
      .filter(member =>
        member.MembershipStatus === "Inactive" || member.MembershipStatus === "inactive"
      )
      .map(member => ({
        ...member,
        NextDuedate: new Date(member.NextDuedate.split('/').reverse().join('-'))
      }))
      .sort((a, b) => b.NextDuedate - a.NextDuedate)
      .map(member => ({
        ...member,
        NextDuedate: member.NextDuedate.toLocaleDateString()
      }));
  }, [gymmemberdata]);

  const handleUpdateData = (updatedData) => {
    Setgymmemberdata(updatedData);
  };
  const handleproteinsData = (updatedData) => {
    Setproteinsdata(updatedData);
  };

  return (
    // Wrap the entire component with ThemeContext.Provider
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={`flex h-screen ${theme === 'dark' ? 'primary-bg primary-text' : 'secondary-bg secondary-text'}`}>
        <WebappHeader clickedBUTTON={handlenavbarClick} />
        <main className={`w-5/6 overflow-auto ${theme === 'dark' ? 'primary-bg' : 'secondary-bg'}`}
          id="mainpage"
          style={{ borderLeft: `2px solid ${theme === 'dark' ? 'var(--primary-border-color)' : 'var(--secondary-border-color)'}` }}>
          {selectedPage === "Dashboard" && <Dashboard />}
          {selectedPage === "Insight" && <Insight />}
          {selectedPage === "Billing" && <Billing />}
          {selectedPage === "Bmi" && <BmiCalculator />}
          {selectedPage === "Invoices" && <InvoiceManagerComponent />}
          {selectedPage === "AllMember" && <TableComponent gymmemberdata={gymmemberdata} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member" onNavigate={handlenavbarClick} />}
          {selectedPage === "ActiveMember" && <TableComponent gymmemberdata={activeMembersData} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member" onNavigate={handlenavbarClick} />}
          {selectedPage === "MemberExpiries" && <TableComponent gymmemberdata={inactiveMembersRecentDueDates} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member" onNavigate={handlenavbarClick} />}
          {selectedPage === "Protein" && <TableComponent gymmemberdata={proteinsdata} allColumns={proteins} dataType="protein" onUpdateData={handleproteinsData} />}
          {selectedPage === "AllStaff" && <StaffComponent />}
          {selectedPage === "AddStaff" && <StaffComponent />} {/* Reuse list for now, maybe open modal auto */}
        </main>
      </div>
    </ThemeContext.Provider>
  );
}