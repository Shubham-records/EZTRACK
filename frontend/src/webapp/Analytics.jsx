import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { TrendingUp, Users, Package, DollarSign, ArrowUp, ArrowDown, Wallet, Filter, Calendar, Clock, AlertTriangle, Target, Percent, Download, RefreshCw, Printer } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import * as XLSX from 'xlsx';

const cardStyle = "bg-surface-light dark:bg-surface-dark p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm";
const COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Analytics() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('members');
    const [data, setData] = useState({
        members: null,
        revenue: null,
        protein: null,
        expenses: null,
        pending: null
    });
    const [rawData, setRawData] = useState({ members: [], invoices: [], proteins: [], expenses: [], pending: [] });

    // Filter states
    const [filters, setFilters] = useState({
        dateRange: 'all', // 'thisMonth', 'thisQuarter', 'thisYear', 'all'
        month: '', // 0-11
        year: new Date().getFullYear(),
        status: 'all', // 'Active', 'Expired', 'Inactive', 'all'
        planType: 'all',
        brand: 'all',
        category: 'all'
    });

    const getAuthHeaders = () => {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName,
        };
    };

    const handleRefresh = () => {
        setLoading(true);
        fetchAllData();
        showToast('Data refreshed', 'success');
    };

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // Members sheet
        if (rawData.members.length > 0) {
            const membersData = rawData.members.map(m => ({
                Name: m.Name || '',
                Phone: m.Phone || '',
                Email: m.Email || '',
                Status: m.MembershipStatus || '',
                Plan: m.PlanType || '',
                JoinDate: m.DateOfJoining || '',
                ExpiryDate: m.MembershipExpiryDate || m.NextDuedate || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(membersData), 'Members');
        }

        // Invoices sheet
        if (rawData.invoices.length > 0) {
            const invoicesData = rawData.invoices.map(i => ({
                InvoiceNo: i.invoiceNo || '',
                Date: i.invoiceDate || i.date || '',
                Type: i.invoiceType || '',
                Amount: i.total || i.amount || 0,
                PaymentMode: i.paymentMode || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoicesData), 'Invoices');
        }

        // Expenses sheet
        if (rawData.expenses.length > 0) {
            const expensesData = rawData.expenses.map(e => ({
                Title: e.title || '',
                Category: e.category || '',
                Amount: e.amount || 0,
                Date: e.date || '',
                Description: e.description || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expensesData), 'Expenses');
        }

        // Pending sheet
        if (rawData.pending.length > 0) {
            const pendingData = rawData.pending.map(p => ({
                Entity: p.entityName || '',
                Type: p.type || '',
                Amount: p.amount || 0,
                Paid: p.paidAmount || 0,
                Remaining: (p.amount || 0) - (p.paidAmount || 0),
                DueDate: p.dueDate || ''
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendingData), 'Pending');
        }

        // Proteins sheet
        if (rawData.proteins.length > 0) {
            const proteinsData = rawData.proteins.map(p => ({
                Name: p.ProductName || p.Name || '',
                Brand: p.Brand || '',
                Stock: p.AvailableStock || p.Quantity || 0,
                LandingPrice: p.LandingPrice || 0,
                SellingPrice: p.SellingPrice || 0
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(proteinsData), 'Proteins');
        }

        // Download file
        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Analytics_Report_${date}.xlsx`);
        showToast('Report downloaded successfully', 'success');
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        try {
            const [membersRes, invoicesRes, proteinsRes, expensesRes, pendingRes] = await Promise.all([
                fetch('/api/members', { headers: getAuthHeaders() }),
                fetch('/api/invoices', { headers: getAuthHeaders() }),
                fetch('/api/proteins', { headers: getAuthHeaders() }),
                fetch('/api/expenses', { headers: getAuthHeaders() }),
                fetch('/api/pending', { headers: getAuthHeaders() })
            ]);

            const members = membersRes.ok ? await membersRes.json() : [];
            const invoices = invoicesRes.ok ? await invoicesRes.json() : [];
            const proteins = proteinsRes.ok ? await proteinsRes.json() : [];
            const expenses = expensesRes.ok ? await expensesRes.json() : [];
            const pending = pendingRes.ok ? await pendingRes.json() : [];

            // Store raw data for filters
            setRawData({ members, invoices, proteins, expenses, pending });

            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();

            // Process members
            let newThisMonth = 0;
            let activeCount = 0;
            let inactiveCount = 0;
            let expiredCount = 0;
            const ageGroups = { '16-25': 0, '26-35': 0, '36-45': 0, '46+': 0 };
            const genderData = { Male: 0, Female: 0, Other: 0 };
            const planData = {};
            const monthlyGrowth = [];

            members.forEach(m => {
                if (m.MembershipStatus === 'Active' || m.MembershipStatus === 'active') activeCount++;
                else if (m.MembershipStatus === 'Inactive' || m.MembershipStatus === 'inactive') inactiveCount++;
                else if (m.MembershipStatus === 'Expired' || m.MembershipStatus === 'expired') expiredCount++;

                const age = parseInt(m.Age) || 25;
                if (age <= 25) ageGroups['16-25']++;
                else if (age <= 35) ageGroups['26-35']++;
                else if (age <= 45) ageGroups['36-45']++;
                else ageGroups['46+']++;

                if (m.Gender === 'M') genderData.Male++;
                else if (m.Gender === 'F') genderData.Female++;
                else genderData.Other++;

                if (m.PlanType) planData[m.PlanType] = (planData[m.PlanType] || 0) + 1;

                if (m.DateOfJoining || m.createdAt) {
                    const joinDate = new Date(m.DateOfJoining || m.createdAt);
                    if (joinDate.getMonth() === thisMonth && joinDate.getFullYear() === thisYear) {
                        newThisMonth++;
                    }
                }
            });

            // Calculate previous month stats for comparison
            const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
            const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;
            let newLastMonth = 0;
            members.forEach(m => {
                if (m.DateOfJoining || m.createdAt) {
                    const joinDate = new Date(m.DateOfJoining || m.createdAt);
                    if (joinDate.getMonth() === prevMonth && joinDate.getFullYear() === prevYear) {
                        newLastMonth++;
                    }
                }
            });

            // Members expiring soon (next 7, 14, 30 days)
            const expiringIn7Days = [];
            const expiringIn30Days = [];
            members.forEach(m => {
                if (m.MembershipExpiryDate || m.NextDuedate) {
                    const expiryStr = m.MembershipExpiryDate || m.NextDuedate;
                    let expiryDate;
                    if (expiryStr.includes('/')) {
                        expiryDate = new Date(expiryStr.split('/').reverse().join('-'));
                    } else {
                        expiryDate = new Date(expiryStr);
                    }
                    const daysUntil = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                    if (daysUntil > 0 && daysUntil <= 7) expiringIn7Days.push({ ...m, daysUntil });
                    else if (daysUntil > 7 && daysUntil <= 30) expiringIn30Days.push({ ...m, daysUntil });
                }
            });

            // Create monthly growth chart data (last 6 months)
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const monthName = d.toLocaleString('default', { month: 'short' });
                const count = members.filter(m => {
                    const joinDate = new Date(m.DateOfJoining || m.createdAt);
                    return joinDate.getMonth() === d.getMonth() && joinDate.getFullYear() === d.getFullYear();
                }).length;
                monthlyGrowth.push({ month: monthName, members: count });
            }

            setData(prev => ({
                ...prev,
                members: {
                    total: members.length,
                    active: activeCount,
                    inactive: inactiveCount,
                    expired: expiredCount,
                    newThisMonth,
                    newLastMonth,
                    growthRate: newLastMonth > 0 ? (((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1) : 0,
                    retentionRate: members.length > 0 ? ((activeCount / members.length) * 100).toFixed(1) : 0,
                    ageGroups: Object.entries(ageGroups).map(([name, value]) => ({ name, value })),
                    genderData: Object.entries(genderData).map(([name, value]) => ({ name, value })),
                    planData: Object.entries(planData).map(([name, value]) => ({ name, value })),
                    monthlyGrowth,
                    expiringIn7Days,
                    expiringIn30Days,
                    statusData: [
                        { name: 'Active', value: activeCount },
                        { name: 'Inactive', value: inactiveCount },
                        { name: 'Expired', value: expiredCount }
                    ]
                }
            }));

            // Process revenue
            let totalRevenue = 0;
            let thisMonthRevenue = 0;
            let lastMonthRevenue = 0;
            const revenueByType = {};
            const revenueByPayment = {};
            const monthlyRevenue = [];

            invoices.forEach(inv => {
                const amount = inv.total || inv.amount || 0;
                totalRevenue += amount;
                const type = inv.invoiceType || 'other';
                revenueByType[type] = (revenueByType[type] || 0) + amount;
                const payMode = inv.paymentMode || 'cash';
                revenueByPayment[payMode] = (revenueByPayment[payMode] || 0) + amount;

                if (inv.date || inv.createdAt || inv.invoiceDate) {
                    const date = new Date(inv.invoiceDate || inv.date || inv.createdAt);
                    if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
                        thisMonthRevenue += amount;
                    }
                    if (date.getMonth() === prevMonth && date.getFullYear() === prevYear) {
                        lastMonthRevenue += amount;
                    }
                }
            });

            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const monthName = d.toLocaleString('default', { month: 'short' });
                const monthTotal = invoices.filter(inv => {
                    const date = new Date(inv.invoiceDate || inv.date || inv.createdAt);
                    return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear();
                }).reduce((sum, inv) => sum + (inv.total || 0), 0);
                monthlyRevenue.push({ month: monthName, revenue: monthTotal });
            }

            setData(prev => ({
                ...prev,
                revenue: {
                    total: totalRevenue,
                    thisMonth: thisMonthRevenue,
                    lastMonth: lastMonthRevenue,
                    revenueGrowth: lastMonthRevenue > 0 ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1) : 0,
                    avgTransaction: invoices.length > 0 ? Math.round(totalRevenue / invoices.length) : 0,
                    revenueByType: Object.entries(revenueByType).map(([name, value]) => ({ name, value })),
                    revenueByPayment: Object.entries(revenueByPayment).map(([name, value]) => ({ name, value })),
                    monthlyRevenue,
                    transactionCount: invoices.length
                }
            }));

            // Process proteins
            let totalStockValue = 0;
            let lowStockCount = 0;
            const brandData = {};
            let totalMargin = 0;
            const lowStockItems = [];

            proteins.forEach(p => {
                const stock = p.AvailableStock || parseInt(p.Quantity) || 0;
                const sellingPrice = p.SellingPrice || p.LandingPrice || 0;
                const threshold = p.StockThreshold || 5;
                totalStockValue += sellingPrice * stock;
                if (stock < threshold) {
                    lowStockCount++;
                    lowStockItems.push({
                        name: p.ProductName || p.Name || 'Unknown',
                        brand: p.Brand || '-',
                        stock,
                        threshold,
                        urgency: stock === 0 ? 'critical' : stock <= 2 ? 'high' : 'medium'
                    });
                }
                if (p.Brand) brandData[p.Brand] = (brandData[p.Brand] || 0) + 1;
                if (p.SellingPrice && p.LandingPrice) {
                    totalMargin += (p.SellingPrice - p.LandingPrice) * stock;
                }
            });

            // Sort low stock by urgency
            lowStockItems.sort((a, b) => {
                const order = { critical: 0, high: 1, medium: 2 };
                return order[a.urgency] - order[b.urgency];
            });

            setData(prev => ({
                ...prev,
                protein: {
                    totalProducts: proteins.length,
                    totalStockValue,
                    lowStockCount,
                    lowStockItems,
                    avgMargin: proteins.length > 0 ? Math.round(totalMargin / proteins.length) : 0,
                    brandData: Object.entries(brandData).map(([name, value]) => ({ name, value }))
                }
            }));

            // Process expenses
            let totalExpenses = 0;
            let thisMonthExpenses = 0;
            const categoryData = {};
            const monthlyExpenses = [];

            expenses.forEach(exp => {
                const amount = exp.amount || 0;
                totalExpenses += amount;
                if (exp.category) categoryData[exp.category] = (categoryData[exp.category] || 0) + amount;
                if (exp.date) {
                    const date = new Date(exp.date);
                    if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
                        thisMonthExpenses += amount;
                    }
                }
            });

            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const monthName = d.toLocaleString('default', { month: 'short' });
                const monthTotal = expenses.filter(exp => {
                    const date = new Date(exp.date);
                    return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear();
                }).reduce((sum, exp) => sum + (exp.amount || 0), 0);
                monthlyExpenses.push({ month: monthName, expenses: monthTotal });
            }

            // Process pending with aging and top defaulters
            let totalPending = 0;
            let overdueCount = 0;
            const today = new Date().toISOString().split('T')[0];
            const topDefaulters = [];
            const agingBuckets = { '0-30': 0, '31-60': 0, '60+': 0 };

            pending.forEach(p => {
                const remaining = (p.amount || 0) - (p.paidAmount || 0);
                totalPending += remaining;

                // Track days overdue
                if (p.dueDate) {
                    const dueDate = new Date(p.dueDate);
                    const daysDiff = Math.floor((new Date() - dueDate) / (1000 * 60 * 60 * 24));
                    if (daysDiff > 0) {
                        overdueCount++;
                        if (daysDiff <= 30) agingBuckets['0-30'] += remaining;
                        else if (daysDiff <= 60) agingBuckets['31-60'] += remaining;
                        else agingBuckets['60+'] += remaining;
                    }
                }

                // Track top defaulters
                if (remaining > 0) {
                    topDefaulters.push({
                        name: p.entityName || p.memberName || 'Unknown',
                        type: p.type || 'Other',
                        amount: remaining,
                        dueDate: p.dueDate || '-'
                    });
                }
            });

            // Sort top defaulters by amount
            topDefaulters.sort((a, b) => b.amount - a.amount);

            // Create combined revenue vs expenses data
            const revenueVsExpenses = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const monthName = d.toLocaleString('default', { month: 'short' });
                const rev = monthlyRevenue.find(r => r.month === monthName)?.revenue || 0;
                const exp = monthlyExpenses.find(e => e.month === monthName)?.expenses || 0;
                revenueVsExpenses.push({ month: monthName, revenue: rev, expenses: exp, profit: rev - exp });
            }

            // Pending data for Pending tab
            setData(prev => ({
                ...prev,
                pending: {
                    total: totalPending,
                    overdueCount,
                    count: pending.length,
                    topDefaulters: topDefaulters.slice(0, 10),
                    agingData: Object.entries(agingBuckets).map(([name, value]) => ({ name, value }))
                }
            }));

            setData(prev => ({
                ...prev,
                expenses: {
                    total: totalExpenses,
                    thisMonth: thisMonthExpenses,
                    profitMargin: totalRevenue > 0 ? (((totalRevenue - totalExpenses) / totalRevenue) * 100).toFixed(1) : 0,
                    categoryData: Object.entries(categoryData).map(([name, value]) => ({ name, value })),
                    monthlyExpenses,
                    revenueVsExpenses,
                    expenseCount: expenses.length,
                    netProfit: totalRevenue - totalExpenses,
                    pending: { total: totalPending, overdue: overdueCount, count: pending.length }
                }
            }));

        } catch (error) {
            showToast('Failed to load analytics', 'error');
        } finally {
            setLoading(false);
        }
    };

    const proteinLeaderboard = React.useMemo(() => {
        if (activeTab !== 'protein') return [];
        const filterByDate = (date) => {
            if (!date) return false;
            const d = new Date(date);
            const { dateRange, month, year } = filters;
            const now = new Date();

            if (dateRange === 'all') {
                if (month !== '' && d.getMonth() !== parseInt(month)) return false;
                if (year && d.getFullYear() !== year) return false;
                return true;
            }
            if (dateRange === 'thisMonth') {
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }
            if (dateRange === 'previousMonth') {
                const prevMonthDate = new Date();
                prevMonthDate.setMonth(now.getMonth() - 1);
                return d.getMonth() === prevMonthDate.getMonth() && d.getFullYear() === prevMonthDate.getFullYear();
            }
            if (dateRange === 'thisQuarter') {
                const currentQuarter = Math.floor(now.getMonth() / 3);
                const dateQuarter = Math.floor(d.getMonth() / 3);
                return currentQuarter === dateQuarter && d.getFullYear() === now.getFullYear();
            }
            if (dateRange === 'halfYearly') {
                const isFirstHalfNow = now.getMonth() < 6;
                const isFirstHalfDate = d.getMonth() < 6;
                return isFirstHalfNow === isFirstHalfDate && d.getFullYear() === now.getFullYear();
            }
            if (dateRange === 'thisYear') {
                return d.getFullYear() === now.getFullYear();
            }
            return true;
        };

        const proteinSales = {};
        rawData.invoices.forEach(inv => {
            const type = (inv.invoiceType || '').toLowerCase();
            // Invoices specifically marked as protein
            if (type === 'protein') {
                const invDate = inv.invoiceDate || inv.date || inv.createdAt;
                if (filterByDate(invDate)) {
                    (inv.items || []).forEach(item => {
                        const name = item.description || 'Unknown Product';
                        // Apply brand filter if active
                        if (filters.brand !== 'all') {
                            const isBrandMatch = name.toLowerCase().includes(filters.brand.toLowerCase());
                            if (!isBrandMatch) return;
                        }
                        if (!proteinSales[name]) proteinSales[name] = { name, quantity: 0, revenue: 0 };
                        proteinSales[name].quantity += parseInt(item.quantity || 1);
                        proteinSales[name].revenue += parseFloat(item.amount || (item.price * item.quantity) || item.rate * item.quantity || 0);
                    });
                }
            }
        });

        return Object.values(proteinSales).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    }, [rawData.invoices, filters, activeTab]);

    const StatCard = ({ title, value, subtitle, trend, trendUp, icon: Icon, color }) => (
        <div className={cardStyle}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-bold text-zinc-500 uppercase">{title}</p>
                    <p className={`text-2xl font-bold mt-1 ${color || 'text-zinc-900 dark:text-white'}`}>{value}</p>
                    {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
                </div>
                <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    {Icon && <Icon size={20} className={color || 'text-zinc-600'} />}
                </div>
            </div>
            {trend !== undefined && (
                <div className={`flex items-center gap-1 mt-3 text-sm ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {trendUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    <span className="font-medium">{trend}</span>
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const tabs = [
        { id: 'members', label: 'Members', icon: Users },
        { id: 'revenue', label: 'Revenue', icon: TrendingUp },
        { id: 'protein', label: 'Protein', icon: Package },
        { id: 'expenses', label: 'Expenses', icon: DollarSign },
        { id: 'pending', label: 'Pending', icon: Wallet },
    ];

    const selectStyle = "px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-auto";

    const FilterBar = () => (
        <div className="flex items-center gap-2 p-3 mb-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <Filter size={16} className="text-zinc-500" />
            <select
                value={filters.dateRange}
                onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                className={selectStyle}
            >
                <option value="all">All Time</option>
                <option value="thisMonth">This Month</option>
                <option value="previousMonth">Previous Month</option>
                <option value="thisQuarter">This Quarter</option>
                <option value="halfYearly">Half Yearly</option>
                <option value="thisYear">This Year</option>
            </select>

            {filters.dateRange === 'all' && (
                <>
                    <select
                        value={filters.month}
                        onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value }))}
                        className={selectStyle}
                    >
                        <option value="">All Months</option>
                        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select
                        value={filters.year}
                        onChange={(e) => setFilters(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                        className={selectStyle}
                    >
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </>
            )}

            {activeTab === 'members' && (
                <>
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        className={selectStyle}
                    >
                        <option value="all">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                    <select
                        value={filters.planType}
                        onChange={(e) => setFilters(prev => ({ ...prev, planType: e.target.value }))}
                        className={selectStyle}
                    >
                        <option value="all">All Plans</option>
                        {Array.from(new Set(rawData.members.map(m => m.PlanType).filter(Boolean))).map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </>
            )}

            {activeTab === 'protein' && (
                <select
                    value={filters.brand}
                    onChange={(e) => setFilters(prev => ({ ...prev, brand: e.target.value }))}
                    className={selectStyle}
                >
                    <option value="all">All Brands</option>
                    {Array.from(new Set(rawData.proteins.map(p => p.Brand).filter(Boolean))).map(b => (
                        <option key={b} value={b}>{b}</option>
                    ))}
                </select>
            )}

            {activeTab === 'expenses' && (
                <select
                    value={filters.category}
                    onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                    className={selectStyle}
                >
                    <option value="all">All Categories</option>
                    {Array.from(new Set(rawData.expenses.map(e => e.category).filter(Boolean))).map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            )}
        </div>
    );

    return (
        <div className=" mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Analytics & Insights</h1>
                    <p className="text-sm text-zinc-500 mt-1">Comprehensive view of your gym performance</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        Refresh
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                        <Printer size={16} />
                        Print
                    </button>
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                    >
                        <Download size={16} />
                        Export Report
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                                ${isActive ? 'border-primary text-primary' : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Filter Bar */}
            <FilterBar />

            {/* Members Analytics */}
            {activeTab === 'members' && data.members && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Members" value={data.members.total} icon={Users} color="text-teal-500" />
                        <StatCard title="Active" value={data.members.active} subtitle={`${data.members.retentionRate}% retention`} icon={Users} color="text-emerald-500" />
                        <StatCard
                            title="New This Month"
                            value={data.members.newThisMonth}
                            trend={`${data.members.growthRate > 0 ? '+' : ''}${data.members.growthRate}% vs last month`}
                            trendUp={parseFloat(data.members.growthRate) >= 0}
                            icon={TrendingUp}
                            color="text-blue-500"
                        />
                        <StatCard title="Inactive/Expired" value={data.members.inactive + data.members.expired} icon={Users} color="text-rose-500" />
                    </div>


                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Member Status</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={data.members.statusData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {data.members.statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Plan Distribution</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={data.members.planData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {data.members.planData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Gender Split</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.members.genderData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                        <XAxis type="number" stroke="#71717a" />
                                        <YAxis type="category" dataKey="name" stroke="#71717a" width={50} />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Age Distribution</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.members.ageGroups}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                        <XAxis dataKey="name" stroke="#71717a" />
                                        <YAxis stroke="#71717a" />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Monthly Member Growth</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.members.monthlyGrowth}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                        <XAxis dataKey="month" stroke="#71717a" />
                                        <YAxis stroke="#71717a" />
                                        <Tooltip />
                                        <Area type="monotone" dataKey="members" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.3} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Revenue Analytics */}
            {activeTab === 'revenue' && data.revenue && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Revenue" value={`₹${data.revenue.total.toLocaleString()}`} icon={TrendingUp} color="text-emerald-500" />
                        <StatCard
                            title="This Month"
                            value={`₹${data.revenue.thisMonth.toLocaleString()}`}
                            trend={`${data.revenue.revenueGrowth > 0 ? '+' : ''}${data.revenue.revenueGrowth}% vs last month`}
                            trendUp={parseFloat(data.revenue.revenueGrowth) >= 0}
                            icon={TrendingUp}
                            color="text-blue-500"
                        />
                        <StatCard title="Avg Transaction" value={`₹${data.revenue.avgTransaction}`} icon={DollarSign} color="text-purple-500" />
                        <StatCard title="Transactions" value={data.revenue.transactionCount} icon={DollarSign} color="text-amber-500" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Revenue by Type</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={data.revenue.revenueByType} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {data.revenue.revenueByType.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Payment Modes</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={data.revenue.revenueByPayment} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {data.revenue.revenueByPayment?.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Month Comparison</h3>
                            <div className="space-y-4 mt-6">
                                <div className="flex justify-between items-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">This Month</span>
                                    <span className="font-bold text-emerald-500">₹{data.revenue.thisMonth.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Last Month</span>
                                    <span className="font-bold text-zinc-600 dark:text-zinc-300">₹{(data.revenue.lastMonth || 0).toLocaleString()}</span>
                                </div>
                                <div className={`flex justify-between items-center p-3 rounded-lg ${parseFloat(data.revenue.revenueGrowth) >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
                                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Growth</span>
                                    <span className={`font-bold ${parseFloat(data.revenue.revenueGrowth) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {data.revenue.revenueGrowth > 0 ? '+' : ''}{data.revenue.revenueGrowth}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={cardStyle}>
                        <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Monthly Revenue Trend</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.revenue.monthlyRevenue}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                    <XAxis dataKey="month" stroke="#71717a" />
                                    <YAxis stroke="#71717a" />
                                    <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, 'Revenue']} />
                                    <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Protein Analytics */}
            {activeTab === 'protein' && data.protein && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Products" value={data.protein.totalProducts} icon={Package} color="text-purple-500" />
                        <StatCard title="Stock Value" value={`₹${data.protein.totalStockValue.toLocaleString()}`} icon={DollarSign} color="text-emerald-500" />
                        <StatCard title="Low Stock Items" value={data.protein.lowStockCount} icon={Package} color={data.protein.lowStockCount > 0 ? "text-rose-500" : "text-emerald-500"} />
                        <StatCard title="Avg Margin" value={`₹${data.protein.avgMargin}`} icon={TrendingUp} color="text-blue-500" />
                    </div>

                    {/* Low Stock Alert */}
                    {data.protein.lowStockItems?.length > 0 && (
                        <div className={`${cardStyle} !bg-rose-50 dark:!bg-rose-900/20 !border-rose-200 dark:!border-rose-800`}>
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={18} className="text-rose-500" />
                                <h3 className="font-bold text-rose-700 dark:text-rose-400">Low Stock Alert ({data.protein.lowStockCount})</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="text-rose-600 dark:text-rose-400 border-b border-rose-200 dark:border-rose-700">
                                            <th className="pb-2">Product</th>
                                            <th className="pb-2">Brand</th>
                                            <th className="pb-2">Stock</th>
                                            <th className="pb-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rose-100 dark:divide-rose-800">
                                        {data.protein.lowStockItems.slice(0, 5).map((item, i) => (
                                            <tr key={i}>
                                                <td className="py-2 font-medium text-zinc-900 dark:text-white">{item.name}</td>
                                                <td className="py-2 text-zinc-600 dark:text-zinc-400">{item.brand}</td>
                                                <td className="py-2 font-bold text-rose-600">{item.stock} / {item.threshold}</td>
                                                <td className="py-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${item.urgency === 'critical' ? 'bg-rose-200 text-rose-800' : 'bg-orange-200 text-orange-800'}`}>
                                                        {item.urgency.toUpperCase()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Products by Brand</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.protein.brandData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                        <XAxis type="number" stroke="#71717a" />
                                        <YAxis dataKey="name" type="category" stroke="#71717a" width={100} />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className={`${cardStyle} flex flex-col`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                    <Target size={18} className="text-primary" />
                                    Top Selling Products
                                </h3>
                                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                    Leaderboard
                                </div>
                            </div>
                            {proteinLeaderboard.length > 0 ? (
                                <div className="flex-1 overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
                                                <th className="pb-2 font-medium">Rank</th>
                                                <th className="pb-2 font-medium">Product Name</th>
                                                <th className="pb-2 font-medium text-right">Sold Qty</th>
                                                <th className="pb-2 font-medium text-right">Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                            {proteinLeaderboard.map((item, i) => (
                                                <tr key={i} className="group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                    <td className="py-2.5 font-bold">
                                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs
                                                            ${i === 0 ? 'bg-amber-100 text-amber-700' :
                                                                i === 1 ? 'bg-zinc-200 text-zinc-700' :
                                                                    i === 2 ? 'bg-orange-100 text-orange-700' :
                                                                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                                            {i + 1}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 font-medium text-zinc-900 dark:text-white">{item.name}</td>
                                                    <td className="py-2.5 text-right font-bold text-primary">{item.quantity}</td>
                                                    <td className="py-2.5 text-right font-medium text-zinc-600 dark:text-zinc-400">₹{item.revenue.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col justify-center items-center text-zinc-500 py-8">
                                    <Package size={32} className="text-zinc-300 dark:text-zinc-600 mb-2" />
                                    <p>No sales data for selected period</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Expenses Analytics */}
            {activeTab === 'expenses' && data.expenses && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Expenses" value={`₹${data.expenses.total.toLocaleString()}`} icon={DollarSign} color="text-rose-500" />
                        <StatCard title="This Month" value={`₹${data.expenses.thisMonth.toLocaleString()}`} icon={DollarSign} color="text-amber-500" />
                        <StatCard
                            title="Profit Margin"
                            value={`${data.expenses.profitMargin}%`}
                            subtitle="Revenue - Expenses"
                            icon={Percent}
                            color={parseFloat(data.expenses.profitMargin) >= 0 ? "text-emerald-500" : "text-rose-500"}
                        />
                        <StatCard title="Net Profit" value={`₹${data.expenses.netProfit.toLocaleString()}`} icon={TrendingUp} color={data.expenses.netProfit >= 0 ? "text-emerald-500" : "text-rose-500"} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Expenses by Category</h3>
                            <div className="h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={data.expenses.categoryData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {data.expenses.categoryData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className={cardStyle}>
                            <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Category Breakdown</h3>
                            <div className="space-y-3 max-h-52 overflow-y-auto">
                                {data.expenses.categoryData.map((cat, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{cat.name}</span>
                                        </div>
                                        <span className="font-bold text-sm text-zinc-900 dark:text-white">₹{cat.value.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className={cardStyle}>
                        <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Revenue vs Expenses Trend</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.expenses.revenueVsExpenses}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                    <XAxis dataKey="month" stroke="#71717a" />
                                    <YAxis stroke="#71717a" />
                                    <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                                    <Legend />
                                    <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Pending Balances Analytics */}
            {activeTab === 'pending' && data.expenses?.pending && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Pending" value={`₹${data.expenses.pending.total?.toLocaleString() || 0}`} icon={Wallet} color="text-amber-500" />
                        <StatCard title="Pending Count" value={data.expenses.pending.count || 0} subtitle="outstanding balances" icon={Clock} color="text-blue-500" />
                        <StatCard title="Overdue" value={data.expenses.pending.overdue || 0} subtitle="past due date" icon={Clock} color="text-rose-500" />
                        <StatCard title="Net Profit" value={`₹${data.expenses.netProfit?.toLocaleString() || 0}`} subtitle="Revenue - Expenses" icon={TrendingUp} color="text-emerald-500" />
                    </div>

                    {/* Top Defaulters Alert */}
                    {data.expenses.pending.topDefaulters?.length > 0 && (
                        <div className={`${cardStyle} !bg-rose-50 dark:!bg-rose-900/20 !border-rose-200 dark:!border-rose-800`}>
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={18} className="text-rose-500" />
                                <h3 className="font-bold text-rose-700 dark:text-rose-400">Top Defaulters</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {data.expenses.pending.topDefaulters.slice(0, 6).map((d, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-white dark:bg-zinc-800 rounded-lg shadow-sm">
                                        <div>
                                            <p className="font-medium text-zinc-900 dark:text-white">{d.entityName}</p>
                                            <p className="text-xs text-zinc-500">{d.daysOverdue} days overdue</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-rose-600">₹{((d.amount || 0) - (d.paidAmount || 0)).toLocaleString()}</p>
                                            <p className="text-xs text-zinc-500">{d.type}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={cardStyle}>
                        <h3 className="font-bold text-zinc-900 dark:text-white mb-4">Pending Balances List</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs font-bold text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-700">
                                        <th className="pb-3">Entity</th>
                                        <th className="pb-3">Type</th>
                                        <th className="pb-3">Amount</th>
                                        <th className="pb-3">Paid</th>
                                        <th className="pb-3">Remaining</th>
                                        <th className="pb-3">Due Date</th>
                                        <th className="pb-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {rawData.pending.slice(0, 10).map((p, idx) => {
                                        const remaining = (p.amount || 0) - (p.paidAmount || 0);
                                        const today = new Date().toISOString().split('T')[0];
                                        const isOverdue = p.dueDate && p.dueDate < today;
                                        return (
                                            <tr key={p.id || idx} className="border-b border-zinc-100 dark:border-zinc-800">
                                                <td className="py-3 font-medium">{p.entityName || '-'}</td>
                                                <td className="py-3">{p.entityType || '-'}</td>
                                                <td className="py-3">₹{(p.amount || 0).toLocaleString()}</td>
                                                <td className="py-3 text-emerald-600">₹{(p.paidAmount || 0).toLocaleString()}</td>
                                                <td className="py-3 font-bold text-amber-600">₹{remaining.toLocaleString()}</td>
                                                <td className={`py-3 ${isOverdue ? 'text-rose-500' : ''}`}>{p.dueDate || '-'}</td>
                                                <td className="py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium
                                                        ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                            p.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-rose-100 text-rose-700'}`}>
                                                        {p.status || 'pending'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {rawData.pending.length === 0 && (
                                <p className="text-center py-8 text-zinc-500">No pending balances found</p>
                            )}
                            {rawData.pending.length > 10 && (
                                <p className="text-center py-3 text-sm text-zinc-500">Showing 10 of {rawData.pending.length} records</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
