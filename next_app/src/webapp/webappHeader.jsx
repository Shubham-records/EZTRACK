"use client";
import React, { useState, useContext } from 'react';
import { ThemeContext } from './webappmain';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
// import styled from 'styled-components'
import logo from "../assets/logo.png";
import admin from "../assets/Capture.jpg"
import setting from "../assets/settings.svg"
import { Activity, Users, Calendar, DollarSign, TrendingUp, Repeat, UserCheck, User, ChevronDown, ChevronRight } from 'lucide-react';

export default function WebappHeader({ clickedBUTTON }) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState('Dashboard');
  const [openDropdown, setOpenDropdown] = useState(null);
  const { theme, setTheme } = useContext(ThemeContext);
  const [isDarkMode, setIsDarkMode] = useState(false)

  const handleToggle = () => {
    setIsDarkMode(!isDarkMode)
  }

  const sidebarItems = [
    {
      name: 'Dashboard',
      dropdownItems: []
    },
    {
      name: 'Insight',
      dropdownItems: []
    },
    {
      name: 'Members',
      dropdownItems: ['All Member', 'Active Member', 'Member Expiries']
    },
    {
      name: 'Supplements',
      dropdownItems: ['Protein']
    },
    {
      name: 'Finance',
      dropdownItems: ['Invoices', 'Expenses']
    },
    {
      name: 'Staff',
      dropdownItems: ['All Staff', 'Add Staff', 'Staff Performance']
    },
    {
      name: 'diet',
      dropdownItems: ['Bmi']
    },
    {
      name: 'Attendance',
      dropdownItems: ['Attendance data', "Add face"]
    },
  ];

  async function handleLogout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`, // Use session storage
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('databaseName');

        router.push('/login');
      } else {
        const errorData = await response.json();
        console.log(errorData.message);
        alert('Failed to log out. Please try again.');
      }
    } catch (error) {
      alert('An error occurred while logging out. Please try again.');
    }
  }

  const handleItemClick = (itemName) => {
    setSelectedItem(itemName);
    setOpenDropdown(openDropdown === itemName ? null : itemName);

    // If the item has no dropdown items, call clickedBUTTON
    const item = sidebarItems.find(item => item.name === itemName);
    if (!item.dropdownItems.length) {
      clickedBUTTON(itemName);
    }
  };

  const handleDropdownItemClick = (itemName, dropdownItem) => {
    setSelectedItem(`${itemName} - ${dropdownItem}`);
    clickedBUTTON(dropdownItem.replace(/\s+/g, ''));  // Remove spaces from dropdownItem
  };

  const handleThemeToggle = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <aside className={`w-1/6 flex flex-col ${theme === 'dark' ? 'primary-bg primary-text' : 'secondary-bg secondary-text'}`}>
      <div className="flex justify-between items-center m-6">
        <div className="flex items-center">
          <Image src={logo} alt="Logo" className="text-orange-500 mr-2" style={{ width: "5rem", height: "auto" }} />
          <span className="text-2xl font-bold">Rmg</span>
        </div>

      </div>
      <div>
        <input id="switch" type="checkbox" onClick={handleThemeToggle} />
        <div className="app">
          <div className="body">
            <div className="phone">
              <div className="content">
                <label htmlFor="switch">
                  <div className="toggle"></div>
                  <div className="names">
                    <p className="light">Light</p>
                    <p className="dark">Dark</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>


      <nav className="flex-1 m-6">
        <ul className="space-y-2">
          {sidebarItems.map((item) => (
            <li key={item.name}>
              <div
                className={`flex items-center justify-between cursor-pointer ${selectedItem === item.name
                  ? `${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'} rounded border-r-2 border-orange-500`
                  : `${theme === 'dark' ? 'primary-text-dim' : 'secondary-text-dim'} hover:text-current`
                  } p-2`}
                onClick={() => handleItemClick(item.name)}
              >
                <div className="flex items-center">
                  {item.name}
                </div>
                {item.dropdownItems.length > 0 && (
                  openDropdown === item.name ? <ChevronDown size={20} /> : <ChevronRight size={20} />
                )}
              </div>
              {openDropdown === item.name && item.dropdownItems.length > 0 && (
                <ul className="ml-6 mt-2 space-y-2">
                  {item.dropdownItems.map((dropdownItem) => (
                    <li
                      key={dropdownItem}
                      className={`cursor-pointer ${selectedItem === `${item.name} - ${dropdownItem}`
                        ? "text-white"
                        : "text-gray-400 hover:text-white"
                        } p-2`}
                      onClick={() => handleDropdownItemClick(item.name, dropdownItem)}
                    >
                      {dropdownItem}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <button
        className={`mt-auto ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'} flex justify-center gap-3 text-current p-2 rounded m-6`}
        onClick={handleLogout}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="size-6"
        >
          <g strokeWidth="0" id="SVGRepo_bgCarrier"></g>
          <g
            strokeLinejoin="round"
            strokeLinecap="round"
            id="SVGRepo_tracerCarrier"
          ></g>
          <g id="SVGRepo_iconCarrier">
            <path
              className="group-focus:fill-white"
              fill="#000000"
              d="M17.2929 14.2929C16.9024 14.6834 16.9024 15.3166 17.2929 15.7071C17.6834 16.0976 18.3166 16.0976 18.7071 15.7071L21.6201 12.7941C21.6351 12.7791 21.6497 12.7637 21.6637 12.748C21.87 12.5648 22 12.2976 22 12C22 11.7024 21.87 11.4352 21.6637 11.252C21.6497 11.2363 21.6351 11.2209 21.6201 11.2059L18.7071 8.29289C18.3166 7.90237 17.6834 7.90237 17.2929 8.29289C16.9024 8.68342 16.9024 9.31658 17.2929 9.70711L18.5858 11H13C12.4477 11 12 11.4477 12 12C12 12.5523 12.4477 13 13 13H18.5858L17.2929 14.2929Z"
            ></path>
            <path
              className="group-focus:fill-white"
              fill="#000"
              d="M5 2C3.34315 2 2 3.34315 2 5V19C2 20.6569 3.34315 22 5 22H14.5C15.8807 22 17 20.8807 17 19.5V16.7326C16.8519 16.647 16.7125 16.5409 16.5858 16.4142C15.9314 15.7598 15.8253 14.7649 16.2674 14H13C11.8954 14 11 13.1046 11 12C11 10.8954 11.8954 10 13 10H16.2674C15.8253 9.23514 15.9314 8.24015 16.5858 7.58579C16.7125 7.4591 16.8519 7.35296 17 7.26738V4.5C17 3.11929 15.8807 2 14.5 2H5Z"
            ></path>
          </g>
        </svg>
        Log Out
      </button>
    </aside>
  );
}

