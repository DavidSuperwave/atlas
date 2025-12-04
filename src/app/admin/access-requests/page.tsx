'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface AccessRequest {
    id: string;
    name: string;
    email: string;
    intent: string | null;
    telegram_username: string | null;
    wants_immediate_start: boolean;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_by: string | null;
    reviewed_at: string | null;
    invite_id: string | null;
    created_at: string;
}

export default function AccessRequestsPage() {
    const { user, loading: authLoading } = useAuth();
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<string>('pending');
    const [sendingInvite, setSendingInvite] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchRequests = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/access-requests?status=${filter}`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch requests');
                }
                return;
            }
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        if (!authLoading && user) {
            fetchRequests();
        }
    }, [user, authLoading, fetchRequests]);

    async function handleApprove(request: AccessRequest) {
        setSendingInvite(request.id);
        setActionMessage(null);

        try {
            const res = await fetch('/api/admin/invites/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: request.email,
                    accessRequestId: request.id,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || 'Failed to send invite' });
                return;
            }

            setActionMessage({ type: 'success', text: `Invite sent to ${request.email}` });
            fetchRequests();
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Failed to send invite' });
        } finally {
            setSendingInvite(null);
        }
    }

    async function handleReject(request: AccessRequest) {
        setActionMessage(null);

        try {
            const res = await fetch('/api/admin/access-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: request.id,
                    status: 'rejected',
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || 'Failed to reject request' });
                return;
            }

            setActionMessage({ type: 'success', text: `Request from ${request.email} rejected` });
            fetchRequests();
        } catch (err) {
            setActionMessage({ type: 'error', text: 'Failed to reject request' });
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

    function getStatusColor(status: string) {
        switch (status) {
            case 'approved':
                return 'bg-green-100 text-green-700 border-green-200';
            case 'rejected':
                return 'bg-red-100 text-red-700 border-red-200';
            default:
                return 'bg-amber-100 text-amber-700 border-amber-200';
        }
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
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
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
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Link href="/admin" className="hover:text-gray-700">Admin</Link>
                            <span>/</span>
                            <span>Access Requests</span>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">Access Requests</h1>
                        <p className="text-gray-600 mt-1">Review and approve access requests from the landing page</p>
                    </div>
                </div>

                {/* Action Message */}
                {actionMessage && (
                    <div className={`mb-6 p-4 rounded-lg border ${
                        actionMessage.type === 'success' 
                            ? 'bg-green-50 border-green-200 text-green-700' 
                            : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                        {actionMessage.text}
                    </div>
                )}

                {/* Filters */}
                <div className="flex gap-2 mb-6">
                    {['all', 'pending', 'approved', 'rejected'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filter === status
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Requests List */}
                <div className="space-y-4">
                    {requests.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
                            No {filter === 'all' ? '' : filter} requests found
                        </div>
                    ) : (
                        requests.map((request) => (
                            <div
                                key={request.id}
                                className="bg-white rounded-xl border border-gray-200 p-6"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900">
                                                {request.name}
                                            </h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                                                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                                            </span>
                                            {request.wants_immediate_start && (
                                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                                    Wants Immediate Start
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="space-y-1 text-sm text-gray-600">
                                            <p>
                                                <span className="font-medium text-gray-700">Email:</span>{' '}
                                                <a href={`mailto:${request.email}`} className="text-blue-600 hover:underline">
                                                    {request.email}
                                                </a>
                                            </p>
                                            {request.telegram_username && (
                                                <p>
                                                    <span className="font-medium text-gray-700">Telegram:</span>{' '}
                                                    {request.telegram_username}
                                                </p>
                                            )}
                                            {request.intent && (
                                                <div className="mt-3">
                                                    <span className="font-medium text-gray-700">Intent:</span>
                                                    <p className="mt-1 text-gray-600 bg-gray-50 rounded-lg p-3">
                                                        {request.intent}
                                                    </p>
                                                </div>
                                            )}
                                            <p className="text-xs text-gray-400 mt-3">
                                                Submitted {formatDate(request.created_at)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {request.status === 'pending' && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleApprove(request)}
                                                disabled={sendingInvite === request.id}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {sendingInvite === request.id ? 'Sending...' : 'Approve & Invite'}
                                            </button>
                                            <button
                                                onClick={() => handleReject(request)}
                                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

