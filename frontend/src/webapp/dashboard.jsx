import React, { useContext, useEffect, useState } from 'react';
import ExpriesOverdue from './expriesOverdue'
import { Activity, Users, HandCoins, ReceiptText, IndianRupee, UserRoundCheck, PiggyBank, UserRoundSearch, CalendarRange, UserCheck, User, ChevronDown, ChevronRight } from 'lucide-react';
import { ThemeContext } from './webappmain';

const DashboardCards = ({ icon: Icon, title, value, theme }) => (
  <div className={`p-4 ${theme === 'dark' ? 'primary-card-bg primary-text' : 'secondary-card-bg secondary-text'}`}
    style={{ borderRadius: "10px", border: `1px solid ${theme === 'dark' ? 'var(--primary-border-color)' : 'var(--secondary-border-color)'}` }}>
    <div className="flex items-center justify-between mb-2">
      <Icon className="text-orange-500" size={24} />
      <span className="text-2xl font-bold">{value}</span>
    </div>
    <p className={`text-sm ${theme === 'dark' ? 'primary-text-dim' : 'secondary-text-dim'}`}>{title}</p>
  </div>
);

export default function Dashboard() {
  const { theme } = useContext(ThemeContext);
  const [stats, setStats] = useState({
    activeMembers: 0,
    todayExpiry: 0,
    todayCollection: 0,
    weekCollection: 0,
    pendingBalance: 0,
    todayRenewal: 0,
    lastMonthRenewal: 0,
    memberPresent: 0
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
    <section className={`dashboardMain ${theme === 'dark' ? 'primary-bg' : 'secondary-bg'}`}>
      <div className='dashboardMainPart1'>

        <DashboardCards icon={Users} value={stats.activeMembers} title="Last Month Active Members" theme={theme} />
        <DashboardCards icon={UserRoundSearch} value={stats.todayExpiry} title="Today Plan Expiry" theme={theme} />
        <DashboardCards icon={IndianRupee} value={stats.todayCollection} title="Today Collection" theme={theme} />
        <DashboardCards icon={CalendarRange} value={stats.weekCollection} title="Week Collection" theme={theme} />
        <DashboardCards icon={HandCoins} value={stats.pendingBalance} title="Pending Balance" theme={theme} />
        <DashboardCards icon={IndianRupee} value={stats.todayRenewal} title="Today Renewal" theme={theme} />
        <DashboardCards icon={ReceiptText} value={stats.lastMonthRenewal} title="Last Month Renewal" theme={theme} />
        <DashboardCards icon={UserRoundCheck} value={stats.memberPresent} title="Member Present" theme={theme} />

      </div>
      <div className='dashboardMainPart2'>
        <div className='CollectionExpense' id='boxDiv'>
          <span style={{
            display: "flex",
            borderBottom: `1px solid ${theme === 'dark' ? 'var(--primary-border-color)' : 'var(--secondary-border-color)'}`
          }}>
            <h2 className={`flex-1 text-base p-4 rounded-tl ${theme === 'dark' ? 'primary-text' : 'secondary-text'}`}>
              Today Invoices
            </h2>
          </span>
          <span className="flex items-center justify-center h-60">
            <p className={theme === 'dark' ? 'primary-text-dim' : 'secondary-text-dim'}>
              today no Overdues
            </p>
          </span>
        </div>
        <ExpriesOverdue theme={theme} />
      </div>
    </section>
  )
}