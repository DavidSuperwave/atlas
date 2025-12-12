'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

export default function ScrapePricingPage() {
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [orderSubmitting, setOrderSubmitting] = useState(false);
    const [orderMessage, setOrderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchBalance().finally(() => setLoading(false));
    }, []);

    async function fetchBalance() {
        try {
            const res = await fetch('/api/credits/balance');
            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
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
                setOrderMessage({ type: 'success', text: 'Credit request submitted! You\'ll receive a payment link shortly.' });
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

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
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
                        <Link href="/scrape-dashboard" className="text-zinc-500 hover:text-white text-sm mb-2 inline-block transition-colors">
                            ← Back to Dashboard
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Buy Credits</h1>
                        <p className="text-zinc-400 mt-1">Purchase credits for verified leads</p>
                    </div>
                    {balance !== null && (
                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2">
                            <div className="text-xs text-zinc-500">Current Balance</div>
                            <div className="text-2xl font-bold text-white">{balance.toLocaleString()}</div>
                        </div>
                    )}
                </div>

                {/* Order Message */}
                {orderMessage && (
                    <div className={`mb-6 p-4 rounded-xl border ${
                        orderMessage.type === 'success' 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                        {orderMessage.text}
                    </div>
                )}

                {/* How Credits Work */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">How Credits Work</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-emerald-400 font-bold">1</span>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-white">Select a Plan</h3>
                                <p className="text-xs text-zinc-500">Choose credits based on your needs</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-emerald-400 font-bold">2</span>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-white">Complete Payment</h3>
                                <p className="text-xs text-zinc-500">You&apos;ll receive a payment link</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-emerald-400 font-bold">3</span>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-white">Use for Leads</h3>
                                <p className="text-xs text-zinc-500">1 credit = 1 verified email</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pricing Plans */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {PRICING_PLANS.map((plan) => (
                        <div 
                            key={plan.name}
                            className={`relative bg-zinc-900/80 rounded-2xl border p-6 transition-all ${
                                plan.popular 
                                    ? 'border-emerald-500' 
                                    : 'border-zinc-800 hover:border-zinc-700'
                            }`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className="px-3 py-1 bg-emerald-500 text-black text-xs font-semibold rounded-full">
                                        Most Popular
                                    </span>
                                </div>
                            )}
                            <div className="text-center mb-6">
                                <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>
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
                                    className="w-full py-3 px-4 rounded-xl font-semibold transition-all bg-blue-600 text-white hover:bg-blue-500 block text-center"
                                >
                                    Contact Us
                                </a>
                            ) : (
                                <button
                                    onClick={() => handleOrderRequest(plan)}
                                    disabled={orderSubmitting && selectedPlan === plan.name}
                                    className={`w-full py-3 px-4 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                        plan.popular
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                            : 'bg-zinc-800 text-white hover:bg-zinc-700'
                                    }`}
                                >
                                    {orderSubmitting && selectedPlan === plan.name ? 'Submitting...' : 'Request Credits'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Info */}
                <div className="text-center">
                    <p className="text-zinc-500 text-sm">
                        After submitting a request, you&apos;ll receive a payment link. Credits are added to your account after payment is confirmed.
                    </p>
                    <p className="text-zinc-600 text-xs mt-2">
                        Only verified emails (valid) are charged. Catch-all emails are included for free.
                    </p>
                </div>
            </div>
        </div>
    );
}




