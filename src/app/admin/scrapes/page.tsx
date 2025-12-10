'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface Scrape {
    id: string;
    url: string;
    status: 'pending_approval' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    user_id: string;
    user_email?: string;
    user_name?: string;
    user_account_type?: string;
    user_credits_balance?: number;
    name: string | null;
    total_leads: number | null;
    created_at: string;
    error_details?: { message?: string } | null;
    filters?: { pages?: number } | null;
    scraper_mode: string;
    requires_admin_approval?: boolean;
    transferred_leads_count?: number | null;
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

interface TransferModalState {
    isOpen: boolean;
    targetScrape: Scrape | null;
    selectedSourceScrape: string | null;
    submitting: boolean;
}

interface CompletedScrapeWithLeads {
    id: string;
    url: string;
    name: string | null;
    created_at: string;
    total_leads: number;
    valid_leads: number;
    catchall_leads: number;
}

interface CreditModalState {
    isOpen: boolean;
    targetScrape: Scrape | null;
    amount: string;
    description: string;
    submitting: boolean;
}

interface PaymentLinkModalState {
    isOpen: boolean;
    targetScrape: Scrape | null;
    creditAmount: string;
    planName: string;
    description: string;
    submitting: boolean;
    generatedLink: string | null;
}

export default function AdminScrapesPage() {
    const { user, loading: authLoading } = useAuth();
    const [scrapes, setScrapes] = useState<Scrape[]>([]);
    const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
    const [browserSessions, setBrowserSessions] = useState<BrowserSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed' | 'requests'>('active');
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Transfer modal state
    const [transferModal, setTransferModal] = useState<TransferModalState>({
        isOpen: false,
        targetScrape: null,
        selectedSourceScrape: null,
        submitting: false,
    });
    const [completedScrapesForTransfer, setCompletedScrapesForTransfer] = useState<CompletedScrapeWithLeads[]>([]);
    
    // Credit modal state
    const [creditModal, setCreditModal] = useState<CreditModalState>({
        isOpen: false,
        targetScrape: null,
        amount: '',
        description: '',
        submitting: false,
    });
    
    // Payment link modal state
    const [paymentLinkModal, setPaymentLinkModal] = useState<PaymentLinkModalState>({
        isOpen: false,
        targetScrape: null,
        creditAmount: '',
        planName: '',
        description: '',
        submitting: false,
        generatedLink: null,
    });

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

    // Fetch completed scrapes for transfer (admin's own completed scrapes)
    async function fetchCompletedScrapesForTransfer() {
        try {
            const res = await fetch('/api/admin/scrapes/completed-with-leads');
            if (res.ok) {
                const data = await res.json();
                setCompletedScrapesForTransfer(data.scrapes || []);
            }
        } catch (err) {
            console.error('Error fetching completed scrapes:', err);
        }
    }

    // Open transfer modal
    async function openTransferModal(scrape: Scrape) {
        setTransferModal({
            isOpen: true,
            targetScrape: scrape,
            selectedSourceScrape: null,
            submitting: false,
        });
        await fetchCompletedScrapesForTransfer();
    }

    // Close transfer modal
    function closeTransferModal() {
        setTransferModal({
            isOpen: false,
            targetScrape: null,
            selectedSourceScrape: null,
            submitting: false,
        });
    }

    // Transfer leads
    async function handleTransfer() {
        if (!transferModal.targetScrape || !transferModal.selectedSourceScrape) return;
        
        setTransferModal(prev => ({ ...prev, submitting: true }));
        setActionMessage(null);
        
        try {
            const res = await fetch(`/api/admin/scrapes/${transferModal.targetScrape.id}/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceScrapeId: transferModal.selectedSourceScrape }),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setActionMessage({ 
                    type: 'success', 
                    text: `Transferred ${data.totalTransferred} leads (${data.validLeadsCount} valid, ${data.catchallLeadsCount} catchall). ${data.creditsCharged} credits charged.` 
                });
                closeTransferModal();
                await fetchData();
            } else {
                setActionMessage({ type: 'error', text: data.error || 'Failed to transfer leads' });
            }
        } catch (err) {
            console.error('Error transferring leads:', err);
            setActionMessage({ type: 'error', text: 'Failed to transfer leads' });
        } finally {
            setTransferModal(prev => ({ ...prev, submitting: false }));
        }
    }

    // Cancel a scrape request
    async function cancelScrapeRequest(scrapeId: string) {
        if (!confirm('Are you sure you want to cancel this scrape request?')) return;
        
        try {
            const res = await fetch(`/api/admin/scrapes/${scrapeId}/cancel`, {
                method: 'POST',
            });
            
            if (res.ok) {
                setActionMessage({ type: 'success', text: 'Scrape request cancelled' });
                await fetchData();
            } else {
                const data = await res.json();
                setActionMessage({ type: 'error', text: data.error || 'Failed to cancel' });
            }
        } catch (err) {
            console.error('Error cancelling scrape request:', err);
            setActionMessage({ type: 'error', text: 'Failed to cancel' });
        }
    }

    // Open credit modal
    function openCreditModal(scrape: Scrape) {
        setCreditModal({
            isOpen: true,
            targetScrape: scrape,
            amount: '',
            description: '',
            submitting: false,
        });
    }

    // Close credit modal
    function closeCreditModal() {
        setCreditModal({
            isOpen: false,
            targetScrape: null,
            amount: '',
            description: '',
            submitting: false,
        });
    }

    // Add credits to user
    async function handleAddCredits() {
        if (!creditModal.targetScrape || !creditModal.amount) return;
        
        const amount = parseInt(creditModal.amount);
        if (isNaN(amount) || amount < 1) {
            setActionMessage({ type: 'error', text: 'Amount must be at least 1' });
            return;
        }
        
        setCreditModal(prev => ({ ...prev, submitting: true }));
        setActionMessage(null);
        
        try {
            const res = await fetch(`/api/admin/users/${creditModal.targetScrape.user_id}/add-credits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    amount,
                    description: creditModal.description || `Credits for scrape request ${creditModal.targetScrape.id.slice(0, 8)}`,
                }),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setActionMessage({ 
                    type: 'success', 
                    text: `Added ${amount} credits to ${creditModal.targetScrape.user_email}` 
                });
                closeCreditModal();
                await fetchData();
            } else {
                setActionMessage({ type: 'error', text: data.error || 'Failed to add credits' });
            }
        } catch (err) {
            console.error('Error adding credits:', err);
            setActionMessage({ type: 'error', text: 'Failed to add credits' });
        } finally {
            setCreditModal(prev => ({ ...prev, submitting: false }));
        }
    }

    // Open payment link modal
    function openPaymentLinkModal(scrape: Scrape) {
        setPaymentLinkModal({
            isOpen: true,
            targetScrape: scrape,
            creditAmount: '',
            planName: '',
            description: '',
            submitting: false,
            generatedLink: null,
        });
    }

    // Close payment link modal
    function closePaymentLinkModal() {
        setPaymentLinkModal({
            isOpen: false,
            targetScrape: null,
            creditAmount: '',
            planName: '',
            description: '',
            submitting: false,
            generatedLink: null,
        });
    }

    // Generate payment link
    async function handleGeneratePaymentLink() {
        if (!paymentLinkModal.targetScrape || !paymentLinkModal.creditAmount) return;
        
        const creditAmount = parseInt(paymentLinkModal.creditAmount);
        if (isNaN(creditAmount) || creditAmount < 1) {
            setActionMessage({ type: 'error', text: 'Credit amount must be at least 1' });
            return;
        }
        
        setPaymentLinkModal(prev => ({ ...prev, submitting: true }));
        setActionMessage(null);
        
        try {
            const res = await fetch(`/api/admin/users/${paymentLinkModal.targetScrape.user_id}/send-payment-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    creditAmount,
                    planName: paymentLinkModal.planName || null,
                    description: paymentLinkModal.description || `Payment for scrape request ${paymentLinkModal.targetScrape.id.slice(0, 8)}`,
                }),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setPaymentLinkModal(prev => ({ 
                    ...prev, 
                    submitting: false,
                    generatedLink: data.link.paymentUrl,
                }));
                setActionMessage({ type: 'success', text: 'Payment link generated! Copy and send to user.' });
            } else {
                setActionMessage({ type: 'error', text: data.error || 'Failed to generate payment link' });
                setPaymentLinkModal(prev => ({ ...prev, submitting: false }));
            }
        } catch (err) {
            console.error('Error generating payment link:', err);
            setActionMessage({ type: 'error', text: 'Failed to generate payment link' });
            setPaymentLinkModal(prev => ({ ...prev, submitting: false }));
        }
    }

    // Copy payment link to clipboard
    async function copyPaymentLink() {
        if (paymentLinkModal.generatedLink) {
            await navigator.clipboard.writeText(paymentLinkModal.generatedLink);
            setActionMessage({ type: 'success', text: 'Payment link copied to clipboard!' });
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
            case 'pending_approval': return 'bg-amber-100 text-amber-800';
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
        if (filter === 'requests') return s.status === 'pending_approval';
        return true;
    });

    const activeScrapes = scrapes.filter(s => ['queued', 'running'].includes(s.status));
    const pendingRequests = scrapes.filter(s => s.status === 'pending_approval');

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

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-6">
                    {(['requests', 'active', 'all', 'completed', 'failed'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filter === f
                                    ? f === 'requests' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            {f === 'requests' ? 'Scrape Requests' : f.charAt(0).toUpperCase() + f.slice(1)}
                            {f === 'requests' && pendingRequests.length > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                                    {pendingRequests.length}
                                </span>
                            )}
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
                                            <div className="flex items-center justify-end gap-2">
                                                {scrape.status === 'pending_approval' && (
                                                    <>
                                                        <button
                                                            onClick={() => openTransferModal(scrape)}
                                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                        >
                                                            Transfer
                                                        </button>
                                                        <button
                                                            onClick={() => openPaymentLinkModal(scrape)}
                                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                        >
                                                            Payment Link
                                                        </button>
                                                        <button
                                                            onClick={() => openCreditModal(scrape)}
                                                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                        >
                                                            Add Credits
                                                        </button>
                                                        <button
                                                            onClick={() => cancelScrapeRequest(scrape.id)}
                                                            className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                )}
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
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredScrapes.length === 0 && (
                        <div className="p-12 text-center text-gray-500">
                            {filter === 'requests' ? 'No pending scrape requests' : 'No scrapes found'}
                        </div>
                    )}
                </div>
            </div>

            {/* Transfer Modal */}
            {transferModal.isOpen && transferModal.targetScrape && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Transfer Scrape Results</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Select a completed scrape to transfer valid & catchall leads to this request
                            </p>
                        </div>
                        
                        {/* Target Scrape Info */}
                        <div className="p-4 bg-amber-50 border-b border-amber-200">
                            <div className="text-sm">
                                <strong className="text-gray-900">Target Request:</strong>{' '}
                                <span className="text-gray-600">{transferModal.targetScrape.name || transferModal.targetScrape.url}</span>
                            </div>
                            <div className="text-sm mt-1">
                                <strong className="text-gray-900">User:</strong>{' '}
                                <span className="text-gray-600">{transferModal.targetScrape.user_email}</span>
                                {transferModal.targetScrape.user_credits_balance !== undefined && (
                                    <span className="ml-2 text-xs text-gray-500">
                                        (Balance: {transferModal.targetScrape.user_credits_balance} credits)
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        {/* Source Scrape Selection */}
                        <div className="p-4 max-h-80 overflow-y-auto">
                            <p className="text-sm font-medium text-gray-700 mb-3">Select source scrape:</p>
                            
                            {completedScrapesForTransfer.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <p>No completed scrapes with valid/catchall leads available</p>
                                    <p className="text-xs mt-1">Run a scrape first and wait for verification to complete</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {completedScrapesForTransfer.map((scrape) => (
                                        <label
                                            key={scrape.id}
                                            className={`flex items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                                                transferModal.selectedSourceScrape === scrape.id
                                                    ? 'border-emerald-500 bg-emerald-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="sourceScrape"
                                                value={scrape.id}
                                                checked={transferModal.selectedSourceScrape === scrape.id}
                                                onChange={() => setTransferModal(prev => ({ ...prev, selectedSourceScrape: scrape.id }))}
                                                className="sr-only"
                                            />
                                            <div className="flex-1">
                                                <div className="font-medium text-gray-900">{scrape.name || scrape.url}</div>
                                                <div className="text-xs text-gray-500 mt-1">{formatDate(scrape.created_at)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-emerald-600">{scrape.valid_leads + scrape.catchall_leads} leads</div>
                                                <div className="text-xs text-gray-500">
                                                    {scrape.valid_leads} valid, {scrape.catchall_leads} catchall
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Actions */}
                        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={closeTransferModal}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleTransfer}
                                disabled={!transferModal.selectedSourceScrape || transferModal.submitting}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {transferModal.submitting ? 'Transferring...' : 'Transfer Leads'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Credits Modal */}
            {creditModal.isOpen && creditModal.targetScrape && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Add Credits</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Add credits directly to user&apos;s account
                            </p>
                        </div>
                        
                        {/* User Info */}
                        <div className="p-4 bg-purple-50 border-b border-purple-200">
                            <div className="text-sm">
                                <strong className="text-gray-900">User:</strong>{' '}
                                <span className="text-gray-600">{creditModal.targetScrape.user_email}</span>
                            </div>
                            <div className="text-sm mt-1">
                                <strong className="text-gray-900">Current Balance:</strong>{' '}
                                <span className="text-gray-600">{creditModal.targetScrape.user_credits_balance || 0} credits</span>
                            </div>
                        </div>
                        
                        {/* Form */}
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Credits to Add
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={creditModal.amount}
                                    onChange={(e) => setCreditModal(prev => ({ ...prev, amount: e.target.value }))}
                                    placeholder="Enter amount"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description (optional)
                                </label>
                                <input
                                    type="text"
                                    value={creditModal.description}
                                    onChange={(e) => setCreditModal(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="e.g., Bonus credits, Refund"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={closeCreditModal}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddCredits}
                                disabled={!creditModal.amount || creditModal.submitting}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {creditModal.submitting ? 'Adding...' : 'Add Credits'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Link Modal */}
            {paymentLinkModal.isOpen && paymentLinkModal.targetScrape && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Generate Payment Link</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Create a payment link for the user
                            </p>
                        </div>
                        
                        {/* User Info */}
                        <div className="p-4 bg-blue-50 border-b border-blue-200">
                            <div className="text-sm">
                                <strong className="text-gray-900">User:</strong>{' '}
                                <span className="text-gray-600">{paymentLinkModal.targetScrape.user_email}</span>
                            </div>
                        </div>
                        
                        {paymentLinkModal.generatedLink ? (
                            /* Generated Link Display */
                            <div className="p-4 space-y-4">
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-sm text-green-700 font-medium mb-2">Payment link generated!</p>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={paymentLinkModal.generatedLink}
                                            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono"
                                        />
                                        <button
                                            onClick={copyPaymentLink}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Form */
                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Credit Amount
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={paymentLinkModal.creditAmount}
                                        onChange={(e) => setPaymentLinkModal(prev => ({ ...prev, creditAmount: e.target.value }))}
                                        placeholder="Enter amount"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Plan Name (optional)
                                    </label>
                                    <select
                                        value={paymentLinkModal.planName}
                                        onChange={(e) => setPaymentLinkModal(prev => ({ ...prev, planName: e.target.value }))}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Custom</option>
                                        <option value="Starter">Starter (5,000 credits)</option>
                                        <option value="Pro">Pro (25,000 credits)</option>
                                        <option value="Enterprise">Enterprise (100,000 credits)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Description (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={paymentLinkModal.description}
                                        onChange={(e) => setPaymentLinkModal(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="e.g., Credits for scrape request"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>
                        )}
                        
                        {/* Actions */}
                        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={closePaymentLinkModal}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
                            >
                                {paymentLinkModal.generatedLink ? 'Close' : 'Cancel'}
                            </button>
                            {!paymentLinkModal.generatedLink && (
                                <button
                                    onClick={handleGeneratePaymentLink}
                                    disabled={!paymentLinkModal.creditAmount || paymentLinkModal.submitting}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {paymentLinkModal.submitting ? 'Generating...' : 'Generate Link'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

