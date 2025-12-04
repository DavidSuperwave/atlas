'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface User {
    id: string;
    email: string;
    name: string | null;
    is_admin: boolean;
    is_disabled: boolean;
    is_approved: boolean;
    onboarding_completed: boolean;
    onboarding_completed_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
    disabled_at: string | null;
    credits_balance: number;
    created_at: string;
    status: 'pending' | 'approved' | 'disabled';
    has_apollo_account: boolean;
    requested_credits_plan: string | null;
}

export default function UsersPage() {
    const { user, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Invite form
    const [sendingInvite, setSendingInvite] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    
    // Filter
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'disabled'>('all');

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch users');
                }
                return;
            }
            const data = await res.json();
            setUsers(data.users || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
            fetchUsers();
        }
    }, [user, authLoading, fetchUsers]);

    async function handleSendInvite(e: React.FormEvent) {
        e.preventDefault();
        setActionMessage(null);
        setSendingInvite(true);

        try {
            const res = await fetch('/api/admin/invites/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail }),
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || 'Failed to send invite' });
                return;
            }

            if (data.emailSent === false) {
                setActionMessage({ type: 'error', text: `Invite created but email failed to send: ${data.emailError || 'Unknown error'}` });
            } else {
                setActionMessage({ type: 'success', text: `Onboarding invite sent to ${newEmail}` });
            }
            setNewEmail('');
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Failed to send invite' });
        } finally {
            setSendingInvite(false);
        }
    }

    async function handleApprove(userId: string) {
        setActionMessage(null);
        setActionLoading(userId);

        try {
            const res = await fetch(`/api/admin/users/${userId}/approve`, {
                method: 'POST',
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || 'Failed to approve user' });
                return;
            }

            if (data.emailSent === false) {
                setActionMessage({ type: 'success', text: `User approved but email failed to send: ${data.emailError || 'Unknown error'}` });
            } else {
                setActionMessage({ type: 'success', text: `User ${data.user.email} approved and notified` });
            }
            fetchUsers();
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Failed to approve user' });
        } finally {
            setActionLoading(null);
        }
    }

    async function handleDisable(userId: string) {
        setActionMessage(null);
        setActionLoading(userId);

        try {
            const res = await fetch(`/api/admin/users/${userId}/disable`, {
                method: 'POST',
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || 'Failed to disable user' });
                return;
            }

            setActionMessage({ type: 'success', text: `User ${data.user.email} disabled` });
            fetchUsers();
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Failed to disable user' });
        } finally {
            setActionLoading(null);
        }
    }

    async function handleEnable(userId: string) {
        setActionMessage(null);
        setActionLoading(userId);

        try {
            const res = await fetch(`/api/admin/users/${userId}/disable`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || 'Failed to enable user' });
                return;
            }

            setActionMessage({ type: 'success', text: `User ${data.user.email} enabled` });
            fetchUsers();
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Failed to enable user' });
        } finally {
            setActionLoading(null);
        }
    }

    function getStatusBadge(status: string) {
        switch (status) {
            case 'pending':
                return { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' };
            case 'approved':
                return { label: 'Approved', color: 'bg-green-100 text-green-700 border-green-200' };
            case 'disabled':
                return { label: 'Disabled', color: 'bg-red-100 text-red-700 border-red-200' };
            default:
                return { label: 'Unknown', color: 'bg-gray-100 text-gray-600 border-gray-200' };
        }
    }

    function formatDate(dateString: string | null) {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <Link href="/dashboard" className="text-blue-600 hover:text-blue-700">
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const filteredUsers = statusFilter === 'all' 
        ? users 
        : users.filter(u => u.status === statusFilter);

    const pendingCount = users.filter(u => u.status === 'pending').length;
    const approvedCount = users.filter(u => u.status === 'approved').length;
    const disabledCount = users.filter(u => u.status === 'disabled').length;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Link href="/admin" className="hover:text-gray-700">Admin</Link>
                            <span>/</span>
                            <span>Users</span>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
                        <p className="text-gray-600 mt-1">Manage users, approvals, and send invites</p>
                    </div>
                </div>

                {/* Action Message */}
                {actionMessage && (
                    <div className={`mb-6 p-4 rounded-lg ${
                        actionMessage.type === 'success' 
                            ? 'bg-green-50 border border-green-200 text-green-700' 
                            : 'bg-red-50 border border-red-200 text-red-700'
                    }`}>
                        {actionMessage.text}
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Users</p>
                                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                            </div>
                        </div>
                    </div>
                    <div 
                        className={`bg-white rounded-xl border border-gray-200 p-6 cursor-pointer transition-all ${statusFilter === 'pending' ? 'ring-2 ring-amber-500' : 'hover:border-amber-300'}`}
                        onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Pending Approval</p>
                                <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
                            </div>
                        </div>
                    </div>
                    <div 
                        className={`bg-white rounded-xl border border-gray-200 p-6 cursor-pointer transition-all ${statusFilter === 'approved' ? 'ring-2 ring-green-500' : 'hover:border-green-300'}`}
                        onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Approved</p>
                                <p className="text-2xl font-bold text-gray-900">{approvedCount}</p>
                            </div>
                        </div>
                    </div>
                    <div 
                        className={`bg-white rounded-xl border border-gray-200 p-6 cursor-pointer transition-all ${statusFilter === 'disabled' ? 'ring-2 ring-red-500' : 'hover:border-red-300'}`}
                        onClick={() => setStatusFilter(statusFilter === 'disabled' ? 'all' : 'disabled')}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Disabled</p>
                                <p className="text-2xl font-bold text-gray-900">{disabledCount}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Send Invite Form */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Send New Invite</h2>
                    <form onSubmit={handleSendInvite} className="flex gap-4">
                        <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="Enter email address"
                            required
                            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        />
                        <button
                            type="submit"
                            disabled={sendingInvite}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sendingInvite ? 'Sending...' : 'Send Invite'}
                        </button>
                    </form>
                </div>

                {/* Filter Pills */}
                <div className="flex gap-2 mb-4">
                    {['all', 'pending', 'approved', 'disabled'].map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setStatusFilter(filter as typeof statusFilter)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                statusFilter === filter
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {filter.charAt(0).toUpperCase() + filter.slice(1)}
                            {filter !== 'all' && (
                                <span className="ml-1 text-xs opacity-75">
                                    ({filter === 'pending' ? pendingCount : filter === 'approved' ? approvedCount : disabledCount})
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Users Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {statusFilter === 'all' ? 'All Users' : `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Users`}
                        </h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Onboarded</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredUsers.map((u) => {
                                    const statusBadge = getStatusBadge(u.status);
                                    const isCurrentUser = u.id === user?.id;
                                    return (
                                        <tr key={u.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                                                        {u.name ? u.name.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-gray-900">{u.name || 'No name'}</span>
                                                            {u.is_admin && (
                                                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Admin</span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-gray-500">{u.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadge.color}`}>
                                                    {statusBadge.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {u.credits_balance?.toLocaleString() || 0}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {formatDate(u.onboarding_completed_at)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {formatDate(u.approved_at)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-2">
                                                    {/* Approve button - only for pending users */}
                                                    {u.status === 'pending' && (
                                                        <button
                                                            onClick={() => handleApprove(u.id)}
                                                            disabled={actionLoading === u.id}
                                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {actionLoading === u.id ? 'Approving...' : 'Approve'}
                                                        </button>
                                                    )}
                                                    
                                                    {/* Disable/Enable button */}
                                                    {!isCurrentUser && u.status !== 'pending' && (
                                                        u.is_disabled ? (
                                                            <button
                                                                onClick={() => handleEnable(u.id)}
                                                                disabled={actionLoading === u.id}
                                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {actionLoading === u.id ? 'Enabling...' : 'Enable'}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleDisable(u.id)}
                                                                disabled={actionLoading === u.id}
                                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {actionLoading === u.id ? 'Disabling...' : 'Disable'}
                                                            </button>
                                                        )
                                                    )}
                                                    
                                                    {/* View profile link */}
                                                    <Link
                                                        href={`/admin/users/${u.id}`}
                                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                                                    >
                                                        View
                                                    </Link>
                                                    
                                                    {isCurrentUser && (
                                                        <span className="text-gray-400 text-xs">(You)</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {filteredUsers.length === 0 && (
                        <div className="p-12 text-center text-gray-500">
                            {statusFilter === 'all' ? 'No users found' : `No ${statusFilter} users`}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

