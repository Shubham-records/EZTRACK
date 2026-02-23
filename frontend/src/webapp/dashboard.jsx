import React, { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Chart } from "react-google-charts";
import { Calendar, Package, AlertTriangle } from 'lucide-react';
import ActionRequired from './ActionRequired';

const StatItem = ({ title, value, subtext, trendValue, type = "primary", icon = "group", isLast }) => {
  const isDanger = type === "danger";
  let valueColor = "text-slate-600 dark:text-slate-300";
  if (type === "success") valueColor = "text-emerald-500 dark:text-emerald-400";
  if (type === "danger") valueColor = "text-rose-500 dark:text-rose-400";
  if (type === "primary") valueColor = "text-slate-600 dark:text-slate-300";

  const trendColor = isDanger ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400";

  // Decide if we should show a trend arrow
  const hasArrow = /^[0-9]+%?$/.test(trendValue) || ['Up', 'Down', 'Profit', 'Loss'].includes(trendValue);
  const trendIcon = isDanger ? "▼" : "▲";

  return (
    <div className="flex flex-col py-5 px-6 min-w-[200px] flex-1 bg-surface-light dark:bg-surface-dark">
      <div className="flex items-center text-zinc-400 dark:text-zinc-500 mb-2">
        <span className="material-symbols-outlined text-[16px] mr-2">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
      </div>
      <h3 className={`text-4xl font-extrabold ${valueColor} mb-2 tracking-tight`}>{value}</h3>
      <div className="flex items-center text-xs font-medium text-zinc-400 whitespace-nowrap mt-1">
        {trendValue && (
          <span className={`${trendColor} mr-2 flex items-center font-bold`}>
            {hasArrow && <span className="mr-1">{trendIcon}</span>}
            {trendValue}
          </span>
        )}
        {subtext && (
          <span className="text-zinc-400 text-[10px] uppercase tracking-wide">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    activeMembers: 0, todayExpiry: 0, expiringThisWeek: 0,
    todayCollection: 0, weekCollection: 0, monthCollection: 0,
    pendingBalance: 0, lowStockItems: 0, todayExpenses: 0,
    monthExpenses: 0, netProfit: 0
  });
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Database-Name': dbName
        };

        const [statsRes, invoicesRes, expensesRes] = await Promise.all([
          fetch('/api/dashboard/stats', { headers }),
          fetch('/api/invoices', { headers }),
          fetch('/api/expenses', { headers })
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (invoicesRes.ok) setInvoices(await invoicesRes.json());
        if (expensesRes.ok) setExpenses(await expensesRes.json());
      } catch (e) {
        console.error("Failed to fetch dashboard data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Process Data for Charts
  const chartData = useMemo(() => {
    // 1. Revenue vs Expenses (Last 6 Months)
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { name: d.toLocaleString('default', { month: 'short' }), revenue: 0, expenses: 0 };
    }

    invoices.forEach(inv => {
      if (!inv.invoiceDate) return;
      const key = inv.invoiceDate.substring(0, 7); // YYYY-MM
      if (months[key]) months[key].revenue += (inv.total || 0);
    });

    expenses.forEach(exp => {
      if (!exp.date) return;
      const key = exp.date.substring(0, 7); // YYYY-MM
      if (months[key]) months[key].expenses += (exp.amount || 0);
    });

    const revenueGrowth = Object.values(months).map(m => ({
      ...m,
      profit: m.revenue - m.expenses
    }));

    // Filter by Date Range for Detail Charts
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    const filteredInvoices = invoices.filter(i => {
      const d = new Date(i.invoiceDate);
      return d >= start && d <= end;
    });

    const filteredExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });

    // 2. Sankey Diagram Links:
    // We want to show flow from [Income Sources] -> [Total Income] -> [Expense Categories]
    // If Total Expenses > Total Income, the flow is a bit weird, but we'll stick to a simple model:
    // (Income Mode) -> "Total Revenue" -> (Expense Category)
    // Plus "Profit" sink if Revenue > Expenses

    let sankeyData = [
      ["From", "To", "Amount"] // Header row required by Google Charts
    ];
    let totalRevenue = 0;

    // Process Invoices
    const incomeSourcesMap = {};
    filteredInvoices.forEach(inv => {
      let type = inv.invoiceType || inv.Billtype || 'Other';
      type = String(type).charAt(0).toUpperCase() + String(type).slice(1).toLowerCase();

      incomeSourcesMap[type] = (incomeSourcesMap[type] || 0) + (inv.total || 0);
      totalRevenue += (inv.total || 0);
    });

    Object.entries(incomeSourcesMap).forEach(([type, val]) => {
      if (val > 0) sankeyData.push([type, "Total Revenue", val]);
    });

    // Process Expenses
    const expenseSourcesMap = {};
    let totalExpense = 0;
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Other';
      expenseSourcesMap[cat] = (expenseSourcesMap[cat] || 0) + (exp.amount || 0);
      totalExpense += (exp.amount || 0);
    });

    Object.entries(expenseSourcesMap).forEach(([cat, val]) => {
      if (val > 0) sankeyData.push(["Total Revenue", cat, val]);
    });

    if (totalRevenue > totalExpense) {
      sankeyData.push(["Total Revenue", "Net Profit", totalRevenue - totalExpense]);
    }

    // fallback empty state
    if (sankeyData.length === 1) {
      sankeyData = null; // nullifies the data to trigger empty state graphic
    }

    return { revenueGrowth, sankeyData };
  }, [invoices, expenses, dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className=" mx-auto space-y-6">
      {/* Top Section: Stats (Left 8 cols) & Income vs Expense (Right 4 cols) */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Side: Stats as 3 column cards */}
        <div className="col-span-12 lg:col-span-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-[1px] bg-zinc-200 dark:bg-zinc-800 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <StatItem title="Active Members" value={stats.activeMembers} trendValue="Active" subtext="Current Users" type="primary" icon="group" />
            <StatItem title="Week Collection" value={`₹${stats.weekCollection.toLocaleString()}`} trendValue="Revenue" subtext="This Week" type="success" icon="payments" />
            <StatItem title="Today Expiry" value={stats.todayExpiry} trendValue={stats.todayExpiry.toString()} subtext="Action Needed" type={stats.todayExpiry > 0 ? "danger" : "primary"} icon="warning" />
            <StatItem title="Low Stock" value={stats.lowStockItems} trendValue={stats.lowStockItems.toString()} subtext={stats.lowStockItems > 0 ? "Restock" : "OK"} type={stats.lowStockItems > 0 ? "danger" : "success"} icon="inventory" />
            <StatItem title="Today Collection" value={`₹${stats.todayCollection.toLocaleString()}`} trendValue="Daily" subtext="Today's Revenue" type="success" icon="account_balance_wallet" />
            <StatItem title="Month Collection" value={`₹${stats.monthCollection.toLocaleString()}`} trendValue="Monthly" subtext="This Month" type="primary" icon="account_balance" />
            <StatItem title="Pending Balance" value={`₹${stats.pendingBalance.toLocaleString()}`} trendValue={stats.pendingBalance > 0 ? "Overdue" : "Clear"} subtext="Total Pending" type={stats.pendingBalance > 0 ? "danger" : "success"} icon="pending_actions" />
            <StatItem title="Net Profit" value={`₹${stats.netProfit.toLocaleString()}`} trendValue={stats.netProfit >= 0 ? "Profit" : "Loss"} subtext="This Month" type={stats.netProfit >= 0 ? "success" : "danger"} icon="query_stats" />
            <div className="bg-surface-light dark:bg-surface-dark flex-1"></div> {/* Empty space filler to make it a perfect grid if needed, or just let it wrap */}
          </div>
        </div>

        {/* Right Side: Income vs Expense Breakdown */}
        <div className="col-span-12 lg:col-span-7 bg-surface-light dark:bg-surface-dark p-6 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 flex flex-col h-full min-h-[400px]">
          <div className="mb-4 flex justify-between items-start">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Income vs Expense</h3>
              <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg w-fit">
                <Calendar size={14} className="text-zinc-500" />
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-xs font-medium border-none focus:ring-0 p-0 text-zinc-600 dark:text-zinc-300 w-24"
                />
                <span className="text-zinc-400">-</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-xs font-medium border-none focus:ring-0 p-0 text-zinc-600 dark:text-zinc-300 w-24"
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">Surplus</p>
              <h3 className={`text-3xl font-extrabold tracking-tight ${stats.netProfit >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                ₹{stats.netProfit.toLocaleString()}
              </h3>
            </div>
          </div>

          <div className="flex-1 w-full flex items-center justify-center">
            {chartData.sankeyData ? (
              <Chart
                chartType="Sankey"
                width="100%"
                height="250px"
                data={chartData.sankeyData}
                options={{
                  sankey: {
                    node: {
                      colors: ['#047857', '#059669', '#34d399', '#f43f5e', '#fbbf24', '#f87171'],
                      nodePadding: 16,
                      width: 10,
                      labelPadding: 16,
                      label: { color: localStorage.getItem('theme') === 'dark' ? '#fff' : '#18181b' }
                    },
                    link: {
                      colorMode: 'gradient',
                      fillOpacity: 0.3
                    }
                  }
                }}
              />
            ) : (
              <div className="text-sm font-medium text-zinc-400 flex flex-col items-center">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">data_alert</span>
                No income/expense flow to display
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Revenue & Growth Chart Section */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 bg-surface-light dark:bg-surface-dark p-6 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Revenue & Growth</h3>
              <p className="text-sm text-zinc-500">Income vs Expenses (Last 6 Months)</p>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData.revenueGrowth} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExp)" name="Expenses" />
                <Area type="monotone" dataKey="profit" stroke="#3b82f6" fillOpacity={1} fill="url(#colorProfit)" name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Combined Action Required */}
      <div className="col-span-12">
        <div className="bg-surface-light dark:bg-surface-dark rounded shadow-soft border border-zinc-200 dark:border-zinc-800 overflow-hidden p-4">
          <ActionRequired />
        </div>
      </div>

    </div>
  )
}