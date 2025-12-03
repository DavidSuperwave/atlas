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

export default function CreditsPage() {
    const [balance, setBalance] = useState<number | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState<string>('');

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

    function getTypeIcon(type: string) {
        switch (type) {
            case 'topup':
                return (
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                    </div>
                );
            case 'usage':
                return (
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                );
            case 'refund':
                return (
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </div>
                );
            default:
                return null;
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
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    if (balance === null) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-4">Please sign in</h2>
                    <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
                        Go to login
                    </Link>
                </div>
            </div>
        );
    }

    const dollarValue = (balance / 1000);
    const totalUsage = transactions.filter(t => t.type === 'usage').reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalTopups = transactions.filter(t => t.type === 'topup').reduce((sum, t) => sum + t.amount, 0);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link href="/" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
                            ← Back to Dashboard
                        </Link>
                        <h1 className="text-3xl font-bold text-white">Credits</h1>
                        <p className="text-slate-400 mt-1">{email}</p>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Current Balance */}
                    <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl border border-emerald-500/30 p-6">
                        <div className="text-sm text-emerald-300 mb-2">Current Balance</div>
                        <div className="text-4xl font-bold text-white">{balance.toLocaleString()}</div>
                        <div className="text-sm text-emerald-300 mt-2">≈ ${dollarValue.toFixed(2)}</div>
                    </div>

                    {/* Total Used */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                        <div className="text-sm text-slate-400 mb-2">Total Used</div>
                        <div className="text-4xl font-bold text-white">{totalUsage.toLocaleString()}</div>
                        <div className="text-sm text-slate-400 mt-2">credits</div>
                    </div>

                    {/* Total Purchased */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                        <div className="text-sm text-slate-400 mb-2">Total Purchased</div>
                        <div className="text-4xl font-bold text-white">{totalTopups.toLocaleString()}</div>
                        <div className="text-sm text-slate-400 mt-2">credits</div>
                    </div>
                </div>

                {/* Pricing Info */}
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-6 mb-8">
                    <h3 className="text-lg font-semibold text-white mb-4">Pricing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-white font-medium">$1 per 1,000 credits</div>
                                <div className="text-slate-400 text-sm">$0.001 per successful enrichment</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-white font-medium">Pay only for success</div>
                                <div className="text-slate-400 text-sm">Credits deducted only for valid emails</div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                        <p className="text-slate-400 text-sm">
                            Contact an administrator to purchase credits. Credits are added manually to your account.
                        </p>
                    </div>
                </div>

                {/* Transaction History */}
                <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                    <div className="p-6 border-b border-slate-700/50">
                        <h3 className="text-lg font-semibold text-white">Transaction History</h3>
                    </div>
                    
                    {transactions.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-slate-400">No transactions yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-700/50">
                            {transactions.map((tx) => (
                                <div key={tx.id} className="p-4 flex items-center gap-4 hover:bg-slate-700/20 transition-colors">
                                    {getTypeIcon(tx.type)}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-medium truncate">
                                            {tx.description || tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                                        </div>
                                        <div className="text-slate-400 text-sm">
                                            {formatDate(tx.created_at)}
                                        </div>
                                    </div>
                                    <div className={`text-lg font-semibold ${tx.amount > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
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


