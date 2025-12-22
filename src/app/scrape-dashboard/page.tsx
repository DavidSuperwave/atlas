'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';

interface Scrape {
    id: string;
    url: string;
    status: 'pending_approval' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    name: string | null;
    total_leads: number | null;
    created_at: string;
    transferred_leads_count: number | null;
}

export default function ScrapeDashboardPage() {
    const { user, loading: authLoading } = useAuth();
    const [url, setUrl] = useState('');
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [scrapes, setScrapes] = useState<Scrape[]>([]);
    const [fetchingData, setFetchingData] = useState(true);
    const [creditBalance, setCreditBalance] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchScrapes = useCallback(async () => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('scrapes')
            .select('id, url, status, name, total_leads, created_at, transferred_leads_count')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching scrapes:', error);
        } else {
            setScrapes(data || []);
        }
        setFetchingData(false);
    }, []);

    const fetchCreditBalance = useCallback(async () => {
        try {
            const res = await fetch('/api/credits/balance');
            if (res.ok) {
                const data = await res.json();
                setCreditBalance(data.balance);
            }
        } catch (err) {
            console.error('Error fetching credit balance:', err);
        }
    }, []);

    useEffect(() => {
        if (user) {
            fetchScrapes();
            fetchCreditBalance();
        } else if (!authLoading) {
            setFetchingData(false);
        }
    }, [user, authLoading, fetchScrapes, fetchCreditBalance]);

    async function handleSubmitScrape(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!url.trim()) {
            setError('Please enter a URL');
            return;
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            setError('Please enter a valid URL');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/scrape-dashboard/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, pages }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to submit scrape request');
                return;
            }

            setSuccess('Scrape request submitted! Our team will process it and add the results to your account.');
            setUrl('');
            setPages(1);
            fetchScrapes();
        } catch (err) {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
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

    function getStatusBadge(status: string) {
        switch (status) {
            case 'pending_approval':
                return { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' };
            case 'queued':
                return { label: 'Queued', color: 'bg-blue-100 text-blue-700 border-blue-200' };
            case 'running':
                return { label: 'Running', color: 'bg-purple-100 text-purple-700 border-purple-200' };
            case 'completed':
                return { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200' };
            case 'failed':
                return { label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200' };
            case 'cancelled':
                return { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 border-gray-200' };
            default:
                return { label: status, color: 'bg-gray-100 text-gray-600 border-gray-200' };
        }
    }

    if (authLoading || fetchingData) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Please Sign In</h1>
                    <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
                        Go to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black">
            {/* Background gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-emerald-950/20 via-black to-black pointer-events-none" />

            <div className="relative max-w-5xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Scrape Dashboard</h1>
                        <p className="text-zinc-400 mt-1">Submit scrape requests and view your results</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Credit Balance */}
                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2">
                            <div className="text-xs text-zinc-500">Credits</div>
                            <div className="text-xl font-bold text-white">
                                {creditBalance !== null ? creditBalance.toLocaleString() : '...'}
                            </div>
                        </div>
                        <Link
                            href="/credits"
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
                        >
                            Buy Credits
                        </Link>
                    </div>
                </div>

                {/* Messages */}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                        {success}
                    </div>
                )}

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* Scrape Request Form */}
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">Submit Scrape Request</h2>
                        <form onSubmit={handleSubmitScrape} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Apollo Search URL
                                </label>
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://app.apollo.io/..."
                                    required
                                    className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all"
                                />
                                <p className="text-xs text-zinc-500 mt-1">
                                    Paste your Apollo.io search URL here
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Pages to Scrape
                                </label>
                                <select
                                    value={pages}
                                    onChange={(e) => setPages(Number(e.target.value))}
                                    className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent transition-all"
                                >
                                    {[1, 2, 3, 4, 5, 10, 15, 20, 25].map((n) => (
                                        <option key={n} value={n}>
                                            {n} page{n > 1 ? 's' : ''} (~{n * 25} leads)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Submitting...' : 'Submit Scrape Request'}
                            </button>
                        </form>

                        <div className="mt-4 p-4 bg-zinc-800/40 rounded-xl">
                            <h3 className="text-sm font-medium text-zinc-300 mb-2">How it works:</h3>
                            <ul className="text-xs text-zinc-500 space-y-1">
                                <li>1. Submit your Apollo search URL</li>
                                <li>2. Our team processes the scrape for you</li>
                                <li>3. You receive only verified emails (valid + catch-all)</li>
                                <li>4. Credits are charged only for valid emails</li>
                            </ul>
                        </div>
                    </div>

                    {/* Demo Video */}
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">How to Use</h2>
                        <div className="aspect-video bg-zinc-800 rounded-xl flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-zinc-400">Demo Video Coming Soon</p>
                                <p className="text-xs text-zinc-500 mt-2">Watch how to find and submit Apollo URLs</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Upgrade CTA */}
                <div className="mb-8 p-6 bg-gradient-to-r from-emerald-900/30 to-blue-900/30 border border-emerald-800/50 rounded-2xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-1">Want More Features?</h3>
                            <p className="text-zinc-400 text-sm">
                                Upgrade to our full app for real-time scraping, lead management, campaign integration, and more.
                            </p>
                        </div>
                        <Link
                            href="/onboarding/upgrade"
                            className="px-6 py-3 bg-white hover:bg-zinc-100 text-black font-semibold rounded-xl transition-colors whitespace-nowrap"
                        >
                            Upgrade to Full App
                        </Link>
                    </div>
                </div>

                {/* Scrape History */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-zinc-800">
                        <h2 className="text-xl font-semibold text-white">Your Scrape Requests</h2>
                    </div>

                    {scrapes.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-zinc-400">No scrape requests yet</p>
                            <p className="text-zinc-500 text-sm mt-1">Submit your first request above</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800">
                            {scrapes.map((scrape) => {
                                const statusBadge = getStatusBadge(scrape.status);
                                const leadsCount = scrape.transferred_leads_count || scrape.total_leads || 0;

                                return (
                                    <div key={scrape.id} className="p-4 hover:bg-zinc-800/30 transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${statusBadge.color}`}>
                                                        {statusBadge.label}
                                                    </span>
                                                    {scrape.status === 'completed' && leadsCount > 0 && (
                                                        <span className="text-xs text-emerald-400">
                                                            {leadsCount} leads
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-white truncate" title={scrape.url}>
                                                    {scrape.name || scrape.url}
                                                </p>
                                                <p className="text-xs text-zinc-500 mt-1">
                                                    {formatDate(scrape.created_at)}
                                                </p>
                                            </div>
                                            {scrape.status === 'completed' && leadsCount > 0 && (
                                                <Link
                                                    href={`/scrapes/${scrape.id}`}
                                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                >
                                                    View Leads
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

