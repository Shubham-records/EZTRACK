import React, { useContext } from 'react';
import ExpriesOverdue from './expriesOverdue'
import { Activity, Users, HandCoins, ReceiptText,IndianRupee, UserRoundCheck , PiggyBank , UserRoundSearch , CalendarRange , UserCheck, User, ChevronDown, ChevronRight } from 'lucide-react';
import { ThemeContext } from './webappmain';

const DashboardCards = ({ icon: Icon, title, value, theme }) => (
  <div className={`p-4 ${theme === 'dark' ? 'primary-card-bg primary-text' : 'secondary-card-bg secondary-text'}`} 
    style={{borderRadius:"10px", border: `1px solid ${theme === 'dark' ? 'var(--primary-border-color)' : 'var(--secondary-border-color)'}` }}>
    <div className="flex items-center justify-between mb-2">
      <Icon className="text-orange-500" size={24} />
      <span className="text-2xl font-bold">{value}</span>
    </div>
    <p className={`text-sm ${theme === 'dark' ? 'primary-text-dim' : 'secondary-text-dim'}`}>{title}</p>
  </div>
);

export default function Dashboard() {
  const { theme } = useContext(ThemeContext);

  return (
    <section className={`dashboardMain ${theme === 'dark' ? 'primary-bg' : 'secondary-bg'}`}>
      <div className='dashboardMainPart1'>
            
            <DashboardCards icon={Users} value={0} title="Last Month Active Members" theme={theme}/>
            <DashboardCards icon={UserRoundSearch} value={0} title="Today Plan Expiry" theme={theme}/>
            <DashboardCards icon={IndianRupee} value={0} title="Today Collection" theme={theme}/>
            <DashboardCards icon={CalendarRange } value={0} title="Week Collection" theme={theme}/>
            <DashboardCards icon={HandCoins} value={0} title="Pending Balance" theme={theme}/>
            <DashboardCards icon={IndianRupee} value={0} title="Today Renewal" theme={theme}/>
            <DashboardCards icon={ReceiptText} value={0} title="Last Month Renewal" theme={theme}/>
            <DashboardCards icon={UserRoundCheck} value={0} title="Member Present" theme={theme}/>

        </div>
        <div className='dashboardMainPart2'>
            <div className='CollectionExpense' id='boxDiv'>
              <span style={{
                display:"flex", 
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