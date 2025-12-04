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
    is_disabled?: boolean;
    disabled_at?: string | null;
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

    // Account disable/enable
    const [disablingAccount, setDisablingAccount] = useState(false);
    const [accountError, setAccountError] = useState<string | null>(null);
    const [accountSuccess, setAccountSuccess] = useState<string | null>(null);

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

    async function handleDisableAccount() {
        if (!confirm('Are you sure you want to disable this account? The user will no longer be able to access the application.')) {
            return;
        }

        setDisablingAccount(true);
        setAccountError(null);
        setAccountSuccess(null);

        try {
            const res = await fetch(`/api/admin/users/${userId}/disable`, {
                method: 'POST',
            });

            const data = await res.json();

            if (res.ok) {
                setAccountSuccess('Account disabled successfully');
                fetchUserData();
            } else {
                setAccountError(data.error || 'Failed to disable account');
            }
        } catch (err) {
            setAccountError('An error occurred');
            console.error(err);
        } finally {
            setDisablingAccount(false);
        }
    }

    async function handleEnableAccount() {
        if (!confirm('Are you sure you want to enable this account?')) {
            return;
        }

        setDisablingAccount(true);
        setAccountError(null);
        setAccountSuccess(null);

        try {
            const res = await fetch(`/api/admin/users/${userId}/disable`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (res.ok) {
                setAccountSuccess('Account enabled successfully');
                fetchUserData();
            } else {
                setAccountError(data.error || 'Failed to enable account');
            }
        } catch (err) {
            setAccountError('An error occurred');
            console.error(err);
        } finally {
            setDisablingAccount(false);
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
                        <div className={`rounded-lg p-4 ${profile.is_disabled ? 'bg-red-50' : 'bg-gray-50'}`}>
                            <p className="text-sm text-gray-500">Account Status</p>
                            {profile.is_disabled ? (
                                <>
                                    <p className="text-xl font-semibold text-red-600">Disabled</p>
                                    {profile.disabled_at && (
                                        <p className="text-sm text-red-400">
                                            Since {formatDate(profile.disabled_at)}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-xl font-semibold text-emerald-600">Active</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Account Management */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Management</h3>
                    
                    {accountError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                            {accountError}
                        </div>
                    )}
                    
                    {accountSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm mb-4">
                            {accountSuccess}
                        </div>
                    )}

                    {profile.is_disabled ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-800 font-medium">This account is disabled</p>
                                <p className="text-red-600 text-sm mt-1">
                                    The user cannot access the application. Enable the account to restore access.
                                </p>
                            </div>
                            <button
                                onClick={handleEnableAccount}
                                disabled={disablingAccount || userId === currentUser?.id}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                {disablingAccount ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Enabling...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Enable Account
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-gray-600 text-sm">
                                Disabling this account will prevent the user from accessing the application. 
                                They will see a message explaining their account is disabled when trying to log in.
                            </p>
                            <button
                                onClick={handleDisableAccount}
                                disabled={disablingAccount || userId === currentUser?.id || profile.is_admin}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                {disablingAccount ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Disabling...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                        </svg>
                                        Disable Account
                                    </>
                                )}
                            </button>
                            {userId === currentUser?.id && (
                                <p className="text-amber-600 text-sm">
                                    You cannot disable your own account.
                                </p>
                            )}
                            {profile.is_admin && userId !== currentUser?.id && (
                                <p className="text-amber-600 text-sm">
                                    Admin accounts cannot be disabled through this interface.
                                </p>
                            )}
                        </div>
                    )}
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

                {/* GoLogin Profile Assignment - Improved UI */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                    {/* Header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Browser Profile</h3>
                                    <p className="text-sm text-gray-500">
                                        GoLogin profile for scraping
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/admin/gologin-profiles"
                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                            >
                                Manage All
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </Link>
                        </div>
                    </div>

                    <div className="p-6">
                        {/* Status Messages */}
                        {profileError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {profileError}
                            </div>
                        )}

                        {profileSuccess && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {profileSuccess}
                            </div>
                        )}

                        {/* Current Assignment - Prominent Display */}
                        {currentAssignment ? (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    Currently Assigned
                                </div>
                                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                                                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 text-lg">{currentAssignment.profileName}</p>
                                                <p className="text-sm text-gray-500 font-mono">{currentAssignment.profileGoLoginId}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-400">
                                                Since {new Date(currentAssignment.assignedAt).toLocaleDateString()}
                                            </span>
                                            <button
                                                onClick={handleUnassignProfile}
                                                disabled={assigningProfile}
                                                className="px-3 py-1.5 text-sm text-red-600 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {assigningProfile ? (
                                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                )}
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                    No Profile Assigned
                                </div>
                                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-200">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                                            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-medium text-amber-800">Using Default Profile</p>
                                            <p className="text-sm text-amber-600">
                                                Will use GOLOGIN_PROFILE_ID from environment. Assign a profile below for dedicated access.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Available Profiles - Card Grid */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-medium text-gray-700">
                                    {currentAssignment ? 'Switch to Another Profile' : 'Select a Profile'}
                                </p>
                                <span className="text-xs text-gray-400">{goLoginProfiles.length} available</span>
                            </div>

                            {goLoginProfiles.length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                    <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-gray-500 mb-2">No profiles available</p>
                                    <Link 
                                        href="/admin/gologin-profiles" 
                                        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add your first profile
                                    </Link>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {goLoginProfiles.map((p) => {
                                        const isCurrentlyAssigned = p.id === currentAssignment?.profileDbId;
                                        const isSelected = p.id === selectedProfileId;
                                        
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => {
                                                    if (!isCurrentlyAssigned) {
                                                        setSelectedProfileId(p.id);
                                                    }
                                                }}
                                                disabled={isCurrentlyAssigned || assigningProfile}
                                                className={`
                                                    relative p-4 rounded-xl border-2 text-left transition-all
                                                    ${isCurrentlyAssigned 
                                                        ? 'border-emerald-300 bg-emerald-50 cursor-default' 
                                                        : isSelected 
                                                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
                                                            : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 cursor-pointer'
                                                    }
                                                    ${assigningProfile ? 'opacity-50' : ''}
                                                `}
                                            >
                                                {isCurrentlyAssigned && (
                                                    <span className="absolute top-2 right-2 flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                        Assigned
                                                    </span>
                                                )}
                                                {isSelected && !isCurrentlyAssigned && (
                                                    <span className="absolute top-2 right-2 flex items-center gap-1 text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                                                        Selected
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-3">
                                                    <div className={`
                                                        w-10 h-10 rounded-lg flex items-center justify-center
                                                        ${isCurrentlyAssigned ? 'bg-emerald-200' : isSelected ? 'bg-indigo-200' : 'bg-gray-100'}
                                                    `}>
                                                        <svg className={`w-5 h-5 ${isCurrentlyAssigned ? 'text-emerald-700' : isSelected ? 'text-indigo-700' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`font-medium truncate ${isCurrentlyAssigned ? 'text-emerald-900' : isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>
                                                            {p.name}
                                                        </p>
                                                        <p className="text-xs text-gray-500 font-mono truncate">
                                                            {p.profile_id}
                                                        </p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Action Button */}
                        {selectedProfileId && selectedProfileId !== currentAssignment?.profileDbId && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <button
                                    onClick={handleAssignProfile}
                                    disabled={assigningProfile}
                                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                                >
                                    {assigningProfile ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Assigning Profile...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {currentAssignment ? 'Change to Selected Profile' : 'Assign Selected Profile'}
                                        </>
                                    )}
                                </button>
                            </div>
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


