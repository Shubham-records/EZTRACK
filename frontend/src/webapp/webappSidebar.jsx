"use client";
import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import logo from "../assets/logo.png";
import {
  Activity,
  Users,
  Calendar,
  DollarSign,
  UserCheck,
  ChevronDown,
  ChevronRight,
  Package,
  Utensils,
  LogOut,
  LayoutDashboard,
  ShieldCheck,
  Settings,
  Wallet,
  BarChart2,
  History,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

export default function WebappSidebar({ clickedBUTTON }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedItem, setSelectedItem] = useState('Dashboard');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [gymInfo, setGymInfo] = useState({ gymName: 'EZTRACK', slogan: '' });
  const [gymLogoUrl, setGymLogoUrl] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token) return;

        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Database-Name': dbName
          }
        });
        if (res.ok) {
          const user = await res.json();
          setUserRole(user.role); // OWNER, MANAGER, STAFF
        }
      } catch (e) {
        console.error("Failed to fetch user role", e);
      }
    };

    const fetchGymDetails = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token) return;

        const res = await fetch('/api/branch-details?include_logo=true', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName,
          }
        });
        if (res.ok) {
          const data = await res.json();
          setGymInfo({
            gymName: data.gymName || 'EZTRACK',
            slogan: data.slogan || '',
          });
          if (data.hasLogo && data.logoUrl) {
            setGymLogoUrl(data.logoUrl);
          }
        }
      } catch (e) {
        console.error("Failed to fetch gym details", e);
      }
    };

    fetchUser();
    fetchGymDetails();
  }, []);

  const baseItems = [
    {
      name: 'Dashboard',
      icon: LayoutDashboard,
      dropdownItems: []
    },
    {
      name: 'Analytics',
      icon: BarChart2,
      dropdownItems: []
    },
    {
      name: 'Registration', // "Billing" in main
      icon: UserCheck,
      dropdownItems: ['Billing'] // Points to Billing component
    },
    {
      name: 'Members',
      icon: Users,
      dropdownItems: ['All Member']
    },
    {
      name: 'Supplements',
      icon: Package,
      dropdownItems: ['Protein']
    },
    {
      name: 'Finance',
      icon: DollarSign,
      dropdownItems: ['Invoices', 'Expenses']
    },
    {
      name: 'diet',
      icon: Utensils,
      dropdownItems: ['Bmi']
    },
    {
      name: 'Attendance',
      icon: Calendar,
      dropdownItems: ['Attendance data', "Add face"]
    },
    {
      name: 'Settings',
      icon: Settings,
      dropdownItems: []
    },
    {
      name: 'AuditLogs',
      icon: History,
      dropdownItems: []
    },
  ];

  const staffItem = {
    name: 'Staff',
    icon: ShieldCheck,
    dropdownItems: ['All Staff', 'Add Staff', 'Staff Performance']
  };

  const sidebarItems = (userRole === 'OWNER' || userRole === 'MANAGER')
    ? [...baseItems.slice(0, 6), staffItem, ...baseItems.slice(6)]
    : baseItems;

  async function handleLogout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('eztracker_jwt_access_control_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        localStorage.removeItem('eztracker_jwt_access_control_token');
        localStorage.removeItem('eztracker_jwt_databaseName_control_token');
        window.location.href = '/login';
      } else {
        const errorData = await response.json();
        console.log(errorData.message);
        showToast('Failed to log out. Please try again.', 'error');
      }
    } catch (error) {
      showToast('An error occurred while logging out. Please try again.', 'error');
    }
  }

  const handleItemClick = (itemName) => {
    setSelectedItem(itemName);
    setOpenDropdown(openDropdown === itemName ? null : itemName);

    const item = sidebarItems.find(item => item.name === itemName);
    if (!item.dropdownItems.length) {
      clickedBUTTON(itemName);
    }
  };

  const handleDropdownItemClick = (itemName, dropdownItem) => {
    setSelectedItem(`${itemName} - ${dropdownItem}`);
    clickedBUTTON(dropdownItem.replace(/\s+/g, ''));
  };

  return (
    <aside className={`flex-shrink-0 bg-surface-light dark:bg-surface-dark border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-20 h-screen transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      {/* Header */}
      <div className={`h-16 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-4'} border-b border-zinc-100 dark:border-zinc-800`}>
        {!isCollapsed && (
          <div className="flex items-center overflow-hidden">
            {gymLogoUrl ? (
              <div className="h-10 max-w-[160px] flex items-center">
                <img src={gymLogoUrl} alt="Logo" className="h-full w-auto object-contain" />
              </div>
            ) : (
              <h1 className="font-bold text-lg tracking-tight text-zinc-900 dark:text-white truncate">
                {gymInfo.gymName || 'EZTRACK'}
              </h1>
            )}
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none ${!isCollapsed && 'ml-2 shrink-0'}`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-6 ${isCollapsed ? 'px-2' : 'px-3'} space-y-1`}>
        {sidebarItems.map((item) => {
          const isActive = selectedItem === item.name || (item.dropdownItems.length > 0 && String(selectedItem).startsWith(item.name));
          const Icon = item.icon || Activity;

          return (
            <div key={item.name} title={isCollapsed ? item.name : undefined}>
              <button
                className={`w-full group flex items-center ${isCollapsed ? 'justify-center py-3' : 'justify-between px-3 py-2.5'} text-sm font-medium rounded-md transition-colors ${isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                onClick={() => {
                  if (isCollapsed && item.dropdownItems.length > 0) {
                    setIsCollapsed(false);
                    setOpenDropdown(item.name);
                    setSelectedItem(item.name);
                  } else {
                    handleItemClick(item.name);
                  }
                }}
              >
                <div className="flex items-center overflow-hidden">
                  <Icon className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 shrink-0 ${isActive ? 'text-primary' : 'text-zinc-400 group-hover:text-primary transition-colors'}`} />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </div>
                {!isCollapsed && item.dropdownItems.length > 0 && (
                  openDropdown === item.name ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />
                )}
              </button>

              {/* Dropdown Items */}
              {!isCollapsed && openDropdown === item.name && item.dropdownItems.length > 0 && (
                <div className="mt-1 ml-4 space-y-1 border-l-2 border-zinc-100 dark:border-zinc-800 pl-2">
                  {item.dropdownItems.map((dropdownItem) => {
                    const isDropdownActive = selectedItem === `${item.name} - ${dropdownItem}`;
                    return (
                      <button
                        key={dropdownItem}
                        className={`w-full flex items-center px-3 py-2 text-xs font-medium rounded-md transition-colors ${isDropdownActive
                          ? 'text-primary bg-primary/5'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDropdownItemClick(item.name, dropdownItem)
                        }}
                      >
                        {dropdownItem}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer / User / Logout */}
      <div className={`border-t border-zinc-200 dark:border-zinc-800 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <button
          onClick={handleLogout}
          title={isCollapsed ? "Log Out" : undefined}
          className={`w-full group flex items-center ${isCollapsed ? 'justify-center py-3' : 'px-3 py-2.5'} text-sm font-medium rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 dark:hover:text-red-400 transition-colors`}
        >
          <LogOut className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 text-zinc-400 group-hover:text-red-500 transition-colors`} />
          {!isCollapsed && <span>Log Out</span>}
        </button>
      </div>
    </aside>
  );
}