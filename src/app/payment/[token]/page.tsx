'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface PaymentLink {
    id: string;
    credit_amount: number;
    plan_name: string | null;
    description: string | null;
    status: string;
    expires_at: string;
    paid_at: string | null;
    completed_at: string | null;
}

export default function PaymentPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [link, setLink] = useState<PaymentLink | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        async function fetchLink() {
            try {
                const res = await fetch(`/api/payment/${token}`);
                const data = await res.json();

                if (!res.ok) {
                    setError(data.error || 'Invalid payment link');
                    return;
                }

                setLink(data.link);
            } catch (err) {
                setError('Failed to load payment link');
            } finally {
                setLoading(false);
            }
        }

        fetchLink();
    }, [token]);

    async function handleMarkAsPaid() {
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/payment/${token}/mark-paid`, {
                method: 'POST',
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to mark as paid');
                return;
            }

            setSuccess(true);
            setLink(data.link);
        } catch (err) {
            setError('An error occurred');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    if (error && !link) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="max-w-md w-full">
                    <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Payment Link Invalid</h1>
                        <p className="text-zinc-400 mb-6">{error}</p>
                        <Link
                            href="/"
                            className="inline-block px-6 py-3 bg-white hover:bg-zinc-200 text-black font-semibold rounded-xl transition-colors"
                        >
                            Go to Homepage
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const isExpired = link && new Date(link.expires_at) < new Date();
    const isPending = link?.status === 'pending';
    const isPaid = link?.status === 'paid';
    const isCompleted = link?.status === 'completed';

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            {/* Background gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-emerald-950/20 via-black to-black pointer-events-none" />

            <div className="relative max-w-md w-full">
                <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-800 text-center">
                        <h1 className="text-2xl font-bold text-white mb-2">Credit Purchase</h1>
                        <p className="text-zinc-400 text-sm">Complete your payment to receive credits</p>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {/* Status Banner */}
                        {isExpired && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center">
                                This payment link has expired
                            </div>
                        )}
                        {isPaid && !isCompleted && (
                            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-center">
                                Payment marked as sent. Awaiting admin confirmation.
                            </div>
                        )}
                        {isCompleted && (
                            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-center">
                                Payment confirmed! Credits have been added to your account.
                            </div>
                        )}
                        {success && !isCompleted && (
                            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-center">
                                Thank you! We&apos;ve been notified and will add your credits shortly.
                            </div>
                        )}
                        {error && link && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-center">
                                {error}
                            </div>
                        )}

                        {/* Credit Details */}
                        <div className="text-center mb-8">
                            <div className="text-5xl font-bold text-white mb-2">
                                {link?.credit_amount.toLocaleString()}
                            </div>
                            <div className="text-zinc-400">Credits</div>
                            {link?.plan_name && (
                                <div className="mt-2 inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 text-sm rounded-full">
                                    {link.plan_name} Plan
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        {link?.description && (
                            <div className="mb-6 p-4 bg-zinc-800/50 rounded-xl text-zinc-300 text-sm">
                                {link.description}
                            </div>
                        )}

                        {/* Payment Instructions */}
                        {isPending && !isExpired && (
                            <div className="space-y-4">
                                <div className="p-4 bg-zinc-800/50 rounded-xl">
                                    <h3 className="text-sm font-medium text-white mb-3">Payment Instructions</h3>
                                    <ol className="text-sm text-zinc-400 space-y-2">
                                        <li>1. Send payment to our Telegram: <a href="https://t.me/atlasscraper" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">@atlasscraper</a></li>
                                        <li>2. Include this reference: <code className="bg-zinc-700 px-2 py-0.5 rounded text-emerald-400">{link?.id.slice(0, 8)}</code></li>
                                        <li>3. Click the button below once payment is sent</li>
                                    </ol>
                                </div>

                                <button
                                    onClick={handleMarkAsPaid}
                                    disabled={submitting}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? 'Submitting...' : 'I\'ve Sent Payment'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-zinc-800 text-center">
                        <p className="text-zinc-500 text-xs">
                            Expires: {link && new Date(link.expires_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                {/* Help link */}
                <p className="mt-6 text-center text-zinc-500 text-sm">
                    Need help? Contact us on{' '}
                    <a href="https://t.me/atlasscraper" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">
                        Telegram
                    </a>
                </p>
            </div>
        </div>
    );
}









