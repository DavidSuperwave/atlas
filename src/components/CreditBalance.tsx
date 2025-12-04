'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface CreditBalanceProps {
    compact?: boolean;
}

export default function CreditBalance({ compact = false }: CreditBalanceProps) {
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        fetchBalance();
    }, []);

    async function fetchBalance() {
        try {
            const res = await fetch('/api/credits/balance');
            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
                setIsAdmin(data.is_admin);
            }
        } catch (error) {
            console.error('Error fetching credit balance:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className={`${compact ? 'px-2.5 py-1.5' : 'p-4'} animate-pulse`}>
                <div className="h-4 bg-zinc-800 rounded w-16"></div>
            </div>
        );
    }

    if (balance === null) {
        return null; // Not logged in or error
    }

    const costPerThousand = 1; // $1 per 1000 credits
    const dollarValue = (balance / 1000) * costPerThousand;

    if (compact) {
        return (
            <Link 
                href="/credits"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 transition-colors"
            >
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium text-zinc-200">{balance.toLocaleString()}</span>
            </Link>
        );
    }

    return (
        <div className="bg-zinc-900/80 rounded-xl border border-zinc-800/50 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-zinc-100">Credit Balance</h3>
                {isAdmin && (
                    <Link 
                        href="/admin/credits"
                        className="text-[10px] px-2 py-1 bg-amber-500/10 text-amber-400 rounded font-medium"
                    >
                        Admin
                    </Link>
                )}
            </div>
            
            <div className="space-y-4">
                <div>
                    <div className="text-3xl font-bold text-white mb-1">
                        {balance.toLocaleString()}
                    </div>
                    <div className="text-sm text-zinc-500">
                        credits available
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-800/50">
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-500">Value</span>
                        <span className="text-emerald-400 font-medium">${dollarValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-zinc-500">Rate</span>
                        <span className="text-zinc-300">$1 per 1,000</span>
                    </div>
                </div>

                <div className="pt-4">
                    <Link
                        href="/credits"
                        className="block w-full text-center py-2 px-4 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-200 rounded-lg transition-colors text-sm font-medium border border-zinc-700/50"
                    >
                        View History
                    </Link>
                </div>
            </div>
        </div>
    );
}
