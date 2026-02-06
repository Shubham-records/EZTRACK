import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from "@/context/ToastContext";
import WebappSidebar from "./webappSidebar";
import WebappFooter from "./webappFooter";
import Dashboard from "./dashboard";
import Billing from "./Billing";
import TableComponent from "./table";
import Insight from "./insights";
import InvoiceManagerComponent from './invoice-manager';
import BmiCalculator from './bmicalculator';
import StaffComponent from './staff';

export default function WebappMain() {
  const [selectedPage, setSelectedPage] = useState("Dashboard");
  const [gymmemberdata, Setgymmemberdata] = useState([]);
  const [proteinsdata, Setproteinsdata] = useState([]);

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
    <div className="flex h-screen overflow-hidden font-body antialiased bg-background-light dark:bg-background-dark text-zinc-800 dark:text-zinc-200 transition-colors duration-200 selection:bg-primary selection:text-white">
      <WebappSidebar clickedBUTTON={handlenavbarClick} />

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header from theme */}
        <header className="h-16 flex items-center justify-between px-8 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
          <div className="flex items-center text-sm text-zinc-500 dark:text-zinc-400">
            <span className="hover:text-primary cursor-pointer transition-colors">Home</span>
            <span className="material-symbols-outlined text-[10px] mx-2">chevron_right</span>
            <span className="font-semibold text-zinc-900 dark:text-white">{selectedPage}</span>
          </div>
          <div className="flex items-center space-x-6">
            <div className="relative w-96 group hidden md:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 group-focus-within:text-primary transition-colors">search</span>
              <input
                className="w-full bg-zinc-100 dark:bg-zinc-900 border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 shadow-inner transition-all outline-none"
                placeholder="Search..."
                type="text"
              />
            </div>
            <button className="relative text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-red-500 border border-white dark:border-zinc-800"></span>
            </button>
            <div className="flex items-center cursor-pointer">
              <div className="text-right mr-3 hidden md:block">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Admin</p>
                <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter">Super Admin</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-[#20b2aa] to-primary p-[2px]">
                <div className="h-full w-full rounded-full border-2 border-white dark:border-zinc-800 bg-zinc-200 overflow-hidden">
                  {/* Placeholder for user image */}
                </div>
              </div>
              <span className="material-symbols-outlined text-zinc-400 ml-1">expand_more</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 stitch-scrollbar">
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
          {selectedPage === "AddStaff" && <StaffComponent />}
        </div>
      </main>
    </div>
  );
}