import React, { useEffect, useState } from 'react';
import ExpriesOverdue from './expriesOverdue'
import QuickActions from './QuickActions'

const StatCard = ({ title, value, subtext, trend, trendValue, type = "primary", icon = "trending_up" }) => {
  // Styles based on type
  const typeStyles = {
    primary: {
      text: "text-emerald-600",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      chartColor: "text-primary"
    },
    success: {
      text: "text-emerald-600",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      chartColor: "text-[#20b2aa]"
    },
    danger: {
      text: "text-rose-500",
      bg: "bg-rose-100 dark:bg-rose-900/30",
      chartColor: "text-rose-500"
    },
    info: {
      text: "text-zinc-500",
      bg: "bg-zinc-100 dark:bg-zinc-800",
      chartColor: "bg-teal-300" // For bar chart
    }
  };

  const style = typeStyles[type] || typeStyles.primary;

  return (
    <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-surface-light dark:bg-surface-dark p-6 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 hover:border-primary/50 dark:hover:border-primary/50 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mt-1">{value}</h3>
        </div>
        {trendValue && (
          <span className={`flex items-center text-xs font-bold ${style.text} ${style.bg} px-2 py-1 rounded`}>
            <span className="material-symbols-outlined text-[14px] mr-1">{icon}</span>
            {trendValue}
          </span>
        )}
      </div>

      {/* Visual / Chart Area */}
      <div className="h-10 w-full">
        {type === 'info' ? (
          <div className="h-10 w-full flex items-end space-x-1">
            <div className="w-1/6 bg-teal-100 dark:bg-teal-900/30 h-1/2 rounded-t-sm"></div>
            <div className="w-1/6 bg-teal-200 dark:bg-teal-800/30 h-2/3 rounded-t-sm"></div>
            <div className="w-1/6 bg-teal-300 dark:bg-teal-700/30 h-3/4 rounded-t-sm"></div>
            <div className="w-1/6 bg-primary h-full rounded-t-sm"></div>
            <div className="w-1/6 bg-teal-300 dark:bg-teal-700/30 h-4/5 rounded-t-sm"></div>
            <div className="w-1/6 bg-teal-100 dark:bg-teal-900/30 h-1/2 rounded-t-sm"></div>
          </div>
        ) : (
          <svg className={`w-full h-full ${style.chartColor}`} preserveAspectRatio="none" viewBox="0 0 100 20">
            <path d={type === 'danger' ? "M0 5 Q 25 5, 50 5 T 75 8 T 100 12" : "M0 15 Q 10 18, 20 12 T 40 10 T 60 14 T 80 5 T 100 8"} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"></path>
          </svg>
        )}
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState({
    activeMembers: 0,
    todayExpiry: 0,
    expiringThisWeek: 0,
    todayCollection: 0,
    weekCollection: 0,
    monthCollection: 0,
    pendingBalance: 0,
    lowStockItems: 0,
    todayExpenses: 0,
    monthExpenses: 0,
    netProfit: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        if (!token) return;

        const res = await fetch('/api/dashboard/stats', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName
          }
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Stats Grid - Row 1 */}
      <div className="grid grid-cols-12 gap-6">
        <StatCard title="Active Members" value={stats.activeMembers} trendValue="Members" type="primary" icon="group" />
        <StatCard title="Week Collection" value={`₹${stats.weekCollection.toLocaleString()}`} trendValue="Revenue" type="success" />
        <StatCard title="Today Expiry" value={stats.todayExpiry} trendValue={stats.todayExpiry > 0 ? "Action Needed" : "None"} type={stats.todayExpiry > 0 ? "danger" : "primary"} icon="warning" />
        <StatCard title="Low Stock Items" value={stats.lowStockItems} trendValue={stats.lowStockItems > 0 ? "Restock" : "OK"} type={stats.lowStockItems > 0 ? "danger" : "success"} icon="inventory" />

        {/* Second Row */}
        <StatCard title="Today Collection" value={`₹${stats.todayCollection.toLocaleString()}`} trendValue="Daily" type="success" />
        <StatCard title="Month Collection" value={`₹${stats.monthCollection.toLocaleString()}`} trendValue="Monthly" type="primary" />
        <StatCard title="Pending Balance" value={`₹${stats.pendingBalance.toLocaleString()}`} trendValue={stats.pendingBalance > 0 ? "Overdue" : "Clear"} type={stats.pendingBalance > 0 ? "danger" : "success"} icon="trending_down" />
        <StatCard title="Month Profit" value={`₹${stats.netProfit.toLocaleString()}`} trendValue={stats.netProfit >= 0 ? "Profit" : "Loss"} type={stats.netProfit >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid grid-cols-12 gap-6 h-96">
        {/* Revenue Chart Section */}
        <div className="col-span-12 lg:col-span-8 bg-surface-light dark:bg-surface-dark p-6 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Revenue & Growth</h3>
              <p className="text-sm text-zinc-500">Year-over-year comparison</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="flex items-center text-xs font-semibold text-zinc-500">
                <span className="w-3 h-3 rounded-full bg-primary mr-2"></span> Current
              </span>
              <span className="flex items-center text-xs font-semibold text-zinc-500">
                <span className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-700 mr-2"></span> Previous
              </span>
              <select className="ml-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold rounded-md py-1.5 px-3 text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-primary">
                <option>Last 30 Days</option>
                <option>Last Quarter</option>
                <option>This Year</option>
              </select>
            </div>
          </div>
          <div className="flex-1 w-full relative">
            <div className="absolute inset-0 flex flex-col justify-between text-xs text-zinc-400 dark:text-zinc-600">
              <div className="w-full border-b border-dashed border-zinc-200 dark:border-zinc-800/50 pb-0"></div>
              <div className="w-full border-b border-dashed border-zinc-200 dark:border-zinc-800/50 pb-0"></div>
              <div className="w-full border-b border-dashed border-zinc-200 dark:border-zinc-800/50 pb-0"></div>
              <div className="w-full border-b border-dashed border-zinc-200 dark:border-zinc-800/50 pb-0"></div>
              <div className="w-full border-b border-zinc-200 dark:border-zinc-800 pb-0"></div>
            </div>
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 50">
              <path d="M0 35 C 20 35, 30 40, 50 25 S 70 20, 100 30" fill="none" stroke="#d4d4d8" strokeDasharray="4" strokeWidth="2" vectorEffect="non-scaling-stroke"></path>
              <defs>
                <linearGradient id="fillGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#008080" stopOpacity="0.15"></stop>
                  <stop offset="100%" stopColor="#008080" stopOpacity="0"></stop>
                </linearGradient>
              </defs>
              <path d="M0 40 C 15 35, 25 10, 40 15 S 60 40, 80 10 S 90 15, 100 5 V 50 H 0 Z" fill="url(#fillGradient)" stroke="none" vectorEffect="non-scaling-stroke"></path>
              <path d="M0 40 C 15 35, 25 10, 40 15 S 60 40, 80 10 S 90 15, 100 5" fill="none" stroke="#008080" strokeLinecap="round" strokeWidth="3" vectorEffect="non-scaling-stroke"></path>
              <circle className="dark:fill-zinc-800" cx="80" cy="10" fill="#ffffff" r="4" stroke="#008080" strokeWidth="2"></circle>
            </svg>
          </div>
          <div className="flex justify-between text-xs font-bold text-zinc-400 mt-4 px-2">
            <span>MON</span>
            <span>TUE</span>
            <span>WED</span>
            <span>THU</span>
            <span>FRI</span>
            <span>SAT</span>
            <span>SUN</span>
          </div>
        </div>

        {/* Live Activity Section */}
        <div className="col-span-12 lg:col-span-4 bg-surface-light dark:bg-surface-dark p-0 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Live Activity</h3>
            <div className="flex items-center">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">SJ</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Sarah Jenkins</p>
                <p className="text-xs text-zinc-500 font-medium">Checked in at Front Desk</p>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">2m ago</span>
            </div>
            {/* More items can be added here */}
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-primary border border-teal-100 dark:border-teal-800/50">
                <span className="material-symbols-outlined text-sm">payment</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">Membership Renewed</p>
                <p className="text-xs text-zinc-500 font-medium">Michael Ross - Pro Plan</p>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">15m ago</span>
            </div>
          </div>
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/30 text-center">
            <a className="text-xs font-bold text-primary hover:text-[#006666] transition-colors" href="#">VIEW ALL ACTIVITY</a>
          </div>
        </div>
      </div>

      <div className="col-span-12">
        <div className="bg-surface-light dark:bg-surface-dark rounded shadow-soft border border-zinc-200 dark:border-zinc-800 overflow-hidden p-4">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 px-2">Action Required</h3>
          <ExpriesOverdue />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="col-span-12">
        <QuickActions />
      </div>
    </div>
  )
}