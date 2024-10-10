import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  AreaChart,
  Area,
} from 'recharts';

// Mock data for charts
const memberGrowthData = [
  { month: 'Jan', newMembers: 50, leavingMembers: 20, totalMembers: 500 },
  { month: 'Feb', newMembers: 60, leavingMembers: 25, totalMembers: 535 },
  { month: 'Mar', newMembers: 55, leavingMembers: 30, totalMembers: 560 },
  { month: 'Apr', newMembers: 70, leavingMembers: 20, totalMembers: 610 },
  { month: 'May', newMembers: 65, leavingMembers: 35, totalMembers: 640 },
  { month: 'Jun', newMembers: 80, leavingMembers: 30, totalMembers: 690 },
]

const memberTypeData = [
  { name: 'Strength', value: 60 },
  { name: 'Cardio', value: 40 },
]

const activeMonthlyMembersData = [
  { month: 'Jan', activeMembers: 450 },
  { month: 'Feb', activeMembers: 480 },
  { month: 'Mar', activeMembers: 510 },
  { month: 'Apr', activeMembers: 550 },
  { month: 'May', activeMembers: 590 },
  { month: 'Jun', activeMembers: 620 },
]

const ageGroupData = [
  { month: 'Jan', '>20': 100, '21-25': 150, '26-30': 120, '31-40': 80, '40+': 50 },
  { month: 'Feb', '>20': 110, '21-25': 160, '26-30': 130, '31-40': 85, '40+': 50 },
  { month: 'Mar', '>20': 120, '21-25': 170, '26-30': 140, '31-40': 90, '40+': 55 },
  { month: 'Apr', '>20': 130, '21-25': 180, '26-30': 150, '31-40': 95, '40+': 60 },
  { month: 'May', '>20': 140, '21-25': 190, '26-30': 160, '31-40': 100, '40+': 65 },
  { month: 'Jun', '>20': 150, '21-25': 200, '26-30': 170, '31-40': 105, '40+': 70 },
]

const paymentModeData = [
  { name: 'Cash', value: 30 },
  { name: 'Online', value: 50 },
  { name: 'GST', value: 20 },
]

const revenueSourceData = [
  { name: 'Admission', value: 30 },
  { name: 'Renewal', value: 40 },
  { name: 'Readmission', value: 10 },
  { name: 'Per Day Basis', value: 15 },
  { name: 'Protein', value: 5 },
]

const expenseData = [
  { name: 'Maintenance', value: 5000 },
  { name: 'Cleaning Supplies', value: 2000 },
  { name: 'Salaries', value: 20000 },
  { name: 'Rent', value: 5000 },
  { name: 'Electricity', value: 3000 },
]

const gymMembershipRevenueData = [
  { month: 'Jan', revenue: 40000 },
  { month: 'Feb', revenue: 42000 },
  { month: 'Mar', revenue: 45000 },
  { month: 'Apr', revenue: 48000 },
  { month: 'May', revenue: 50000 },
  { month: 'Jun', revenue: 52000 },
]

const proteinBusinessRevenueData = [
  { month: 'Jan', revenue: 5000 },
  { month: 'Feb', revenue: 5500 },
  { month: 'Mar', revenue: 6000 },
  { month: 'Apr', revenue: 6500 },
  { month: 'May', revenue: 7000 },
  { month: 'Jun', revenue: 7500 },
]

const weeklyAttendanceData = [
  { week: 'Week 1', activeMembers: 450, totalAttendance: 1800 },
  { week: 'Week 2', activeMembers: 460, totalAttendance: 1850 },
  { week: 'Week 3', activeMembers: 470, totalAttendance: 1900 },
  { week: 'Week 4', activeMembers: 480, totalAttendance: 1950 },
]

const dailyAttendanceData = [
  { day: 'Mon', attendance: 280 },
  { day: 'Tue', attendance: 250 },
  { day: 'Wed', attendance: 300 },
  { day: 'Thu', attendance: 280 },
  { day: 'Fri', attendance: 320 },
  { day: 'Sat', attendance: 350 },
  { day: 'Sun', attendance: 200 },
]

const dayHourlyAttendanceData = [
  { hour: '5 AM', attendance: 50 },
  { hour: '6 AM', attendance: 80 },
  { hour: '7 AM', attendance: 120 },
  { hour: '8 AM', attendance: 150 },
  { hour: '9 AM', attendance: 130 },
  { hour: '10 AM', attendance: 100 },
  { hour: '11 AM', attendance: 80 },
]

