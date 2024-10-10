
import React, { useState, useMemo } from 'react'
import {useReactTable,getCoreRowModel,getFilteredRowModel,getSortedRowModel,flexRender,createColumnHelper,} from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils'
import { ChevronDown, ChevronUp, Edit2, Save, X, Trash2, Search } from 'lucide-react';



export default function TableComponent({gymmemberdata, allColumns, onUpdateData , dataType}) {
  
  const [data, setData] = useState(gymmemberdata)
  const [globalFilter, setGlobalFilter] = useState('')
  const [visibleColumns, setVisibleColumns] = useState(allColumns)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
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
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        const url = dataType === 'member' 
          ? `http://127.0.0.1:5000/members`
          : `http://127.0.0.1:5000/proteins`; 
  
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'X-Database-Name': databaseName,
          },
        });
  
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
  
        const result = await response.json();
        setData(result);
      } catch (err) {
        alert(err.message);
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
        const jwtToken = localStorage.getItem('access_token');
        const databaseName = localStorage.getItem('databaseName');
        const url = dataType === 'member' 
          ? `http://127.0.0.1:5000/membersUpdate/${editedMember._id}` // Ensure editedMember.ID is defined
          : `http://127.0.0.1:5000/proteinsUpdate/${editedMember._id}`; 
  
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
            'X-Database-Name': databaseName,
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
      } catch (err) {
        alert(err.message);
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
      const jwtToken = localStorage.getItem('access_token')
      const databaseName = localStorage.getItem('databaseName')
      const url = dataType === 'member'
        ? `http://127.0.0.1:5000/membersDelete/${_id}`
        : `http://127.0.0.1:5000/proteinsDelete/${_id}`

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'X-Database-Name': databaseName,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete data')
      }

      const newData = data.filter(member => member._id !== _id)
      setData(newData)
      onUpdateData(newData)
    } catch (err) {
      alert(err.message)
    }
  }

  function clearAllFilters() {
    setGlobalFilter('')
    setData([...initialMembers])
  }

  return (
    (<div className="bg-gray-900 text-gray-100 p-6 rounded-lg">
      <div className="mb-4 flex items-center space-x-4">
        <div className="relative">
          <button
            onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
            className="bg-gray-800 text-white rounded px-3 py-2 flex items-center">
            Select Columns <ChevronDown className="ml-2" />
          </button>
          {isColumnSelectorOpen && (
            <div
              className="absolute left-0 mt-2 grid bg-gray-800 rounded-md shadow-lg z-10" style={{gridTemplateColumns:"1fr 1fr 1fr"}}>
              <label className="flex items-center px-4 py-2 hover:bg-gray-700">
                <input
                  type="checkbox"
                  checked={visibleColumns.length === allColumns.length}
                  onChange={() => {
                    if (visibleColumns.length === allColumns.length) {
                      setVisibleColumns([])
                    } else {
                      setVisibleColumns([...allColumns])
                    }
                  }}
                  className="mr-2" />
                Select All
              </label>
              {allColumns.map(column => (
                <label key={column} className="flex items-center px-4 py-2 hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(column)}
                    onChange={() => toggleColumnVisibility(column)}
                    className="mr-2" />
                  {column}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="Search..."
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 text-white rounded pl-10" />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>
        <button
          onClick={fetchDATA}
          className="bg-gray-800 text-white rounded px-3 py-2 hover:bg-gray-700 transition-colors">
          {showloading?"Loading":"Refresh"}
        </button>
        <button
          onClick={clearAllFilters}
          className="bg-gray-800 text-white rounded px-3 py-2 hover:bg-gray-700 transition-colors">
          Add
        </button>
        <button
          onClick={clearAllFilters}
          className="bg-gray-800 text-white rounded px-3 py-2 hover:bg-gray-700 transition-colors">
          Clear All Filters
        </button>
      </div>
      <div className="overflow-x-auto" style={{height:"60vh"}}>
        <table className="w-full">
          <thead className="bg-gray-800  top-0 z-10">
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
          <thead className="bg-gray-700  top-[60px] z-9">
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
                (<tr key={row.id} className="border-b border-gray-800">
                  {row.getVisibleCells().map(cell => {
                    return (
                      (<td key={cell.id} className="px-4 py-2">
                        {editingId === row.original._id ? (
                          <input
                            type="text"
                            name={cell.column.id}
                            value={editedMember ? editedMember[cell.column.id] : ''}
                            onChange={handleChange}
                            className="bg-gray-700 text-white rounded px-2 py-1 w-full" />
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