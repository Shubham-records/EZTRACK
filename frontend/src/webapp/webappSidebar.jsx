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
  History
} from 'lucide-react';

export default function WebappSidebar({ clickedBUTTON }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedItem, setSelectedItem] = useState('Dashboard');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [userRole, setUserRole] = useState(null);

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
    fetchUser();
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
      dropdownItems: ['All Member', 'Active Member', 'Member Expiries']
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
    <aside className="w-64 flex-shrink-0 bg-surface-light dark:bg-surface-dark border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-20 h-screen">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-zinc-100 dark:border-zinc-800">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white mr-3 overflow-hidden">
          {/* Use uploaded logo or fallback icon */}
          <Image src={logo} alt="FlexFlow" width={32} height={32} className="object-cover" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-zinc-900 dark:text-white">Rmg</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1">
            Enterprise
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {sidebarItems.map((item) => {
          const isActive = selectedItem === item.name || (item.dropdownItems.length > 0 && String(selectedItem).startsWith(item.name));
          const Icon = item.icon || Activity;

          return (
            <div key={item.name}>
              <button
                className={`w-full group flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                onClick={() => handleItemClick(item.name)}
              >
                <div className="flex items-center">
                  <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-primary' : 'text-zinc-400 group-hover:text-primary transition-colors'}`} />
                  {item.name}
                </div>
                {item.dropdownItems.length > 0 && (
                  openDropdown === item.name ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                )}
              </button>

              {/* Dropdown Items */}
              {openDropdown === item.name && item.dropdownItems.length > 0 && (
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
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-4">
        <button
          onClick={handleLogout}
          className="w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-md text-zinc-600 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5 text-zinc-400 group-hover:text-red-500 transition-colors" />
          Log Out
        </button>
      </div>
    </aside>
  );
}