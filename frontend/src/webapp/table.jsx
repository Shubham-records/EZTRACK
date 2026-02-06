import React, { useState, useMemo, useContext } from 'react'
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender, createColumnHelper, } from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils'
import { ChevronDown, ChevronUp, Edit2, Save, X, Trash2, Search } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

import ImportMembersModal from './components/ImportMembersModal';

export default function TableComponent({ gymmemberdata, allColumns, onUpdateData, dataType, onNavigate }) {
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
    <div className="p-6 rounded-lg bg-surface-light dark:bg-surface-dark w-full shadow-soft border border-zinc-200 dark:border-zinc-800">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-50 dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Columns Selector */}
          <div className="relative">
            <button
              onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 focus:ring-2 focus:ring-offset-2 focus:ring-primary">
              <span>Columns</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${isColumnSelectorOpen ? 'rotate-180' : ''}`} />
            </button>
            {isColumnSelectorOpen && (
              <div className="absolute left-0 mt-2 p-3 min-w-[280px] grid grid-cols-2 gap-2 rounded-xl shadow-2xl z-50 border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer col-span-2 border-b border-zinc-100 dark:border-zinc-800 pb-2 mb-1">
                  <input
                    type="checkbox"
                    checked={visibleColumns.length === allColumns.length}
                    onChange={() => setVisibleColumns(visibleColumns.length === allColumns.length ? [] : [...allColumns])}
                    className="rounded border-zinc-300 text-primary focus:ring-primary w-4 h-4" />
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Select All</span>
                </label>
                {allColumns.map(column => (
                  <label key={column} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column)}
                      onChange={() => toggleColumnVisibility(column)}
                      className="rounded border-zinc-300 text-primary focus:ring-primary w-4 h-4" />
                    <span className="text-sm truncate text-zinc-700 dark:text-zinc-300" title={column}>{column}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative flex-grow min-w-[200px] max-w-sm group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Search members..."
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              className="block w-full pl-10 pr-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-400" />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={fetchDATA}
            disabled={showloading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
            <span className={showloading ? 'animate-spin' : ''}>
              {showloading ? '⟳' : '↻'}
            </span>
            <span>{showloading ? 'Loading...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-primary hover:bg-teal-100 dark:hover:bg-teal-900/40">
            Import
          </button>

          <button
            onClick={clearAllFilters}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
            Clear Filters
          </button>

          <button
            onClick={() => onNavigate && onNavigate("Billing")}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary hover:bg-teal-700 shadow-md shadow-primary/20 transition-all active:scale-95">
            + Add
          </button>
        </div>
      </div>

      <ImportMembersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={fetchDATA}
        dataType={dataType}
      />
      <div className="overflow-x-auto stitch-scrollbar" style={{ height: "85vh" }}>
        <table className="w-full border-collapse">
          <thead className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-zinc-200 dark:border-zinc-800">
                {headerGroup.headers.map(header => {
                  return (
                    <th key={header.id} className="px-4 py-3 text-left">
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center">
                          <button
                            className="font-bold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex cursor-pointer hover:text-primary transition-colors"
                            onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ChevronUp className="inline ml-1 w-4 h-4" />,
                              desc: <ChevronDown className="inline ml-1 w-4 h-4" />,
                            }[header.column.getIsSorted()] ?? null}
                          </button>
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-left font-bold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Actions</th>
              </tr>
            ))}
          </thead>
          {dataType !== "member" && (
            <thead className="bg-zinc-100 dark:bg-zinc-800 sticky top-[45px] z-9 font-semibold text-zinc-700 dark:text-zinc-300">
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
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {table.getRowModel().rows.map(row => {
              return (
                <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  {row.getVisibleCells().map(cell => {
                    return (
                      <td key={cell.id} className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {editingId === row.original._id ? (
                          <input
                            type="text"
                            name={cell.column.id}
                            value={editedMember?.[cell.column.id] ?? ''}
                            onChange={handleChange}
                            className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 w-full focus:ring-1 focus:ring-primary outline-none" />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    {editingId === row.original._id ? (
                      <div className="flex space-x-2">
                        <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700 p-1 hover:bg-emerald-50 rounded transition-colors">
                          <Save size={16} />
                        </button>
                        <button onClick={handleCancel} className="text-rose-500 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition-colors">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(row.original)}
                          className="text-zinc-400 hover:text-primary p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(row.original._id)}
                          className="text-zinc-400 hover:text-rose-500 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}