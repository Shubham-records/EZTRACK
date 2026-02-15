import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from "@/context/ToastContext";
import WebappSidebar from "./webappSidebar";
import WebappFooter from "./webappFooter";
import Dashboard from "./dashboard";
import Billing from "./Billing";
import TableComponent from "./table";

import InvoiceManagerComponent from './invoice-manager';
import BmiCalculator from './bmicalculator';
import StaffComponent from './staff';
import AdminSettings from './AdminSettings';
import PendingBalances from './PendingBalances';
import Analytics from './Analytics';
import AuditLogs from './AuditLogs';
import Invoices from './Invoices';
import Expenses from './Expenses';

export default function WebappMain() {
  const [selectedPage, setSelectedPage] = useState("Dashboard");
  const [gymmemberdata, Setgymmemberdata] = useState([]);
  const [proteinsdata, Setproteinsdata] = useState([]);

  const { showToast } = useToast();

  // Handle 401 Unauthorized - auto logout
  const handleUnauthorized = () => {
    console.warn('Session expired. Redirecting to login...');
    localStorage.removeItem('eztracker_jwt_access_control_token');
    localStorage.removeItem('eztracker_jwt_databaseName_control_token');
    localStorage.removeItem('eztracker_user_data');
    window.location.href = '/login';
  };

  function handlenavbarClick(page) {
    setSelectedPage(page);
  }

  useEffect(() => {
    const fetchMembers = async (skip = 0, currentData = []) => {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        if (!jwtToken || !dbName) {
          handleUnauthorized();
          return;
        }

        const limit = 50;
        // Sending limit/skip params to backend. If backend ignores, it returns all.
        const response = await fetch(`/api/members/?limit=${limit}&skip=${skip}`, {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName
          }
        });

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) throw new Error('Failed to fetch data');

        const result = await response.json();

        // Handle if result is wrapped or just array
        const newData = Array.isArray(result) ? result : (result.data || []);
        const allData = [...currentData, ...newData];

        Setgymmemberdata(allData);

        // Recursive call if we got a full batch (implies more might exist)
        if (newData.length === limit) {
          // Small delay to unblock main thread
          setTimeout(() => fetchMembers(skip + limit, allData), 100);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    fetchMembers();
  }, []);

  useEffect(() => {
    const fetchProteins = async (skip = 0, currentData = []) => {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        if (!jwtToken || !dbName) {
          handleUnauthorized();
          return;
        }

        const limit = 50;
        const response = await fetch(`/api/proteins/?limit=${limit}&skip=${skip}`,
          {
            headers: {
              Authorization: `Bearer ${jwtToken}`,
              'Content-Type': 'application/json',
              'X-Database-Name': dbName
            }
          }
        );

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) throw new Error('Failed to fetch data');

        const result = await response.json();
        const newData = Array.isArray(result) ? result : (result.data || []);
        const allData = [...currentData, ...newData];

        Setproteinsdata(allData);

        if (newData.length === limit) {
          setTimeout(() => fetchProteins(skip + limit, allData), 100);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    fetchProteins();
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

          {selectedPage === "Billing" && <Billing />}
          {selectedPage === "Bmi" && <BmiCalculator />}
          {selectedPage === "Invoices" && <Invoices />}
          {selectedPage === "Expenses" && <Expenses />}
          {selectedPage === "AllMember" && <TableComponent gymmemberdata={gymmemberdata} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member" onNavigate={handlenavbarClick} />}
          {selectedPage === "Protein" && <TableComponent gymmemberdata={proteinsdata} allColumns={proteins} dataType="protein" onUpdateData={handleproteinsData} />}
          {selectedPage === "AllStaff" && <StaffComponent />}
          {selectedPage === "AddStaff" && <StaffComponent />}
          {selectedPage === "Settings" && <AdminSettings />}
          {selectedPage === "Pending" && <PendingBalances />}
          {selectedPage === "Analytics" && <Analytics />}
          {selectedPage === "AuditLogs" && <AuditLogs />}
        </div>
      </main>
    </div>
  );
}