const nightHourlyAttendanceData = [
  { hour: '3 PM', attendance: 100 },
  { hour: '4 PM', attendance: 120 },
  { hour: '5 PM', attendance: 150 },
  { hour: '6 PM', attendance: 180 },
  { hour: '7 PM', attendance: 200 },
  { hour: '8 PM', attendance: 170 },
  { hour: '9 PM', attendance: 130 },
  { hour: '10 PM', attendance: 90 },
  { hour: '11 PM', attendance: 60 },
]

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export default function ComprehensiveInsightsComponent() {
  return (
    (<div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-4xl font-bold mb-8 text-center">Gym Insights</h1>
      {/* Membership Insights */}
      <section className="mb-16">
        <h2 className="text-3xl font-semibold mb-6">Membership Insights</h2>
        
        <div className="border border-white rounded-lg p-6 mb-8">
          <h3 className="text-2xl font-semibold mb-4">Member Growth</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={memberGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="month" stroke="#fff" />
                <YAxis stroke="#fff" />
                <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                <Area
                  type="monotone"
                  dataKey="newMembers"
                  stackId="1"
                  stroke="#8884d8"
                  fill="#8884d8" />
                <Area
                  type="monotone"
                  dataKey="leavingMembers"
                  stackId="1"
                  stroke="#82ca9d"
                  fill="#82ca9d" />
                <Line type="monotone" dataKey="totalMembers" stroke="#ffc658" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Member Types</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={memberTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {memberTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Active Members per Month</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeMonthlyMembersData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="month" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Area type="monotone" dataKey="activeMembers" stroke="#8884d8" fill="#8884d8" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        <div className="border border-white rounded-lg p-6">
          <h3 className="text-2xl font-semibold mb-4">Age Group Distribution</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageGroupData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="month" stroke="#fff" />
                <YAxis stroke="#fff" />
                <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                <Bar dataKey=">20" stackId="a" fill="#8884d8" />
                <Bar dataKey="21-25" stackId="a" fill="#82ca9d" />
                <Bar dataKey="26-30" stackId="a" fill="#ffc658" />
                <Bar dataKey="31-40" stackId="a" fill="#ff7300" />
                <Bar dataKey="40+" stackId="a" fill="#a4de6c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      {/* Revenue Insights */}
      <section className="mb-16">
        <h2 className="text-3xl font-semibold mb-6">Revenue Insights</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Payment Modes</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentModeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {paymentModeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Revenue Sources</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueSourceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {revenueSourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Expenses</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {expenseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Gym Membership Revenue Trends</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gymMembershipRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="month" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#8884d8" fill="#8884d8" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Protein Business Revenue Trends</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={proteinBusinessRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="month" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#82ca9d" fill="#82ca9d" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        <div className="border border-white rounded-lg p-6">
          <h3 className="text-2xl font-semibold mb-4">Detailed Profitability</h3>
          <div className="space-y-6">
            <div>
              <h4 className="text-xl font-semibold mb-2">Total Monthly Revenue: ₹50,000</h4>
              <ul className="ml-6 space-y-2">
                <li>
                  <p className="font-semibold">Admission: ₹15,000</p>
                  <ul className="ml-4">
                    <li>Normal Billing: ₹10,000 (Online: ₹7,000, Cash: ₹3,000)</li>
                    <li>GST Billing: ₹5,000 (Online: ₹3,500, Cash: ₹1,500)</li>
                  </ul>
                </li>
                <li>
                  <p className="font-semibold">Renewal: ₹30,000</p>
                  <ul className="ml-4">
                    <li>Normal Billing: ₹20,000 (Online: ₹15,000, Cash: ₹5,000)</li>
                    <li>GST Billing: ₹10,000 (Online: ₹7,000, Cash: ₹3,000)</li>
                  </ul>
                </li>
                <li>
                  <p className="font-semibold">Readmission: ₹5,000</p>
                  <ul className="ml-4">
                    <li>Normal Billing: ₹3,000 (Online: ₹2,000, Cash: ₹1,000)</li>
                    <li>GST Billing: ₹2,000 (Online: ₹1,500, Cash: ₹500)</li>
                  </ul>
                </li>
                <li>
                  <p className="font-semibold">Protein Business: ₹7,500</p>
                  <ul className="ml-4">
                    <li>Online: ₹5,000</li>
                    <li>Cash: ₹2,500</li>
                  </ul>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-xl font-semibold mb-2">Total Monthly Expenses: ₹35,000</h4>
              <ul className="ml-6 space-y-2">
                <li>Maintenance: ₹5,000</li>
                <li>Cleaning Supplies: ₹2,000</li>
                <li>Salaries: ₹20,000</li>
                <li>Rent: ₹5,000</li>
                <li>Electricity Bill: ₹3,000</li>
              </ul>
            </div>
            <div>
              <h4 className="text-xl font-semibold mb-2 text-green-400">Monthly Profit: ₹22,500</h4>
            </div>
          </div>
        </div>
      </section>
      {/* Attendance Insights */}
      <section className="mb-16">
        <h2 className="text-3xl font-semibold mb-6">Attendance Insights</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Weekly Attendance</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAttendanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="week" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Bar dataKey="activeMembers" fill="#8884d8" name="Active Members" />
                  <Bar dataKey="totalAttendance" fill="#82ca9d" name="Total Attendance" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Daily Attendance</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyAttendanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="day" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Area type="monotone" dataKey="attendance" stroke="#8884d8" fill="#8884d8" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Day Hourly Attendance (5 AM - 11 AM)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dayHourlyAttendanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="hour" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Area type="monotone" dataKey="attendance" stroke="#8884d8" fill="#8884d8" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border border-white rounded-lg p-6">
            <h3 className="text-2xl font-semibold mb-4">Night Hourly Attendance (3 PM - 11 PM)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={nightHourlyAttendanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis dataKey="hour" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
                  <Area type="monotone" dataKey="attendance" stroke="#82ca9d" fill="#82ca9d" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>
    </div>)
  );
}