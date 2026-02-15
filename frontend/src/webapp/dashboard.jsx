import React, { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Calendar } from 'lucide-react';
import ExpriesOverdue from './expriesOverdue';

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

    const revenueGrowth = Object.values(months);

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

    // 2. Income Sources (by Payment Mode)
    const incomeSourcesMap = {};
    filteredInvoices.forEach(inv => {
      const mode = inv.paymentMode || 'Unknown';
      incomeSourcesMap[mode] = (incomeSourcesMap[mode] || 0) + (inv.total || 0);
    });
    const incomeSources = Object.entries(incomeSourcesMap).map(([name, value]) => ({ name, value }));

    // 3. Expense Sources (by Category)
    const expenseSourcesMap = {};
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Other';
      expenseSourcesMap[cat] = (expenseSourcesMap[cat] || 0) + (exp.amount || 0);
    });
    const expenseSources = Object.entries(expenseSourcesMap).map(([name, value]) => ({ name, value }));

    return { revenueGrowth, incomeSources, expenseSources };
  }, [invoices, expenses, dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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

      <div className="grid grid-cols-12 gap-6">
        {/* Revenue & Growth Chart */}
        <div className="col-span-12 lg:col-span-8 bg-surface-light dark:bg-surface-dark p-6 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 flex flex-col h-[400px]">
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
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Income & Expense Analysis Breakdown */}
        <div className="col-span-12 lg:col-span-4 bg-surface-light dark:bg-surface-dark p-6 rounded shadow-soft border border-zinc-200 dark:border-zinc-800 flex flex-col h-[400px]">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Income vs Expense</h3>
            <div className="flex items-center gap-2 mt-2 bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg">
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

          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {/* Income Breakdown */}
            <div>
              <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2 flex justify-between">
                <span>Income Sources</span>
                <span>₹{chartData.incomeSources.reduce((a, b) => a + b.value, 0).toLocaleString()}</span>
              </h4>
              <div className="h-40">
                {chartData.incomeSources.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.incomeSources}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.incomeSources.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                      <Legend verticalAlign="middle" align="right" layout="vertical" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-400">No data for selected period</div>
                )}
              </div>
            </div>

            <div className="border-t border-dashed border-zinc-200 dark:border-zinc-800"></div>

            {/* Expense Breakdown */}
            <div>
              <h4 className="text-xs font-bold text-rose-500 uppercase mb-2 flex justify-between">
                <span>Expense Breakdown</span>
                <span>₹{chartData.expenseSources.reduce((a, b) => a + b.value, 0).toLocaleString()}</span>
              </h4>
              <div className="h-40">
                {chartData.expenseSources.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData.expenseSources}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.expenseSources.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                      <Legend verticalAlign="middle" align="right" layout="vertical" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-400">No data for selected period</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12">
        <div className="bg-surface-light dark:bg-surface-dark rounded shadow-soft border border-zinc-200 dark:border-zinc-800 overflow-hidden p-4">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 px-2">Action Required</h3>
          <ExpriesOverdue />
        </div>
      </div>


    </div>
  )
}