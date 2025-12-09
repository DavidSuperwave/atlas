'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Transaction {
    id: string;
    amount: number;
    type: 'topup' | 'usage' | 'refund';
    description: string | null;
    lead_id: string | null;
    created_at: string;
}

interface PricingPlan {
    name: string;
    credits: number;
    price: number | null;  // null for Enterprise (custom pricing)
    popular?: boolean;
    isEnterprise?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
    { name: 'Starter', credits: 5000, price: 7.50 },
    { name: 'Pro', credits: 25000, price: 32.50, popular: true },
    { name: 'Enterprise', credits: 100000, price: null, isEnterprise: true },
];

export default function CreditsPage() {
    const [balance, setBalance] = useState<number | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState<string>('');
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [orderSubmitting, setOrderSubmitting] = useState(false);
    const [orderMessage, setOrderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        Promise.all([fetchBalance(), fetchTransactions()]).finally(() => setLoading(false));
    }, []);

    async function fetchBalance() {
        try {
            const res = await fetch('/api/credits/balance');
            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
                setEmail(data.email);
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
        }
    }

    async function fetchTransactions() {
        try {
            const res = await fetch('/api/credits/transactions?limit=100');
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        }
    }

    async function handleOrderRequest(plan: PricingPlan) {
        setSelectedPlan(plan.name);
        setOrderSubmitting(true);
        setOrderMessage(null);

        try {
            const res = await fetch('/api/credit-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planName: plan.name,
                    creditsAmount: plan.credits,
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setOrderMessage({ type: 'success', text: 'Credit request submitted! An admin will review your order shortly.' });
            } else {
                setOrderMessage({ type: 'error', text: data.error || 'Failed to submit order' });
            }
        } catch (error) {
            setOrderMessage({ type: 'error', text: 'Failed to submit order' });
        } finally {
            setOrderSubmitting(false);
            setSelectedPlan(null);
        }
    }

    function formatDate(dateString: string) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    if (balance === null) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-4">Please sign in</h2>
                    <Link href="/login" className="text-zinc-400 hover:text-white">
                        Go to login
                    </Link>
                </div>
            </div>
        );
    }

    const totalUsage = transactions.filter(t => t.type === 'usage').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalTopups = transactions.filter(t => t.type === 'topup').reduce((sum, t) => sum + t.amount, 0);
    
    // Filter to only show topup transactions
    const topupTransactions = transactions.filter(t => t.type === 'topup');

    return (
        <div className="min-h-screen bg-black p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/dashboard" className="text-zinc-500 hover:text-white text-sm mb-2 inline-block transition-colors">
                            ← Back to Dashboard
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Credits</h1>
                        <p className="text-zinc-500 mt-1">{email}</p>
                    </div>
                </div>

                {/* Order Message */}
                {orderMessage && (
                    <div className={`mb-6 p-4 rounded-lg border ${
                        orderMessage.type === 'success' 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                        {orderMessage.text}
                    </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    {/* Current Balance */}
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                        <div className="text-sm text-zinc-500 mb-2">Current Balance</div>
                        <div className="text-4xl font-bold text-white">{balance.toLocaleString()}</div>
                        <div className="text-sm text-zinc-500 mt-2">credits</div>
                    </div>

                    {/* Total Used */}
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                        <div className="text-sm text-zinc-500 mb-2">Total Used</div>
                        <div className="text-4xl font-bold text-white">{totalUsage.toLocaleString()}</div>
                        <div className="text-sm text-zinc-500 mt-2">credits</div>
                    </div>

                    {/* Total Purchased */}
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                        <div className="text-sm text-zinc-500 mb-2">Total Purchased</div>
                        <div className="text-4xl font-bold text-white">{totalTopups.toLocaleString()}</div>
                        <div className="text-sm text-zinc-500 mt-2">credits</div>
                    </div>
                </div>

                {/* Pricing Plans */}
                <div className="mb-10">
                    <h3 className="text-xl font-semibold text-white mb-6">Purchase Credits</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {PRICING_PLANS.map((plan) => (
                            <div 
                                key={plan.name}
                                className={`relative bg-zinc-900 rounded-xl border p-6 transition-all ${
                                    plan.popular 
                                        ? 'border-white' 
                                        : 'border-zinc-800 hover:border-zinc-700'
                                }`}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="px-3 py-1 bg-white text-black text-xs font-semibold rounded-full">
                                            Most Popular
                                        </span>
                                    </div>
                                )}
                                <div className="text-center mb-6">
                                    <h4 className="text-lg font-semibold text-white mb-2">{plan.name}</h4>
                                    <div className="text-4xl font-bold text-white mb-1">
                                        {plan.credits.toLocaleString()}
                                    </div>
                                    <div className="text-zinc-500 text-sm">credits</div>
                                </div>
                                <div className="text-center mb-6">
                                    {plan.isEnterprise ? (
                                        <div>
                                            <span className="text-lg text-zinc-400">As low as</span>
                                            <span className="text-2xl font-bold text-white ml-2">$0.50</span>
                                            <span className="text-zinc-400">/credit</span>
                                        </div>
                                    ) : (
                                        <span className="text-2xl font-bold text-white">${plan.price}</span>
                                    )}
                                </div>
                                {plan.isEnterprise ? (
                                    <a
                                        href="https://t.me/atlasscraper"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 px-4 rounded-lg font-semibold transition-all bg-blue-600 text-white hover:bg-blue-500 block text-center"
                                    >
                                        Contact @atlasscraper
                                    </a>
                                ) : (
                                    <button
                                        onClick={() => handleOrderRequest(plan)}
                                        disabled={orderSubmitting && selectedPlan === plan.name}
                                        className={`w-full py-3 px-4 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                            plan.popular
                                                ? 'bg-white text-black hover:bg-zinc-200'
                                                : 'bg-zinc-800 text-white hover:bg-zinc-700'
                                        }`}
                                    >
                                        {orderSubmitting && selectedPlan === plan.name ? 'Submitting...' : 'Request Credits'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className="text-zinc-600 text-sm text-center mt-4">
                        After submitting, an admin will process your order and add credits to your account.
                    </p>
                </div>

                {/* Transaction History */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                    <div className="p-6 border-b border-zinc-800">
                        <h3 className="text-lg font-semibold text-white">Credit History</h3>
                        <p className="text-zinc-500 text-sm mt-1">Credits added to your account</p>
                    </div>
                    
                    {topupTransactions.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-zinc-500">No credit purchases yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800">
                            {topupTransactions.map((tx) => (
                                <div key={tx.id} className="p-4 flex items-center gap-4 hover:bg-zinc-800/50 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-medium truncate">
                                            {tx.description || 'Credit Top-up'}
                                        </div>
                                        <div className="text-zinc-500 text-sm">
                                            {formatDate(tx.created_at)}
                                        </div>
                                    </div>
                                    <div className="text-lg font-semibold text-emerald-400">
                                        +{tx.amount.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
