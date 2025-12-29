import React, { useState, useMemo, useContext } from 'react'
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender, createColumnHelper, } from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils'
import { ChevronDown, ChevronUp, Edit2, Save, X, Trash2, Search } from 'lucide-react';
import { useToast } from "@/context/ToastContext";
import { ThemeContext } from './webappmain';
import ImportMembersModal from './components/ImportMembersModal';

export default function TableComponent({ gymmemberdata, allColumns, onUpdateData, dataType, onNavigate }) {
  const { theme } = useContext(ThemeContext);
  const { showToast } = useToast();

  const [data, setData] = useState(gymmemberdata)
  const [globalFilter, setGlobalFilter] = useState('')
  const [visibleColumns, setVisibleColumns] = useState(allColumns)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [showloading, setshowloading] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editedMember, setEditedMember] = useState(null)

  const columnHelper = createColumnHelper()
  const columns = useMemo(() => allColumns.map(col =>
    columnHelper.accessor(col, {
      header: col,
      cell: info => info.getValue(),
    })
  ), [])

  async function fetchDATA() {
    setshowloading(true)
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      const url = dataType === 'member'
        ? `/api/members`
        : `/api/proteins`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
          'X-Database-Name': eztracker_jwt_databaseName_control_token,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      showToast(err.message, 'error');
    }
    setshowloading(false)
  }


  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      columnVisibility: Object.fromEntries(allColumns.map(col => [col, visibleColumns.includes(col)])),
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  function fuzzyFilter(row, columnId, value, addMeta) {
    const itemRank = rankItem(row.getValue(columnId), value)
    addMeta({
      itemRank,
    })
    return itemRank.passed
  }

  function toggleColumnVisibility(column) {
    setVisibleColumns(prev =>
      prev.includes(column)
        ? prev.filter(col => col !== column)
        : [...prev, column])
  }

  function handleEdit(member) {
    setEditingId(member._id)
    setEditedMember({ ...member })
  }

  async function handleSave() {
    if (editedMember) {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        const url = dataType === 'member'
          ? `/api/members/${editedMember._id}` // Ensure editedMember.ID is defined
          : `/api/proteins/${editedMember._id}`;

        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'X-Database-Name': eztracker_jwt_databaseName_control_token,
          },
          body: JSON.stringify(editedMember),
        });

        if (!response.ok) {
          throw new Error('Failed to update data');
        }

        const updatedData = await response.json();
        const updatedItems = data.map(item => item._id === updatedData._id ? updatedData : item);
        setData(updatedItems);
        onUpdateData(updatedItems);
        setEditingId(null);
        setEditedMember(null);
        showToast('Data updated successfully', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  }

  function handleCancel() {
    setEditingId(null)
    setEditedMember(null)
  }

  function handleChange(e) {
    if (editedMember) {
      setEditedMember({
        ...editedMember,
        [e.target.name]: e.target.value
      })
    }
  }

  async function handleDelete(_id) {
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token')
      const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token')
      const url = dataType === 'member'
        ? `/api/members/${_id}`
        : `/api/proteins/${_id}`

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'X-Database-Name': eztracker_jwt_databaseName_control_token,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete data')
      }

      const newData = data.filter(member => member._id !== _id)
      setData(newData)
      onUpdateData(newData)
      showToast(`${dataType} deleted successfully`, 'success');
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  function clearAllFilters() {
    setGlobalFilter('')
    setData([...initialMembers])
  }

  return (
    (<div className={`p-6 rounded-lg ${theme === 'dark' ? 'primary-bg primary-text' : 'secondary-bg secondary-text'}`}>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-opacity-50 backdrop-blur-md p-4 rounded-xl border border-gray-700/30 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Columns Selector */}
          <div className="relative">
            <button
              onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border ${theme === 'dark'
                ? 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-gray-200'
                : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                } focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}>
              <span>Columns</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${isColumnSelectorOpen ? 'rotate-180' : ''}`} />
            </button>
            {isColumnSelectorOpen && (
              <div className={`absolute left-0 mt-2 p-3 min-w-[280px] grid grid-cols-2 gap-2 rounded-xl shadow-2xl z-50 border ${theme === 'dark'
                ? 'bg-neutral-900 border-neutral-800'
                : 'bg-white border-gray-100'
                }`}>
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-opacity-10 hover:bg-gray-500 cursor-pointer col-span-2 border-b border-gray-700/20 pb-2 mb-1">
                  <input
                    type="checkbox"
                    checked={visibleColumns.length === allColumns.length}
                    onChange={() => setVisibleColumns(visibleColumns.length === allColumns.length ? [] : [...allColumns])}
                    className="rounded border-gray-500 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                  <span className="text-sm font-medium">Select All</span>
                </label>
                {allColumns.map(column => (
                  <label key={column} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-opacity-10 hover:bg-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column)}
                      onChange={() => toggleColumnVisibility(column)}
                      className="rounded border-gray-500 text-blue-600 focus:ring-blue-500 w-4 h-4" />
                    <span className="text-sm truncate" title={column}>{column}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative flex-grow min-w-[200px] max-w-sm group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} group-focus-within:text-blue-500 transition-colors`} />
            </div>
            <input
              type="text"
              placeholder="Search members..."
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className={`block w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${theme === 'dark'
                ? 'bg-neutral-900 border-neutral-800 text-white placeholder-gray-500'
                : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                }`} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={fetchDATA}
            disabled={showloading}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border ${theme === 'dark'
              ? 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-gray-200'
              : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}>
            <span className={showloading ? 'animate-spin' : ''}>
              {showloading ? '⟳' : '↻'}
            </span>
            <span>{showloading ? 'Loading...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border ${theme === 'dark'
              ? 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:bg-emerald-600/20'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}>
            Import
          </button>

          <button
            onClick={clearAllFilters}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border ${theme === 'dark'
              ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-gray-300'
              : 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-700'
              }`}>
            Clear Filters
          </button>

          <button
            onClick={() => onNavigate && onNavigate("Billing")}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 transition-all active:scale-95">
            + Add
          </button>
        </div>
      </div>

      <ImportMembersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={fetchDATA}
        theme={theme}
        dataType={dataType}
      />
      <div className="overflow-x-auto" style={{ height: "85vh" }}>
        <table className="w-full">
          <thead className={`${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'} sticky top-0 z-10`}>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-gray-700">
                {headerGroup.headers.map(header => {
                  return (
                    (<th key={header.id} className="px-4 py-2 text-left">
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center">
                          <button
                            className="font-bold flex cursor-pointer"
                            onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ChevronUp className="inline ml-1" />,
                              desc: <ChevronDown className="inline ml-1" />,
                            }[header.column.getIsSorted()] ?? null}
                          </button>
                        </div>
                      )}
                    </th>)
                  );
                })}
                <th className="px-4 py-2">Actions</th>
              </tr>
            ))}
          </thead>
          {dataType !== "member" && (
            <thead className="bg-gray-700 sticky top-[60px] z-9">
              <tr>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2">
                  {table
                    .getRowModel()
                    .rows.reduce((sum, row) => sum + parseInt(row.original.Quantity || 0), 0)}
                </th>
                <th className="px-4 py-2">
                  {table
                    .getRowModel()
                    .rows.reduce((sum, row) => sum + parseInt(row.original["MRP Price(1 pcs)"] || 0), 0)}
                </th>
                <th className="px-4 py-2">
                  {table
                    .getRowModel()
                    .rows.reduce((sum, row) => sum + parseInt(row.original["Landing price(1 pcs)"] || 0), 0)}
                </th>
                <th className="px-4 py-2">
                  {table
                    .getRowModel()
                    .rows.reduce((sum, row) => sum + parseInt(row.original["Total price"] || 0), 0)}
                </th>
                <th className="px-4 py-2"></th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
          )}
          <tbody>
            {table.getRowModel().rows.map(row => {
              return (
                (<tr key={row.id} className={`border-b ${theme === 'dark' ? 'primary-border' : 'secondary-border'}`}>
                  {row.getVisibleCells().map(cell => {
                    return (
                      (<td key={cell.id} className="px-4 py-2">
                        {editingId === row.original._id ? (
                          <input
                            type="text"
                            name={cell.column.id}
                            value={editedMember?.[cell.column.id] ?? ''}
                            onChange={handleChange}
                            className={`${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'} rounded px-2 py-1 w-full`} />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>)
                    );
                  })}
                  <td className="px-4 py-2">
                    {editingId === row.original._id ? (
                      <div className="flex space-x-2">
                        <button onClick={handleSave} className="text-green-400 hover:text-green-300">
                          <Save size={18} />
                        </button>
                        <button onClick={handleCancel} className="text-red-400 hover:text-red-300">
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(row.original)}
                          className="text-blue-400 hover:text-blue-300">
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(row.original._id)}
                          className="text-red-400 hover:text-red-300">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>)
              );
            })}
          </tbody>
        </table>
      </div>
    </div>)
  );
}