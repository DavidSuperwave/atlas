'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface User {
    id: string;
    email: string;
    credits_balance: number;
    is_admin: boolean;
    created_at: string;
}

export default function AdminCreditsPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Add credits form
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [amount, setAmount] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        checkAdminAndFetchUsers();
    }, []);

    async function checkAdminAndFetchUsers() {
        try {
            // Check if user is admin via balance endpoint
            const balanceRes = await fetch('/api/credits/balance');
            if (!balanceRes.ok) {
                setError('Please sign in');
                setLoading(false);
                return;
            }
            const balanceData = await balanceRes.json();
            
            if (!balanceData.is_admin) {
                setError('Access denied. Admin privileges required.');
                setLoading(false);
                return;
            }
            
            setIsAdmin(true);
            
            // Fetch all users
            const usersRes = await fetch('/api/admin/credits/add');
            if (usersRes.ok) {
                const data = await usersRes.json();
                setUsers(data.users);
            } else {
                setError('Failed to fetch users');
            }
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddCredits(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedUserId || !amount) return;
        
        setSubmitting(true);
        setSuccessMessage(null);
        setError(null);

        try {
            const res = await fetch('/api/admin/credits/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedUserId,
                    amount: parseInt(amount, 10),
                    description: description || undefined,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setSuccessMessage(data.message);
                setAmount('');
                setDescription('');
                // Refresh user list
                const usersRes = await fetch('/api/admin/credits/add');
                if (usersRes.ok) {
                    const usersData = await usersRes.json();
                    setUsers(usersData.users);
                }
            } else {
                setError(data.error || 'Failed to add credits');
            }
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
                    <p className="text-slate-400 mb-4">{error}</p>
                    <Link href="/" className="text-emerald-400 hover:text-emerald-300">
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
                            ← Back to Dashboard
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Admin: Credit Management</h1>
                        <p className="text-slate-400 mt-1">Manage user credits and view balances</p>
                    </div>
                    <div className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium">
                        Admin
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Add Credits Form */}
                    <div className="lg:col-span-1">
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 sticky top-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Add Credits</h2>
                            
                            <form onSubmit={handleAddCredits} className="space-y-4">
                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}
                                
                                {successMessage && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3 text-emerald-400 text-sm">
                                        {successMessage}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Select User
                                    </label>
                                    <select
                                        value={selectedUserId}
                                        onChange={(e) => setSelectedUserId(e.target.value)}
                                        required
                                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    >
                                        <option value="">Choose a user...</option>
                                        {users.map((user) => (
                                            <option key={user.id} value={user.id}>
                                                {user.email} ({user.credits_balance.toLocaleString()} credits)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Amount (credits)
                                    </label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        min="1"
                                        required
                                        placeholder="1000"
                                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    />
                                    {amount && (
                                        <p className="text-slate-400 text-sm mt-1">
                                            = ${(parseInt(amount, 10) / 1000).toFixed(2)}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Description (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="e.g., Monthly top-up"
                                        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting || !selectedUserId || !amount}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {submitting ? 'Adding...' : 'Add Credits'}
                                </button>
                            </form>

                            {/* Quick Add Buttons */}
                            <div className="mt-6 pt-6 border-t border-slate-700/50">
                                <p className="text-sm text-slate-400 mb-3">Quick amounts:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {[1000, 5000, 10000, 50000].map((amt) => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => setAmount(amt.toString())}
                                            className="py-2 px-3 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-lg text-sm transition-colors"
                                        >
                                            {amt.toLocaleString()} (${amt / 1000})
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Users List */}
                    <div className="lg:col-span-2">
                        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white">All Users</h2>
                                <span className="text-slate-400 text-sm">{users.length} users</span>
                            </div>

                            {users.length === 0 ? (
                                <div className="p-12 text-center">
                                    <p className="text-slate-400">No users found</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-700/50">
                                    {users.map((user) => (
                                        <div key={user.id} className="p-4 flex items-center gap-4 hover:bg-slate-700/20 transition-colors">
                                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                                                <span className="text-white font-medium">
                                                    {user.email.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-medium truncate">{user.email}</span>
                                                    {user.is_admin && (
                                                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                                                            Admin
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-slate-400 text-sm">
                                                    Joined {formatDate(user.created_at)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold text-white">
                                                    {user.credits_balance.toLocaleString()}
                                                </div>
                                                <div className="text-slate-400 text-sm">
                                                    credits
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setSelectedUserId(user.id);
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                className="px-3 py-1.5 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-lg text-sm transition-colors"
                                            >
                                                Add Credits
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


