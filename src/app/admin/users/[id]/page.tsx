'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

interface UserProfile {
    id: string;
    email: string;
    credits_balance: number;
    is_admin: boolean;
    created_at: string;
    updated_at: string;
}

interface Transaction {
    id: string;
    amount: number;
    type: 'topup' | 'usage' | 'refund';
    description: string | null;
    created_at: string;
}

interface GoLoginProfile {
    id: string;
    profile_id: string;
    name: string;
    is_active: boolean;
}

interface ProfileAssignment {
    profileDbId: string;
    profileGoLoginId: string;
    profileName: string;
    assignedAt: string;
    source: string;
}

export default function AdminUserDetailsPage() {
    const params = useParams();
    const userId = params.id as string;
    const { user: currentUser, loading: authLoading } = useAuth();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Add credits form
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // GoLogin profile assignment
    const [goLoginProfiles, setGoLoginProfiles] = useState<GoLoginProfile[]>([]);
    const [currentAssignment, setCurrentAssignment] = useState<ProfileAssignment | null>(null);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [assigningProfile, setAssigningProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && currentUser && userId) {
            fetchUserData();
            fetchGoLoginData();
        }
    }, [currentUser, authLoading, userId]);

    async function fetchUserData() {
        try {
            // Fetch all users to find this specific user
            const res = await fetch('/api/admin/credits/add');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch user data');
                }
                setLoading(false);
                return;
            }
            
            const data = await res.json();
            const foundUser = data.users.find((u: UserProfile) => u.id === userId);
            
            if (foundUser) {
                setProfile(foundUser);
            } else {
                setError('User not found');
            }
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchGoLoginData() {
        try {
            // Fetch available profiles
            const profilesRes = await fetch('/api/admin/gologin-profiles');
            if (profilesRes.ok) {
                const data = await profilesRes.json();
                setGoLoginProfiles(data.profiles?.filter((p: GoLoginProfile) => p.is_active) || []);
            }

            // Fetch user's current assignment
            const assignRes = await fetch(`/api/admin/gologin-profiles/assign?userId=${userId}`);
            if (assignRes.ok) {
                const data = await assignRes.json();
                if (data.hasAssignment && data.assignment) {
                    setCurrentAssignment(data.assignment);
                    setSelectedProfileId(data.assignment.profileDbId);
                } else {
                    setCurrentAssignment(null);
                    setSelectedProfileId('');
                }
            }
        } catch (err) {
            console.error('Error fetching GoLogin data:', err);
        }
    }

    async function handleAssignProfile() {
        if (!selectedProfileId) return;

        setAssigningProfile(true);
        setProfileError(null);
        setProfileSuccess(null);

        try {
            const res = await fetch('/api/admin/gologin-profiles/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    profileDbId: selectedProfileId,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setProfileSuccess(data.message || 'Profile assigned successfully');
                fetchGoLoginData();
            } else {
                setProfileError(data.error || 'Failed to assign profile');
            }
        } catch (err) {
            setProfileError('An error occurred');
            console.error(err);
        } finally {
            setAssigningProfile(false);
        }
    }

    async function handleUnassignProfile() {
        if (!confirm('Are you sure you want to unassign this profile?')) return;

        setAssigningProfile(true);
        setProfileError(null);
        setProfileSuccess(null);

        try {
            const res = await fetch('/api/admin/gologin-profiles/assign', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            const data = await res.json();
            if (res.ok) {
                setProfileSuccess('Profile unassigned successfully');
                setCurrentAssignment(null);
                setSelectedProfileId('');
                fetchGoLoginData();
            } else {
                setProfileError(data.error || 'Failed to unassign profile');
            }
        } catch (err) {
            setProfileError('An error occurred');
            console.error(err);
        } finally {
            setAssigningProfile(false);
        }
    }

    async function handleAddCredits(e: React.FormEvent) {
        e.preventDefault();
        if (!amount) return;
        
        setSubmitting(true);
        setSuccessMessage(null);
        setError(null);

        try {
            const res = await fetch('/api/admin/credits/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    amount: parseInt(amount, 10),
                    description: description || undefined,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setSuccessMessage(`Added ${amount} credits successfully`);
                setAmount('');
                setDescription('');
                // Refresh user data
                fetchUserData();
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

    if (error && !profile) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <Link href="/admin" className="text-blue-600 hover:text-blue-700">
                        Back to Admin Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/admin" className="text-gray-500 hover:text-gray-700 text-sm mb-4 inline-flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Admin Dashboard
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 mt-2">User Details</h1>
                </div>

                {/* User Profile Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <span className="text-white font-bold text-2xl">
                                {profile.email.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-semibold text-gray-900">{profile.email}</h2>
                                {profile.is_admin && (
                                    <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                                        Admin
                                    </span>
                                )}
                            </div>
                            <p className="text-gray-500 text-sm mt-1 font-mono">{profile.id}</p>
                            <p className="text-gray-400 text-sm mt-2">
                                Joined {formatDate(profile.created_at)}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-500">Credit Balance</p>
                            <p className="text-3xl font-bold text-gray-900">{profile.credits_balance.toLocaleString()}</p>
                            <p className="text-sm text-gray-400">≈ ${(profile.credits_balance / 1000).toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-500">Account Status</p>
                            <p className="text-xl font-semibold text-emerald-600">Active</p>
                        </div>
                    </div>
                </div>

                {/* Add Credits Form */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Credits</h3>
                    
                    <form onSubmit={handleAddCredits} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                {error}
                            </div>
                        )}
                        
                        {successMessage && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                                {successMessage}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Amount (credits)
                                </label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    min="1"
                                    required
                                    placeholder="1000"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {amount && (
                                    <p className="text-gray-400 text-sm mt-1">
                                        = ${(parseInt(amount, 10) / 1000).toFixed(2)}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description (optional)
                                </label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="e.g., Monthly top-up"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Quick amounts */}
                        <div className="flex gap-2">
                            {[1000, 5000, 10000, 50000].map((amt) => (
                                <button
                                    key={amt}
                                    type="button"
                                    onClick={() => setAmount(amt.toString())}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                                >
                                    {amt.toLocaleString()} (${amt / 1000})
                                </button>
                            ))}
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !amount}
                            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? 'Adding Credits...' : 'Add Credits'}
                        </button>
                    </form>
                </div>

                {/* GoLogin Profile Assignment */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">GoLogin Profile</h3>
                            <p className="text-sm text-gray-500">
                                Assign a browser profile for this user's scrapes
                            </p>
                        </div>
                        <Link
                            href="/admin/gologin-profiles"
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Manage Profiles →
                        </Link>
                    </div>

                    {profileError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                            {profileError}
                        </div>
                    )}

                    {profileSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm mb-4">
                            {profileSuccess}
                        </div>
                    )}

                    {/* Current Assignment */}
                    {currentAssignment ? (
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">{currentAssignment.profileName}</p>
                                    <p className="text-sm text-gray-500 font-mono">{currentAssignment.profileGoLoginId}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Assigned {new Date(currentAssignment.assignedAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <button
                                    onClick={handleUnassignProfile}
                                    disabled={assigningProfile}
                                    className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Unassign
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                            <p className="text-yellow-800 text-sm">
                                No profile assigned. This user will use the default profile from environment variables.
                            </p>
                        </div>
                    )}

                    {/* Assign New Profile */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">
                            {currentAssignment ? 'Change Profile' : 'Assign Profile'}
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={selectedProfileId}
                                onChange={(e) => setSelectedProfileId(e.target.value)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a profile...</option>
                                {goLoginProfiles.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.profile_id.slice(0, 8)}...)
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleAssignProfile}
                                disabled={!selectedProfileId || assigningProfile || selectedProfileId === currentAssignment?.profileDbId}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {assigningProfile ? 'Assigning...' : 'Assign'}
                            </button>
                        </div>
                        {goLoginProfiles.length === 0 && (
                            <p className="text-sm text-gray-500">
                                No profiles available.{' '}
                                <Link href="/admin/gologin-profiles" className="text-blue-600 hover:underline">
                                    Add one first
                                </Link>
                            </p>
                        )}
                    </div>
                </div>

                {/* Transaction History */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                        <p className="text-gray-500 text-sm mt-1">
                            Transaction history for this user
                        </p>
                    </div>

                    {transactions.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <p>No transactions yet</p>
                            <p className="text-sm text-gray-400 mt-1">Add credits above to create the first transaction</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {transactions.map((tx) => (
                                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                    <div>
                                        <p className="font-medium text-gray-900">{tx.description || tx.type}</p>
                                        <p className="text-sm text-gray-500">{formatDate(tx.created_at)}</p>
                                    </div>
                                    <span className={`font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


