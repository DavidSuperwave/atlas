'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';

export default function FloatingCreditBar() {
    const { user } = useAuth();
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchBalance();
            // Poll for updates every 30 seconds
            const interval = setInterval(fetchBalance, 30000);
            return () => clearInterval(interval);
        } else {
            setBalance(null);
            setLoading(false);
        }
    }, [user]);

    async function fetchBalance() {
        try {
            const res = await fetch('/api/credits/balance');
            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
            }
        } catch (error) {
            console.error('Error fetching credit balance:', error);
        } finally {
            setLoading(false);
        }
    }

    // Don't render if not logged in
    if (!user) return null;

    const dollarValue = balance !== null ? (balance / 1000).toFixed(2) : '0.00';

    return (
        <Link
            href="/credits"
            className="fixed bottom-5 left-5 z-40 group"
        >
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl hover:bg-slate-800/80 hover:border-slate-600/50 transition-all duration-300 hover:scale-105">
                {/* Credit icon */}
                <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    {/* Pulse animation */}
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 animate-ping opacity-20" />
                </div>

                {/* Credit info */}
                <div className="flex flex-col">
                    {loading ? (
                        <div className="animate-pulse">
                            <div className="h-5 w-16 bg-slate-700 rounded mb-1" />
                            <div className="h-3 w-12 bg-slate-800 rounded" />
                        </div>
                    ) : (
                        <>
                            <span className="text-white font-bold text-lg leading-tight">
                                {balance?.toLocaleString() ?? 0}
                            </span>
                            <span className="text-slate-400 text-xs">
                                ≈ ${dollarValue}
                            </span>
                        </>
                    )}
                </div>

                {/* Arrow indicator */}
                <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </div>
        </Link>
    );
}


