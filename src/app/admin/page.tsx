'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface UserStats {
    id: string;
    email: string;
    credits_balance: number;
    is_admin: boolean;
    created_at: string;
    scrapes_count?: number;
    leads_count?: number;
}

interface DailyUserUsage {
    userId: string;
    email: string;
    creditsUsed: number;
}

interface KeyStat {
    name: string;
    windowCount: number;
    windowRemaining: number;
    dailyCount: number;
    dailyRemaining: number;
    inUse: boolean;
}

interface AdminStats {
    totalLeads: number;
    pendingOrders: number;
    formsReviewed: number;
    dailyUsage: {
        creditsUsed: number;
        creditsRemaining: number;
        dailyLimit: number;
        usagePercentage: number;
        isApproachingLimit: boolean;
        isAtLimit: boolean;
        perUserUsage: DailyUserUsage[];
    };
    queue: {
        queueSize: number;
        totalPendingEmails: number;
        isProcessing: boolean;
        estimatedTimeSeconds: number;
        estimatedTimeFormatted: string;
        rateLimit: {
            emailsPer30Seconds: number;
            dailyLimit: number;
            delayBetweenRequestsMs: number;
            maxEmailsPerSecond: number;
        };
    };
    apiKeys: {
        count: number;
        stats: KeyStat[];
        capacity: {
            keysCount: number;
            requestsPerMinute: number;
            requestsPerHour: number;
            requestsPerDay: number;
        };
        hasMultipleKeys: boolean;
    };
    timestamp: string;
}

