import React, { useState, useEffect } from 'react';
import { useToast } from "@/context/ToastContext";
import { User, Shield, Trash2, Plus, Loader2 } from 'lucide-react';

export default function StaffComponent() {
    const { showToast } = useToast();
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newStaff, setNewStaff] = useState({ username: '', password: '', role: 'STAFF' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

            const response = await fetch('/api/staff', {
                headers: {
                    Authorization: `Bearer ${jwtToken}`,
                    'X-Database-Name': dbName
                }
            });
            if (response.ok) {
                const data = await response.json();
                setStaff(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddStaff = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

            const response = await fetch('/api/staff', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${jwtToken}`,
                    'X-Database-Name': dbName
                },
                body: JSON.stringify(newStaff)
            });

            if (response.ok) {
                fetchStaff();
                setShowAddModal(false);
                setNewStaff({ username: '', password: '', role: 'STAFF' });
                showToast("Staff added successfully", 'success');
            } else {
                showToast("Failed to add staff", 'error');
            }
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-8 secondary-bg secondary-text">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <UsersIcon className="text-orange-500" /> Staff Management
                </h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors">
                    <Plus size={20} /> Add Staff
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
            ) : (
                <div className="rounded-lg overflow-hidden border border-gray-200">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="p-4">Username</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Permissions</th>
                                <th className="p-4">Created At</th>
                                {/* <th className="p-4">Actions</th> */}
                            </tr>
                        </thead>
                        <tbody>
                            {staff.map((user) => (
                                <tr key={user.id} className="border-t border-gray-200">
                                    <td className="p-4 font-medium flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center">
                                            <User size={16} />
                                        </div>
                                        {user.username}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'OWNER' ? 'bg-purple-500/20 text-purple-500' :
                                            user.role === 'MANAGER' ? 'bg-blue-500/20 text-blue-500' :
                                                'bg-gray-500/20 text-gray-500'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm opacity-70">
                                        {user.permissions.length > 0 ? user.permissions.join(', ') : 'None'}
                                    </td>
                                    <td className="p-4 text-sm opacity-70">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>
                                    {/* <td className="p-4">
                    <button className="text-red-500 hover:bg-red-500/10 p-2 rounded"><Trash2 size={18} /></button>
                  </td> */}
                                </tr>
                            ))}
                            {staff.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center opacity-50">No staff members found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <form onSubmit={handleAddStaff} className="w-full max-w-md p-6 rounded-xl shadow-2xl relative bg-white">
                        <h2 className="text-xl font-bold mb-4">Add New Staff</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1 opacity-80">Username</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full p-2 rounded border border-gray-300"
                                    value={newStaff.username}
                                    onChange={e => setNewStaff({ ...newStaff, username: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 opacity-80">Password</label>
                                <input
                                    required
                                    type="password"
                                    className="w-full p-2 rounded border border-gray-300"
                                    value={newStaff.password}
                                    onChange={e => setNewStaff({ ...newStaff, password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 opacity-80">Role</label>
                                <select
                                    className="w-full p-2 rounded border border-gray-300"
                                    value={newStaff.role}
                                    onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}
                                >
                                    <option value="STAFF">Staff</option>
                                    <option value="MANAGER">Manager</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end mt-6">
                            <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded hover:bg-gray-500/10">Cancel</button>
                            <button disabled={isSubmitting} type="submit" className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                                {isSubmitting ? 'Saving...' : 'Create Staff'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

function UsersIcon({ className }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    )
}
