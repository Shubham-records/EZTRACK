import { useState, useEffect, useMemo } from "react"
import { format, parseISO, parse } from "date-fns"
import NOIMG from "@/assets/noPhoto.jpg"
import {ChevronDown, ChevronUp } from "lucide-react"
import MK from "@/assets/mk.json"

export default function InvoiceManagerComponent() {
  const initialInvoices = useMemo(()=>(MK),[])

  const invoiceTypes = ["All Bills Types", "admission", "renewal", "protein", "readmission", "perdaybasis"]
  const paymentStatuses = ["All Bills Status", "paid", "pending", "returned"]

  const [invoices, setInvoices] = useState(initialInvoices)
  const [expandedInvoices, setExpandedInvoices] = useState([])
  const [selectedType, setSelectedType] = useState("All Bills Types")
  const [selectedStatus, setSelectedStatus] = useState("All Bills Status")
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDay, setSelectedDay] = useState("")

  const toggleInvoice = (id) => {
    setExpandedInvoices((prev) =>
      prev.includes(id) ? prev.filter((invoiceId) => invoiceId !== id) : [...prev, id])
  }

  useEffect(() => {
    const sortedInvoices = [...initialInvoices].sort((a, b) => {
      const dateA = parse(a.billDate, 'yyyy-MM-dd', new Date())
      const dateB = parse(b.billDate, 'yyyy-MM-dd', new Date())
      return dateB.getTime() - dateA.getTime()
    })
    setInvoices(sortedInvoices)
  }, [])

  const filteredInvoices = invoices.filter((invoice) => {
    const typeMatch = selectedType === "All Bills Types" || invoice.type === selectedType
    const statusMatch = selectedStatus === "All Bills Status" || invoice.status === selectedStatus
    const [year, month, day] = invoice.billDate.split('-')
    const yearMatch = !selectedYear || year === selectedYear
    const monthMatch = !selectedMonth || month === selectedMonth
    const dayMatch = !selectedDay || day === selectedDay
    return typeMatch && statusMatch && yearMatch && monthMatch && dayMatch
  })

  const groupInvoicesByDate = (invoices) => {
    return invoices.reduce((acc, invoice) => {
      const date = invoice.billDate
      const existingGroup = acc.find(group => group.date === date)
      if (existingGroup) {
        existingGroup.invoices.push(invoice)
      } else {
        acc.push({ date, invoices: [invoice] })
      }
      return acc
    }, [])
  }

  const groupedInvoices = groupInvoicesByDate(filteredInvoices)

  const getUniqueValues = (key) => {
    return [...new Set(invoices.map(invoice => invoice.billDate.split('-')[key]))].sort()
  }

  const years = getUniqueValues(0)
  const months = getUniqueValues(1)
  const days = getUniqueValues(2)

  const clearDateFilters = () => {
    setSelectedYear("")
    setSelectedMonth("")
    setSelectedDay("")
  }

  return (
    <div className="min-h-screen bg-black text-white p-6" style={{padding: "5vh 15vw"}}>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <div className="flex gap-4">
          <select
            className="w-[180px] bg-gray-800 text-white capitalize p-2 rounded"
            onChange={(e) => setSelectedType(e.target.value)}  
            value={selectedType}
          >
            {invoiceTypes.map((type) => (
              <option key={type} value={type} className="capitalize">
                {type}
              </option>
            ))}
          </select>

          <select
            className="w-[180px] bg-gray-800 text-white capitalize p-2 rounded"
            onChange={(e) => setSelectedStatus(e.target.value)}  
            value={selectedStatus}
          >
            {paymentStatuses.map((status) => (
              <option key={status} value={status} className="capitalize">
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-4 mb-6">
        <select
          className="w-[120px] bg-gray-800 text-white p-2 rounded"
          onChange={(e) => setSelectedYear(e.target.value)}
          value={selectedYear}
        >
          <option value="">All Years</option>
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          className="w-[120px] bg-gray-800 text-white p-2 rounded"
          onChange={(e) => setSelectedMonth(e.target.value)}
          value={selectedMonth}
        >
          <option value="">All Months</option>
          {months.map((month) => (
            <option key={month} value={month}>{format(parse(month, 'MM', new Date()), 'MMMM')}</option>
          ))}
        </select>
        <select
          className="w-[120px] bg-gray-800 text-white p-2 rounded"
          onChange={(e) => setSelectedDay(e.target.value)}
          value={selectedDay}
        >
          <option value="">All Days</option>
          {days.map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
        <button
          className="bg-gray-800 text-white p-2 rounded"
          onClick={clearDateFilters}
        >
          Clear Filters
        </button>
      </div>
      <div className="space-y-6">
        {groupedInvoices.map(({ date, invoices: dayInvoices }) => (
          <div key={date} className="rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">
              {format(parseISO(date), "d MMMM yyyy (EEEE)")}
            </h2>
            <div className="space-y-4 p-6">
              {dayInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="border border-gray-700 rounded-lg overflow-hidden hover:bg-gray-900 transition-colors duration-200">
                  <div
                    className="flex items-center p-4 cursor-pointer"
                    onClick={() => toggleInvoice(invoice.id)}>
                    <img
                      src={invoice.image ? invoice.image : NOIMG}
                      alt={invoice.name}
                      className="w-20 h-20 object-cover rounded-md mr-4" />
                    <div className="flex-grow">
                      <h3 className="font-semibold">{invoice.name}</h3>
                      <p className="text-sm text-gray-400">
                        {invoice.type.charAt(0).toUpperCase() + invoice.type.slice(1)}
                      </p>
                      <p className="text-sm text-gray-400">
                        Bill Number: {invoice.number}
                      </p>
                      <p
                        className={`text-sm capitalize ${
                          invoice.status === 'paid' ? 'text-green-400' :
                          invoice.status === 'pending' ? 'text-yellow-400' :
                          invoice.status === 'returned' ? 'text-red-400' :
                          'text-orange-400'
                        }`}>
                        Status: {invoice.status}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${invoice.amount}</p>
                      <p className="text-sm text-gray-400">{invoice.billDate}</p>
                    </div>
                    {expandedInvoices.includes(invoice.id) ? (
                      <ChevronUp className="ml-2" />
                    ) : (
                      <ChevronDown className="ml-2" />
                    )}
                  </div>
                  {expandedInvoices.includes(invoice.id) && (
                    <div className="p-4 bg-gray-800 border-t border-gray-700">
                      <p>Client Card No: {invoice.clientCardNo}</p>
                      {invoice.nextDueDate && (
                        <p>Next Due Date: {invoice.nextDueDate}</p>
                      )}
                      {invoice.planPeriod && <p>Plan Period: {invoice.planPeriod}</p>}
                      {invoice.planType && <p>Plan Type: {invoice.planType}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}