import React, { useState, useMemo, useContext } from 'react'
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender, createColumnHelper, } from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils'
import { ChevronDown, ChevronUp, Edit2, Save, X, Trash2, Search, CheckSquare, Square, MinusSquare, Plus, Filter, RefreshCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

import ImportMembersModal from './components/ImportMembersModal';
import AddMemberModal from './components/AddMemberModal';
import AddProteinModal from './components/AddProteinModal';

function IndeterminateCheckbox({
  indeterminate,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (typeof indeterminate === 'boolean') {
      ref.current.indeterminate = !rest.checked && indeterminate
    }
  }, [ref, indeterminate, rest.checked])

  return (
    <input
      type="checkbox"
      ref={ref}
      className={className + ' rounded border-zinc-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer'}
      {...rest}
    />
  )
}

export default function TableComponent({ gymmemberdata, allColumns, onUpdateData, dataType, onNavigate, initialFilter = '' }) {
  const { showToast } = useToast();

  const [data, setData] = useState(gymmemberdata)
  const [globalFilter, setGlobalFilter] = useState(initialFilter)
  const [rowSelection, setRowSelection] = useState({})
  const [visibleColumns, setVisibleColumns] = useState(allColumns)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [showloading, setshowloading] = useState(false)
  const [columnFilters, setColumnFilters] = useState([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [isAddProteinModalOpen, setIsAddProteinModalOpen] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editedMember, setEditedMember] = useState(null)

  const columnHelper = createColumnHelper()
  const columns = useMemo(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="px-1">
          <IndeterminateCheckbox
            {...{
              checked: table.getIsAllRowsSelected(),
              indeterminate: table.getIsSomeRowsSelected(),
              onChange: table.getToggleAllRowsSelectedHandler(),
            }}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1">
          <IndeterminateCheckbox
            {...{
              checked: row.getIsSelected(),
              disabled: !row.getCanSelect(),
              indeterminate: row.getCanSelect() && row.getIsSelected() ? false : undefined, // Row checkbox usually isn't indeterminate
              onChange: row.getToggleSelectedHandler(),
            }}
          />
        </div>
      ),
    },
    ...allColumns.map(col =>
      columnHelper.accessor(col, {
        header: col,
        cell: info => info.getValue(),
      })
    )], [])

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
      rowSelection,
      columnVisibility: Object.fromEntries(allColumns.map(col => [col, visibleColumns.includes(col)])),
      columnFilters,
    },
    initialState: {
      pagination: {
        pageSize: 30,
      },
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getPaginationRowModel: getPaginationRowModel(),
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

  function handleAddNew() {
    if (dataType === 'member') {
      setIsAddMemberModalOpen(true);
    } else if (dataType === 'protein') {
      setIsAddProteinModalOpen(true);
    }
  }

  async function handleSave() {
    if (editedMember) {
      try {
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        const isNew = editedMember._id.toString().startsWith('TEMP_');
        const url = isNew
          ? (dataType === 'member' ? '/api/members' : '/api/proteins')
          : (dataType === 'member' ? `/api/members/${editedMember._id}` : `/api/proteins/${editedMember._id}`);

        const method = isNew ? 'POST' : 'PUT';

        // Remove temp _id if creating new
        const bodyData = { ...editedMember };
        if (isNew) delete bodyData._id;

        const response = await fetch(url, {
          method: method,
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'X-Database-Name': eztracker_jwt_databaseName_control_token,
          },
          body: JSON.stringify(bodyData),
        });

        if (!response.ok) {
          throw new Error('Failed to update data');
        }

        const resultData = await response.json();
        // If it was new, we need to replace the temp row with the real one from server
        const updatedItems = data.map(item => item._id === editedMember._id ?
          (isNew ? (Array.isArray(resultData) ? resultData[0] : resultData) : resultData)
          : item);

        // If the API returns the created object differently (e.g. inside an array or wrapper), adjust above.
        // Assuming standard return of the object.

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
    if (editingId && editingId.toString().startsWith('TEMP_')) {
      // If cancelling a new row creation, remove it
      setData(data.filter(item => item._id !== editingId));
    }
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

  async function handleBulkDelete() {
    const selectedIds = Object.keys(rowSelection).map(index => data[parseInt(index)]?._id).filter(id => id);

    if (selectedIds.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} items? This action cannot be undone.`)) {
      return;
    }

    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
      const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token');
      const url = dataType === 'member'
        ? `/api/members/bulk-delete`
        : `/api/proteins/bulk-delete`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
          'X-Database-Name': eztracker_jwt_databaseName_control_token,
        },
        body: JSON.stringify({ ids: selectedIds })
      });

      if (!response.ok) throw new Error("Failed to delete items");

      const result = await response.json();
      showToast(`Successfully deleted ${result.count} items`, 'success');

      // Refresh data or remove locally
      const remainingData = data.filter(item => !selectedIds.includes(item._id));
      setData(remainingData);
      onUpdateData(remainingData);
      setRowSelection({});

    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(_id) {
    // ... existing implementation ...
    try {
      const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token')
      const eztracker_jwt_databaseName_control_token = localStorage.getItem('eztracker_jwt_databaseName_control_token')
      const url = dataType === 'member'
        ? `/api/members/${_id}`
        : `/api/proteins/${_id}`

      // ... rest of delete logic

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
    setData([...gymmemberdata])
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

          {Object.keys(rowSelection).length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40">
              <Trash2 size={16} />
              <span>Delete ({Object.keys(rowSelection).length})</span>
            </button>
          )}

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
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 border ${isFilterOpen ? 'bg-primary/10 border-primary text-primary' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'}`}>
            <Filter size={16} />
            <span>Filters</span>
          </button>

          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-primary hover:bg-teal-700 shadow-md shadow-primary/20 transition-all active:scale-95">
            <Plus size={18} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters Section */}
      {isFilterOpen && (
        <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 transition-all">
          {allColumns.map(col => (
            visibleColumns.includes(col) && (
              <div key={col} className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{col}</label>
                <input
                  type="text"
                  placeholder={`Filter ${col}...`}
                  value={(columnFilters.find(f => f.id === col)?.value || '')}
                  onChange={e => {
                    const val = e.target.value;
                    setColumnFilters(old => {
                      const newFilters = old.filter(f => f.id !== col);
                      if (val) newFilters.push({ id: col, value: val });
                      return newFilters;
                    });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            )
          ))}
          <div className="col-span-full flex justify-end mt-2">
            <button
              onClick={() => setColumnFilters([])}
              className="text-sm text-zinc-500 hover:text-rose-500 transition-colors flex items-center gap-1">
              <RefreshCcw size={14} /> Reset Filters
            </button>
          </div>
        </div>
      )}

      <ImportMembersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={fetchDATA}
        dataType={dataType}
      />

      <AddMemberModal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        onSuccess={fetchDATA}
      />
      <AddProteinModal
        isOpen={isAddProteinModalOpen}
        onClose={() => setIsAddProteinModalOpen(false)}
        onSuccess={fetchDATA}
      />

      <div className="overflow-x-auto stitch-scrollbar" style={{ height: "75vh" }}>
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

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="relative inline-flex items-center px-4 py-2 border border-zinc-300 text-sm font-medium rounded-md text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-zinc-300 text-sm font-medium rounded-md text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Showing <span className="font-medium">{table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}</span> to <span className="font-medium">{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}</span> of{' '}
              <span className="font-medium">{table.getFilteredRowModel().rows.length}</span> results
            </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-zinc-300 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
              >
                <span className="sr-only">First</span>
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="relative inline-flex items-center px-2 py-2 border border-zinc-300 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
              >
                <span className="sr-only">Previous</span>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="relative inline-flex items-center px-4 py-2 border border-zinc-300 bg-white text-sm font-medium text-zinc-700">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="relative inline-flex items-center px-2 py-2 border border-zinc-300 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
              >
                <span className="sr-only">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-zinc-300 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
              >
                <span className="sr-only">Last</span>
                <ChevronsRight className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
