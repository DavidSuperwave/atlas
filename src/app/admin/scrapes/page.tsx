'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface Scrape {
    id: string;
    url: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    user_id: string;
    user_email?: string;
    name: string | null;
    total_leads: number | null;
    created_at: string;
    error_details?: { message?: string } | null;
    filters?: { pages?: number } | null;
    scraper_mode: string;
}

interface QueueItem {
    id: string;
    scrape_id: string;
    user_id: string;
    status: string;
    created_at: string;
    started_at: string | null;
    pages_scraped: number;
    leads_found: number;
    error_message: string | null;
}

interface BrowserSession {
    id: string;
    profile_id: string;
    user_id: string;
    session_type: string;
    status: string;
    scrape_id: string | null;
    started_at: string;
    last_heartbeat: string | null;
}

export default function AdminScrapesPage() {
    const { user, loading: authLoading } = useAuth();
    const [scrapes, setScrapes] = useState<Scrape[]>([]);
    const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
    const [browserSessions, setBrowserSessions] = useState<BrowserSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('active');

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/scrapes');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch data');
                }
                return;
            }
            
            const data = await res.json();
            setScrapes(data.scrapes || []);
            setQueueItems(data.queueItems || []);
            setBrowserSessions(data.browserSessions || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
            fetchData();
            // Refresh every 5 seconds
            const interval = setInterval(fetchData, 5000);
            return () => clearInterval(interval);
        }
    }, [user, authLoading, fetchData]);

    async function cancelScrape(scrapeId: string) {
        if (!confirm('Are you sure you want to cancel this scrape?')) return;
        
        setCancellingId(scrapeId);
        try {
            const res = await fetch(`/api/scrape/${scrapeId}/cancel`, {
                method: 'POST',
            });
            
            if (res.ok) {
                // Refresh data
                await fetchData();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to cancel scrape');
            }
        } catch (err) {
            console.error('Error cancelling scrape:', err);
            alert('Failed to cancel scrape');
        } finally {
            setCancellingId(null);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function getStatusColor(status: string) {
        switch (status) {
            case 'queued': return 'bg-yellow-100 text-yellow-800';
            case 'running': return 'bg-blue-100 text-blue-800';
            case 'completed': return 'bg-green-100 text-green-800';
            case 'failed': return 'bg-red-100 text-red-800';
            case 'cancelled': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function truncateUrl(url: string, maxLength: number = 60) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength) + '...';
    }

    const filteredScrapes = scrapes.filter(s => {
        if (filter === 'all') return true;
        if (filter === 'active') return ['queued', 'running'].includes(s.status);
        if (filter === 'completed') return s.status === 'completed';
        if (filter === 'failed') return ['failed', 'cancelled'].includes(s.status);
        return true;
    });

    const activeScrapes = scrapes.filter(s => ['queued', 'running'].includes(s.status));

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
                    <Link href="/admin" className="text-blue-600 hover:text-blue-700">
                        Back to Admin
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
                        <div className="flex items-center gap-3 mb-2">
                            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <h1 className="text-3xl font-bold text-gray-900">Scrape Management</h1>
                        </div>
                        <p className="text-gray-600">Monitor and manage all scrape operations</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {activeScrapes.length > 0 && (
                            <span className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                                {activeScrapes.length} Active
                            </span>
                        )}
                    </div>
                </div>

                {/* Browser Sessions */}
                {browserSessions.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Browser Sessions</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {browserSessions.map((session) => (
                                <div key={session.id} className="bg-gray-50 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-900">
                                            Profile: {session.profile_id.slice(0, 12)}...
                                        </span>
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                                            session.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {session.status}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 space-y-1">
                                        <p>Type: {session.session_type}</p>
                                        <p>Started: {formatDate(session.started_at)}</p>
                                        {session.last_heartbeat && (
                                            <p>Last heartbeat: {formatDate(session.last_heartbeat)}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Queue Status */}
                {queueItems.filter(q => q.status === 'pending' || q.status === 'running').length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Queue Status</h2>
                        <div className="space-y-3">
                            {queueItems.filter(q => q.status === 'pending' || q.status === 'running').map((item, index) => (
                                <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">
                                                Scrape: {item.scrape_id.slice(0, 8)}...
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {item.status === 'running' ? `Pages: ${item.pages_scraped}, Leads: ${item.leads_found}` : 'Waiting...'}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(item.status)}`}>
                                        {item.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-6">
                    {(['active', 'all', 'completed', 'failed'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filter === f
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                            {f === 'active' && activeScrapes.length > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                                    {activeScrapes.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Scrapes Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scrape</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pages</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leads</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredScrapes.map((scrape) => (
                                    <tr key={scrape.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {scrape.name || scrape.id.slice(0, 8) + '...'}
                                                </p>
                                                <p className="text-xs text-gray-500 max-w-xs truncate" title={scrape.url}>
                                                    {truncateUrl(scrape.url)}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <p className="text-sm text-gray-900">{scrape.user_email || 'Unknown'}</p>
                                            <p className="text-xs text-gray-500 font-mono">{scrape.user_id.slice(0, 8)}...</p>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(scrape.status)}`}>
                                                {scrape.status === 'running' && (
                                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                                                )}
                                                {scrape.status}
                                            </span>
                                            {scrape.error_details?.message && (
                                                <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={scrape.error_details.message}>
                                                    {scrape.error_details.message}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {scrape.filters?.pages || 1}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                            {scrape.total_leads || 0}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDate(scrape.created_at)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {['queued', 'running'].includes(scrape.status) && (
                                                <button
                                                    onClick={() => cancelScrape(scrape.id)}
                                                    disabled={cancellingId === scrape.id}
                                                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                                >
                                                    {cancellingId === scrape.id ? 'Cancelling...' : 'Cancel'}
                                                </button>
                                            )}
                                            {scrape.status === 'completed' && (
                                                <Link href={`/scrapes/${scrape.id}`} className="text-blue-600 hover:text-blue-900">
                                                    View
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredScrapes.length === 0 && (
                        <div className="p-12 text-center text-gray-500">
                            No scrapes found
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

