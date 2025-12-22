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
    price: number;
    credits: number;
    pricePer1k: number;
    features: string[];
    popular?: boolean;
    isPayAsYouGo?: boolean;
    checkoutUrl?: string;
}

// Whop checkout URLs - these are preset plans created in Whop dashboard
const WHOP_CHECKOUT_URLS: Record<string, string> = {
    Starter: process.env.NEXT_PUBLIC_WHOP_PLAN_STARTER_URL || '',
    Growth: process.env.NEXT_PUBLIC_WHOP_PLAN_GROWTH_URL || '',
    Scale: process.env.NEXT_PUBLIC_WHOP_PLAN_SCALE_URL || '',
    Pro: process.env.NEXT_PUBLIC_WHOP_PLAN_PRO_URL || '',
};

const STANDARD_PLANS: PricingPlan[] = [
    {
        name: 'Starter',
        price: 29,
        credits: 15000,
        pricePer1k: 1.93,
        features: ['15,000 Apollo leads', 'Team management', 'Credit rollover'],
        checkoutUrl: WHOP_CHECKOUT_URLS.Starter,
    },
    {
        name: 'Growth',
        price: 47,
        credits: 25000,
        pricePer1k: 1.88,
        features: ['25,000 Apollo leads', 'Team management', 'Credit rollover'],
        checkoutUrl: WHOP_CHECKOUT_URLS.Growth,
    },
    {
        name: 'Scale',
        price: 97,
        credits: 55000,
        pricePer1k: 1.76,
        features: ['55,000 Apollo leads', 'Team management', 'Credit rollover'],
        popular: true,
        checkoutUrl: WHOP_CHECKOUT_URLS.Scale,
    },
    {
        name: 'Pro',
        price: 199,
        credits: 120000,
        pricePer1k: 1.65,
        features: ['120,000 Apollo leads', 'Team management', 'Credit rollover'],
        checkoutUrl: WHOP_CHECKOUT_URLS.Pro,
    }
];

const PREMIUM_PLANS: PricingPlan[] = [
    {
        name: 'Enterprise',
        price: 499,
        credits: 500000,
        pricePer1k: 1.00,
        features: ['500,000 Credits', 'Get Access To Live Scraper', 'Get leads instantly', 'Only pay for valid leads'],
        isPayAsYouGo: true
    },
    {
        name: 'Ultimate',
        price: 999,
        credits: 1000000,
        pricePer1k: 1.00,
        features: ['1,000,000 Credits', 'Get Access To Live Scraper', 'Get leads instantly', 'Only pay for valid leads'],
        isPayAsYouGo: true
    }
];