// const StyledWrapper = styled.div<{ isDarkMode: boolean }>`
//   .toggle {
//     background-color: ${(props) => (props.isDarkMode ? '#1a1a1a' : '#ffffff')};
//     width: 56px;
//     height: 56px;
//     border-radius: 50%;
//     display: grid;
//     place-items: center;
//     cursor: pointer;
//     box-shadow: ${(props) =>
//       props.isDarkMode ? '0 0 50px 20px rgba(255, 255, 255, 0.1)' : '0 0 50px 20px rgba(0, 0, 0, 0.1)'};
//     line-height: 1;
//     transition: background-color 0.3s ease, box-shadow 0.3s ease;
//   }

//   .input {
//     display: none;
//   }

//   .icon {
//     grid-column: 1 / 1;
//     grid-row: 1 / 1;
//     transition: transform 500ms, color 0.3s ease;
//     color: ${(props) => (props.isDarkMode ? '#ffffff' : '#000000')};
//   }

//   .icon--moon {
//     transition-delay: 200ms;
//   }

//   .icon--sun {
//     transform: scale(0);
//   }

//   #switch:checked + .icon--moon {
//     transform: rotate(360deg) scale(0);
//   }

//   #switch:checked ~ .icon--sun {
//     transition-delay: 200ms;
//     transform: scale(1) rotate(360deg);
//   }
// `