'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface Invite {
    id: string;
    email: string;
    token: string;
    invited_by: string;
    invited_by_email: string | null;
    used_at: string | null;
    expires_at: string;
    created_at: string;
}

export default function InvitesPage() {
    const { user, loading: authLoading } = useAuth();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sendingInvite, setSendingInvite] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [sendError, setSendError] = useState('');
    const [sendSuccess, setSendSuccess] = useState('');
    const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

    const fetchInvites = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/invites');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch invites');
                }
                return;
            }
            const data = await res.json();
            setInvites(data.invites || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user) {
            fetchInvites();
        }
    }, [user, authLoading, fetchInvites]);

    async function handleSendInvite(e: React.FormEvent) {
        e.preventDefault();
        setSendError('');
        setSendSuccess('');
        setSendingInvite(true);

        try {
            const res = await fetch('/api/admin/invites/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail }),
            });

            const data = await res.json();

            if (!res.ok) {
                setSendError(data.error || 'Failed to send invite');
                return;
            }

            setSendSuccess(`Invite sent to ${newEmail}`);
            setNewEmail('');
            fetchInvites();
        } catch (err) {
            setSendError('Failed to send invite');
        } finally {
            setSendingInvite(false);
        }
    }

    async function handleResendInvite(inviteId: string) {
        setSendError('');
        setSendSuccess('');
        setResendingInviteId(inviteId);

        try {
            const res = await fetch('/api/admin/invites/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId }),
            });

            const data = await res.json();

            if (!res.ok) {
                setSendError(data.error || 'Failed to resend invite');
                return;
            }

            setSendSuccess(`Invite resent to ${data.invite.email}`);
            fetchInvites();
        } catch (err) {
            setSendError('Failed to resend invite');
        } finally {
            setResendingInviteId(null);
        }
    }

    function canResend(invite: Invite): boolean {
        // Can resend if invite is not used (pending or expired)
        return !invite.used_at;
    }

    function getInviteStatus(invite: Invite): { label: string; color: string } {
        if (invite.used_at) {
            return { label: 'Used', color: 'bg-green-100 text-green-700 border-green-200' };
        }
        if (new Date(invite.expires_at) < new Date()) {
            return { label: 'Expired', color: 'bg-gray-100 text-gray-600 border-gray-200' };
        }
        return { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' };
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

    const pendingCount = invites.filter(i => !i.used_at && new Date(i.expires_at) >= new Date()).length;
    const usedCount = invites.filter(i => i.used_at).length;
    const expiredCount = invites.filter(i => !i.used_at && new Date(i.expires_at) < new Date()).length;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Link href="/admin" className="hover:text-gray-700">Admin</Link>
                            <span>/</span>
                            <span>Invites</span>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">Invite Management</h1>
                        <p className="text-gray-600 mt-1">Send and manage user invitations</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Pending</p>
                                <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Used</p>
                                <p className="text-2xl font-bold text-gray-900">{usedCount}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Expired</p>
                                <p className="text-2xl font-bold text-gray-900">{expiredCount}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Send Invite Form */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Send New Invite</h2>
                    
                    {sendError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {sendError}
                        </div>
                    )}
                    
                    {sendSuccess && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                            {sendSuccess}
                        </div>
                    )}

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

                {/* Invites Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-900">All Invites</h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invited By</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {invites.map((invite) => {
                                    const status = getInviteStatus(invite);
                                    return (
                                        <tr key={invite.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">{invite.email}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {invite.invited_by_email || 'Unknown'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {formatDate(invite.created_at)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {invite.used_at ? formatDate(invite.used_at) : formatDate(invite.expires_at)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {canResend(invite) && (
                                                    <button
                                                        onClick={() => handleResendInvite(invite.id)}
                                                        disabled={resendingInviteId === invite.id}
                                                        className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                    >
                                                        {resendingInviteId === invite.id ? (
                                                            <>
                                                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                </svg>
                                                                Resending...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                </svg>
                                                                Resend
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                                {!canResend(invite) && (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {invites.length === 0 && (
                        <div className="p-12 text-center text-gray-500">
                            No invites sent yet
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