export default function CreditsPage() {
    const [balance, setBalance] = useState<number | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState<string>('');
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [orderSubmitting, setOrderSubmitting] = useState(false);
    const [orderMessage, setOrderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [setupType, setSetupType] = useState<'standard' | 'premium'>('standard');
    const [showTelegramModal, setShowTelegramModal] = useState(false);
    const [selectedPremiumPlan, setSelectedPremiumPlan] = useState<PricingPlan | null>(null);

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

    function handleStandardPlanClick(plan: PricingPlan) {
        // Check if Whop checkout URL is configured for this plan
        const checkoutUrl = plan.checkoutUrl;
        
        if (checkoutUrl) {
            // Direct redirect to Whop checkout
            setSelectedPlan(plan.name);
            setOrderMessage({ type: 'success', text: 'Redirecting to checkout...' });
            
            // Small delay to show message before redirect
            setTimeout(() => {
                window.location.href = checkoutUrl;
            }, 300);
        } else {
            // Fallback: show message that checkout is not configured
            setOrderMessage({ 
                type: 'error', 
                text: 'Checkout is currently unavailable. Please try again later or contact support.' 
            });
        }
    }

    function handlePremiumPlanClick(plan: PricingPlan) {
        setSelectedPremiumPlan(plan);
        setShowTelegramModal(true);
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
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (balance === null) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Please sign in</h2>
                    <Link href="/login" className="text-purple-600 hover:text-purple-700">
                        Go to login
                    </Link>
                </div>
            </div>
        );
    }

    const totalUsage = transactions.filter(t => t.type === 'usage').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalTopups = transactions.filter(t => t.type === 'topup').reduce((sum, t) => sum + t.amount, 0);
    const topupTransactions = transactions.filter(t => t.type === 'topup');

    const currentPlans = setupType === 'standard' ? STANDARD_PLANS : PREMIUM_PLANS;

    return (
        <div className="min-h-screen bg-white p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/dashboard" className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block transition-colors">
                            ← Back to Dashboard
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-900">Buy Credits</h1>
                        <p className="text-gray-500 mt-1">Choose a plan that fits your lead generation needs</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-full flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-purple-700 font-semibold">Available Credits: {balance.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Order Message */}
                {orderMessage && (
                    <div className={`mb-6 p-4 rounded-lg border ${
                        orderMessage.type === 'success' 
                            ? 'bg-green-50 border-green-200 text-green-700' 
                            : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                        {orderMessage.text}
                    </div>
                )}

                {/* Main Pricing Section */}
                <div className="mb-12">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
                        
                        {/* Active Plan Indicator */}
                        <div className="inline-block px-4 py-2 bg-gray-100 rounded-full text-gray-600 text-sm font-medium mb-6">
                            No Active Plan
                        </div>

                        {/* Setup Type Toggle */}
                        <div className="flex flex-col items-center gap-3">
                            <div className="flex items-center justify-center gap-2">
                                <button
                                    onClick={() => setSetupType('standard')}
                                    className={`px-6 py-2.5 rounded-full font-semibold transition-all text-sm ${
                                        setupType === 'standard'
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Standard Setup
                                </button>
                                <button
                                    onClick={() => setSetupType('premium')}
                                    className={`px-6 py-2.5 rounded-full font-semibold transition-all text-sm ${
                                        setupType === 'premium'
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Premium Setup
                                </button>
                            </div>
                            {setupType === 'premium' && (
                                <p className="text-purple-600 font-medium text-sm">
                                    Only Pay For Valid Leads (Apollo Account Required)
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Pricing Grid */}
                    <div className={`grid gap-6 ${
                        setupType === 'standard' 
                            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' 
                            : 'grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto'
                    }`}>
                        {currentPlans.map((plan) => (
                            <div 
                                key={plan.name}
                                className={`relative bg-white rounded-2xl border-2 p-6 transition-all hover:shadow-lg ${
                                    plan.popular 
                                        ? 'border-purple-500 shadow-lg shadow-purple-100' 
                                        : 'border-gray-200 hover:border-purple-200'
                                }`}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-full flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            Most Popular
                                        </span>
                                    </div>
                                )}
                                
                                <div className="text-center mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                                </div>

                                <div className="text-center mb-2">
                                    <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                                    <span className="text-gray-500">/{plan.isPayAsYouGo ? 'one-time' : 'month'}</span>
                                </div>

                                <div className="text-center mb-4">
                                    <span className="text-purple-600 font-semibold">{plan.credits.toLocaleString()} Credits</span>
                                </div>

                                <div className="mb-6">
                                    <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-center">
                                        <span className="text-green-700 font-medium">${plan.pricePer1k.toFixed(2)} per 1k leads</span>
                                    </div>
                                </div>

                                <ul className="space-y-3 mb-6">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                                            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                {plan.isPayAsYouGo ? (
                                    <button
                                        onClick={() => handlePremiumPlanClick(plan)}
                                        className="w-full py-3 px-4 rounded-xl font-semibold transition-all bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200"
                                    >
                                        Get Started
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleStandardPlanClick(plan)}
                                        disabled={orderSubmitting && selectedPlan === plan.name}
                                        className={`w-full py-3 px-4 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                            plan.popular
                                                ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200'
                                                : 'bg-purple-600 text-white hover:bg-purple-700'
                                        }`}
                                    >
                                        {orderSubmitting && selectedPlan === plan.name ? 'Processing...' : 'Subscribe'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {setupType === 'premium' && (
                        <p className="text-gray-500 text-sm text-center mt-6">
                            Contact us via Telegram to set up your Apollo account and start scraping.
                        </p>
                    )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                        <div className="text-sm text-gray-500 mb-2">Current Balance</div>
                        <div className="text-4xl font-bold text-gray-900">{balance.toLocaleString()}</div>
                        <div className="text-sm text-gray-500 mt-2">credits</div>
                    </div>

                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                        <div className="text-sm text-gray-500 mb-2">Total Used</div>
                        <div className="text-4xl font-bold text-gray-900">{totalUsage.toLocaleString()}</div>
                        <div className="text-sm text-gray-500 mt-2">credits</div>
                    </div>

                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                        <div className="text-sm text-gray-500 mb-2">Total Purchased</div>
                        <div className="text-4xl font-bold text-gray-900">{totalTopups.toLocaleString()}</div>
                        <div className="text-sm text-gray-500 mt-2">credits</div>
                    </div>
                </div>

                {/* Transaction History */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Credit History</h3>
                        <p className="text-gray-500 text-sm mt-1">Credits added to your account</p>
                    </div>
                    
                    {topupTransactions.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-gray-500">No credit purchases yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {topupTransactions.map((tx) => (
                                <div key={tx.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-gray-900 font-medium truncate">
                                            {tx.description || 'Credit Top-up'}
                                        </div>
                                        <div className="text-gray-500 text-sm">
                                            {formatDate(tx.created_at)}
                                        </div>
                                    </div>
                                    <div className="text-lg font-semibold text-green-600">
                                        +{tx.amount.toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Telegram Contact Modal */}
            {showTelegramModal && selectedPremiumPlan && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full shadow-2xl">
                        <div className="text-center mb-4">
                            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Premium Plan Setup
                            </h3>
                            <p className="text-gray-500 text-sm">
                                {selectedPremiumPlan.name} - ${selectedPremiumPlan.price}
                            </p>
                        </div>
                        
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
                            <p className="text-purple-800 text-sm">
                                Premium plans require your own Apollo account for pay-as-you-go scraping. 
                                Contact us via Telegram to complete the setup and billing process.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <a
                                href={`https://t.me/atlasscraper?text=${encodeURIComponent(
                                    `Hi! I'm interested in the ${selectedPremiumPlan.name} Premium plan ($${selectedPremiumPlan.price}). I'd like to set up my Apollo account and complete the purchase.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-3 px-4 rounded-xl font-semibold transition-all bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                                </svg>
                                Contact on Telegram
                            </a>
                            <button
                                onClick={() => {
                                    setShowTelegramModal(false);
                                    setSelectedPremiumPlan(null);
                                }}
                                className="w-full py-3 px-4 rounded-xl font-semibold transition-all bg-gray-100 hover:bg-gray-200 text-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