export default function AdminDashboardPage() {
    const { user, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<UserStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalCredits: 0,
        totalScrapes: 0,
        totalLeads: 0,
    });
    const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    const fetchAdminStats = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/stats');
            if (res.ok) {
                const data = await res.json();
                setAdminStats(data);
            }
        } catch (err) {
            console.error('Error fetching admin stats:', err);
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
            fetchData();
            fetchAdminStats();
            
            // Refresh stats every 30 seconds
            const interval = setInterval(fetchAdminStats, 30000);
            return () => clearInterval(interval);
        }
    }, [user, authLoading, fetchAdminStats]);

    async function fetchData() {
        try {
            // Fetch users from admin endpoint
            const res = await fetch('/api/admin/credits/add');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch data');
                }
                setLoading(false);
                return;
            }
            
            const data = await res.json();
            setUsers(data.users || []);
            
            // Calculate stats
            const totalCredits = data.users.reduce((sum: number, u: UserStats) => sum + (u.credits_balance || 0), 0);
            setStats({
                totalUsers: data.users.length,
                totalCredits,
                totalScrapes: 0,
                totalLeads: 0,
            });
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    function formatNumber(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
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

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                        <p className="text-gray-600 mt-1">Manage users, credits, and monitor API usage</p>
                    </div>
                    <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                        Admin
                    </span>
                </div>

                {/* Primary Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Users</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Total Leads</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {statsLoading ? '...' : formatNumber(adminStats?.totalLeads || 0)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Pending Orders (replaced Total Credits) */}
                    <Link href="/admin/credit-orders" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-amber-300 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Pending Orders</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {statsLoading ? '...' : (adminStats?.pendingOrders || 0)}
                                </p>
                            </div>
                        </div>
                    </Link>

                    {/* Forms Reviewed (replaced Platform Value) */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Forms Reviewed</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {statsLoading ? '...' : (adminStats?.formsReviewed || 0)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <Link href="/admin/credits" className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white hover:from-blue-700 hover:to-indigo-700 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-white/80">Quick Action</p>
                                <p className="text-lg font-bold">Add Credits</p>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Invite Management Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Link href="/admin/access-requests" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-amber-300 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900">Access Requests</p>
                                <p className="text-sm text-gray-500">Review and approve requests from the landing page</p>
                            </div>
                        </div>
                    </Link>
                    
                    <Link href="/admin/invites" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <rect width="20" height="16" x="2" y="4" rx="2" />
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900">Invites</p>
                                <p className="text-sm text-gray-500">Send and manage user invitations</p>
                            </div>
                        </div>
                    </Link>

                    <Link href="/admin/credit-orders" className="bg-white rounded-xl border border-gray-200 p-6 hover:border-emerald-300 hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-gray-900">Credit Orders</p>
                                <p className="text-sm text-gray-500">Review and approve credit purchase requests</p>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* API Keys & Processing Capacity */}
                {adminStats?.apiKeys && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Mail Key Usage & Processing Capacity</h3>
                            {adminStats.apiKeys.hasMultipleKeys && (
                                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                    {adminStats.apiKeys.count} Keys Active
                                </span>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div className="bg-gray-50 rounded-lg p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">{adminStats.apiKeys.count}</p>
                                <p className="text-sm text-gray-500">API Keys</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">{formatNumber(adminStats.apiKeys.capacity.requestsPerMinute)}</p>
                                <p className="text-sm text-gray-500">Emails / Min</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">{formatNumber(adminStats.apiKeys.capacity.requestsPerHour)}</p>
                                <p className="text-sm text-gray-500">Emails / Hour</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 text-center">
                                <p className="text-3xl font-bold text-gray-900">{formatNumber(adminStats.apiKeys.capacity.requestsPerDay)}</p>
                                <p className="text-sm text-gray-500">Daily Limit</p>
                            </div>
                        </div>

                        {adminStats.apiKeys.stats.length > 0 && (
                            <div className="mt-4">
                                <p className="text-sm font-medium text-gray-700 mb-2">Per-Key Stats</p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-gray-500 border-b">
                                                <th className="text-left py-2">Key</th>
                                                <th className="text-right py-2">Window (30s)</th>
                                                <th className="text-right py-2">Daily Used</th>
                                                <th className="text-right py-2">Daily Remaining</th>
                                                <th className="text-right py-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {adminStats.apiKeys.stats.map((key) => (
                                                <tr key={key.name} className="border-b border-gray-100">
                                                    <td className="py-2 font-medium text-gray-900">{key.name}</td>
                                                    <td className="text-right py-2 text-gray-600">{key.windowCount} / 170</td>
                                                    <td className="text-right py-2 text-gray-600">{formatNumber(key.dailyCount)}</td>
                                                    <td className="text-right py-2 text-gray-600">{formatNumber(key.dailyRemaining)}</td>
                                                    <td className="text-right py-2">
                                                        {key.inUse ? (
                                                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Active</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Idle</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Daily Usage & Queue Status */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Daily API Usage Card - Using aggregated data from API keys */}
                    {(() => {
                        // Calculate aggregated stats from API keys
                        const totalDailyUsed = adminStats?.apiKeys?.stats?.reduce((sum, key) => sum + key.dailyCount, 0) || 0;
                        const totalDailyRemaining = adminStats?.apiKeys?.stats?.reduce((sum, key) => sum + key.dailyRemaining, 0) || 0;
                        const dailyLimit = adminStats?.apiKeys?.capacity?.requestsPerDay || 1000000;
                        const usagePercentage = dailyLimit > 0 ? (totalDailyUsed / dailyLimit) * 100 : 0;
                        const isApproachingLimit = usagePercentage >= 80;
                        const isAtLimit = usagePercentage >= 95;

                        return (
                            <div className={`bg-white rounded-xl border p-6 ${
                                isAtLimit 
                                    ? 'border-red-300 bg-red-50' 
                                    : isApproachingLimit 
                                        ? 'border-amber-300 bg-amber-50' 
                                        : 'border-gray-200'
                            }`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900">Daily API Usage</h3>
                                    <div className="flex items-center gap-2">
                                        {isAtLimit && (
                                            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                                Limit Reached
                                            </span>
                                        )}
                                        {isApproachingLimit && !isAtLimit && (
                                            <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                                                Approaching Limit
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-500">Mail Tester Ninja</span>
                                    </div>
                                </div>

                                {statsLoading ? (
                                    <div className="flex items-center justify-center h-32">
                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                                    </div>
                                ) : adminStats ? (
                                    <>
                                        {/* Progress Bar */}
                                        <div className="mb-4">
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-gray-600">
                                                    {formatNumber(totalDailyUsed)} used
                                                </span>
                                                <span className="text-gray-600">
                                                    {formatNumber(totalDailyRemaining)} remaining
                                                </span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-3">
                                                <div 
                                                    className={`h-3 rounded-full transition-all ${
                                                        isAtLimit 
                                                            ? 'bg-red-500' 
                                                            : isApproachingLimit 
                                                                ? 'bg-amber-500' 
                                                                : 'bg-emerald-500'
                                                    }`}
                                                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                                                ></div>
                                            </div>
                                            <div className="text-right text-xs text-gray-500 mt-1">
                                                {usagePercentage.toFixed(2)}% of {formatNumber(dailyLimit)} daily limit
                                            </div>
                                        </div>

                                        {/* Rate Limit Info */}
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div className="bg-gray-50 rounded-lg p-3">
                                                <p className="text-gray-500">Rate Limit</p>
                                                <p className="font-semibold text-gray-900">
                                                    {adminStats.queue.rateLimit.emailsPer30Seconds} / 30s
                                                </p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-3">
                                                <p className="text-gray-500">Processing Speed</p>
                                                <p className="font-semibold text-gray-900">
                                                    ~{adminStats.queue.rateLimit.maxEmailsPerSecond} emails/sec
                                                </p>
                                            </div>
                                        </div>

                                        {/* Per-User Usage */}
                                        {adminStats.dailyUsage.perUserUsage.length > 0 && (
                                            <div className="mt-4">
                                                <p className="text-sm font-medium text-gray-700 mb-2">Usage by User Today</p>
                                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                                    {adminStats.dailyUsage.perUserUsage.map((u) => (
                                                        <div key={u.userId} className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-600 truncate max-w-[200px]">{u.email}</span>
                                                            <span className="font-medium text-gray-900">{u.creditsUsed.toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-gray-500 text-center py-8">Unable to load stats</p>
                                )}
                            </div>
                        );
                    })()}

                    {/* Queue Status Card */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Queue Status</h3>
                            {adminStats?.queue.isProcessing && (
                                <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                    Processing
                                </span>
                            )}
                        </div>

                        {statsLoading ? (
                            <div className="flex items-center justify-center h-32">
                                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                            </div>
                        ) : adminStats ? (
                            <>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                                        <p className="text-3xl font-bold text-gray-900">{adminStats.queue.queueSize}</p>
                                        <p className="text-sm text-gray-500">Items in Queue</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                                        <p className="text-3xl font-bold text-gray-900">{adminStats.queue.totalPendingEmails}</p>
                                        <p className="text-sm text-gray-500">Pending Emails</p>
                                    </div>
                                </div>

                                <div className="bg-blue-50 rounded-lg p-4">
                                    <div className="flex items-center gap-3">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <div>
                                            <p className="text-sm text-blue-800">Estimated Time to Complete</p>
                                            <p className="text-lg font-bold text-blue-900">
                                                {adminStats.queue.totalPendingEmails === 0 
                                                    ? 'Queue Empty' 
                                                    : adminStats.queue.estimatedTimeFormatted}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 text-xs text-gray-500">
                                    <p>Processing at {adminStats.queue.rateLimit.delayBetweenRequestsMs}ms delay between requests</p>
                                    <p className="mt-1">Last updated: {new Date(adminStats.timestamp).toLocaleTimeString()}</p>
                                </div>
                            </>
                        ) : (
                            <p className="text-gray-500 text-center py-8">Unable to load queue stats</p>
                        )}
                    </div>
                </div>

                {/* Users Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">All Users</h2>
                        <span className="text-sm text-gray-500">{users.length} users</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {users.map((u) => (
                                    <tr key={u.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                                    <span className="text-gray-600 font-medium">
                                                        {u.email.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">{u.email}</div>
                                                    <div className="text-sm text-gray-500 font-mono">{u.id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-semibold text-gray-900">{u.credits_balance.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-500">${(u.credits_balance / 1000).toFixed(2)}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDate(u.created_at)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {u.is_admin ? (
                                                <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                                                    Admin
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                                                    User
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Link
                                                href={`/admin/users/${u.id}`}
                                                className="text-blue-600 hover:text-blue-900 mr-4"
                                            >
                                                View
                                            </Link>
                                            <Link
                                                href={`/admin/credits?user=${u.id}`}
                                                className="text-emerald-600 hover:text-emerald-900"
                                            >
                                                Add Credits
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {users.length === 0 && (
                        <div className="p-12 text-center text-gray-500">
                            No users found
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
