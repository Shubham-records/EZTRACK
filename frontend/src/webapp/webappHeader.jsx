import React, { useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import logo from "../assets/logo.png";
import admin from "../assets/Capture.jpg"
import setting from "../assets/settings.svg"


export default function WebappHeader({clickedBUTTON}) {
  const navigate = useNavigate(); 

  async function handleLogout() {
    try {
        const response = await fetch('http://127.0.0.1:5000/logout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${localStorage.getItem('access_token')}`, // Use session storage
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('databaseName');

            navigate('/login'); 
        } else {
            const errorData = await response.json();
            console.log(errorData.message);
            alert('Failed to log out. Please try again.');
        }
    } catch (error) {
        alert('An error occurred while logging out. Please try again.');
    }
}

  return (
    <>
      <header className="headerwebapp" style={{backgroundColor:"#070708"}}>
        <nav className="nav1">
          <span style={{display:"flex", gap:"3rem"}}>
            <div className="logo">
              <img src={logo} alt="Revolution Gym" className="logo-image" />
            </div>
            <div className="memberSearch" style={{display:"flex", alignItems:"center"}}>
              <button className="MakeBill" id="boxDiv" onClick={()=>{clickedBUTTON("Billing")}} >Create Invocie</button>
            </div>
          </span>
          <div className="nav-right">
            <div className="staff-section">
              <span className="setting">
                <img src={setting} className="setting-icon" alt="setting Icon" />
                  <ul className="dropdown">
                      <p onClick={handleLogout}>Logout</p>
                  </ul>
                </span>
              <img src={admin} className="staff-icon" alt="Staff Icon" />
              <span className="staff-text">ADMIN</span>
            </div>
          </div>
        </nav>
        <nav className="nav2">
            <span onClick={()=>{clickedBUTTON("Dashboard")}}>
              Dashboard
            </span>
            <span onClick={()=>{clickedBUTTON("Insight")}}>
              Insight
            </span>
            <span>
              Members
                <ul className="dropdown">
                    <p onClick={()=>{clickedBUTTON("AllMember")}}>All Member</p>
                    <p onClick={()=>{clickedBUTTON("ActiveMember")}}>Active Member</p>
                    <p onClick={()=>{clickedBUTTON("MemberExpiries")}}>Member Expiries</p>
                </ul>
            </span>
            <span>
              Supplements
                <ul className="dropdown">
                    <p onClick={()=>{clickedBUTTON("Protein")}} >All Protein</p>
                </ul>
            </span>
            <span>
              Finance
                <ul className="dropdown">
                    <p onClick={()=>{clickedBUTTON("Invoices")}}>Invoices</p>
                    <p>Expenses</p>
                </ul>
            </span>
            <span>
              Staff
                <ul className="dropdown">
                    <p>All Staff</p>
                    <p>Add Staff</p>
                    <p>Staff Performance</p>
                </ul>
            </span>
            <span>
              diet
                <ul className="dropdown">
                    <p onClick={()=>{clickedBUTTON("Bmi")}}>Bmi</p>
                </ul>
            </span>
            <span>
              Attendance
                <ul className="dropdown">
                    <p>Add face</p>
                    <p>Attendance data</p>
                </ul>
            </span>
        </nav>
      </header>
    </>
  );
}
