import React, { useState, useEffect, useMemo } from 'react'
import WebappHeader from "./webappHeader";
import WebappFooter from "./webappFooter";
import Dashboard from "./dashboard";
import Billing from "./Billing";
import TableComponent from "./table";
import Insight from "./insights";
import InvoiceManagerComponent from './invoice-manager';
import BmiCalculator from './bmicalculator';




export default function WebappMain() {
  const [selectedPage, setSelectedPage] = useState("Dashboard");
  const [gymmemberdata, Setgymmemberdata] = useState([]);
  const [proteinsdata, Setproteinsdata] = useState([]);

  function handlenavbarClick(page) {
    setSelectedPage(page);
  }
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');

        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }

        const response = await fetch('http://127.0.0.1:5000/members', {
          headers: {
            Authorization: `Bearer ${jwtToken}`, 
            'Content-Type': 'application/json',
            'X-Database-Name': databaseName  
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const result = await response.json();
        Setgymmemberdata(result);  
      } catch (err) {
        alert(err.message);  
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
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');

        if (!jwtToken || !databaseName) {
          throw new Error('No token or database name found.');
        }
        const response = await fetch('http://127.0.0.1:5000/proteins',
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`, 
            'Content-Type': 'application/json',
            'X-Database-Name': databaseName
          }
        }
        );
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const result = await response.json();
        Setproteinsdata(result);
      } catch (err) {
        alert(err.message);
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
    return gymmemberdata.filter(member =>  member.MembershipStatus === "Active" || member.MembershipStatus === "active");
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
    <>
      <WebappHeader clickedBUTTON={handlenavbarClick}/>
      <section id="mainpage" style={{backgroundColor:"#070708"}}>
        {selectedPage === "Dashboard" && <Dashboard/>}
        {selectedPage === "Insight" && <Insight/>}
        {selectedPage === "Billing" && <Billing/>}
        {selectedPage === "Bmi" && <BmiCalculator/>}
        {selectedPage === "Invoices" && <InvoiceManagerComponent/>}
        {selectedPage === "AllMember" && <TableComponent gymmemberdata={gymmemberdata} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member"/>}
        {selectedPage === "ActiveMember" && <TableComponent gymmemberdata={activeMembersData} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member"/>}
        {selectedPage === "MemberExpiries" && <TableComponent gymmemberdata={inactiveMembersRecentDueDates} allColumns={memberscol} onUpdateData={handleUpdateData} dataType="member"/>}
        {selectedPage === "Protein" && <TableComponent gymmemberdata={proteinsdata} allColumns={proteins} dataType="protein" onUpdateData={handleproteinsData}/>}


      </section>
      <WebappFooter />
    </>
  );
}