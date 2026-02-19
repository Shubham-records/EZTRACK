import React, { useState } from "react";
import { NewAdmission, ReAdmission, Renewal, ProteinBilling, Expenses } from "./forms"
import { UserPlus, UserCheck, RefreshCw, Calendar, ShoppingBag, DollarSign } from 'lucide-react';

export default function Billing() {
  const [selectedPage, setSelectedPage] = useState("NewAdmission");

  const navItems = [
    { id: "NewAdmission", label: "New Admission", icon: UserPlus },
    { id: "ReAdmission", label: "Re-Admission", icon: UserCheck },
    { id: "Renewal", label: "Renewal", icon: RefreshCw },
    { id: "Protein", label: "Protein", icon: ShoppingBag },
    { id: "Expenses", label: "Expenses", icon: DollarSign },
  ];

  return (
    <section className="flex flex-col h-full bg-surface-light dark:bg-surface-dark transition-colors">

      {/* Navigation Card Grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setSelectedPage(item.id)}
                className={`
                  flex flex-row items-center justify-center p-4 rounded-xl border transition-all duration-200 group gap-3
                  ${isSelected
                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-primary hover:text-primary hover:bg-zinc-50 dark:hover:bg-zinc-700'
                  }
                `}
              >
                <Icon size={20} className={`${isSelected ? 'text-white' : 'text-zinc-400 group-hover:text-primary'}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-center">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Container */}
        <div className="w-full">
          {selectedPage === "NewAdmission" && <NewAdmission />}
          {selectedPage === "ReAdmission" && <ReAdmission />}
          {selectedPage === "Renewal" && <Renewal />}
          {selectedPage === "Protein" && <ProteinBilling />}
          {selectedPage === "Expenses" && <Expenses />}
        </div>
      </div>
    </section>
  );
}
