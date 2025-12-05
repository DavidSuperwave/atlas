'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

// Routes where credit bar should be hidden
const PUBLIC_ROUTES = ['/', '/login', '/onboarding', '/invite', '/account-disabled', '/pending-approval'];

export default function FloatingCreditBar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

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

    // Don't render if pathname not yet available (prevents flash on initial load)
    if (!pathname) {
        return null;
    }

    // Hide on public routes - check FIRST to prevent flash
    // This ensures both server and client return null immediately for public routes
    const isPublicRoute = PUBLIC_ROUTES.some(route => 
        route === '/' ? pathname === '/' : pathname.startsWith(route)
    );
    if (isPublicRoute) {
        return null;
    }

    // Don't render until mounted (prevents hydration mismatch for other state)
    if (!mounted) return null;

    // Don't render if not logged in
    if (!user) return null;

    const dollarValue = balance !== null ? (balance / 1000).toFixed(2) : '0.00';

    return (
        <Link
            href="/credits"
            className="fixed bottom-5 left-5 z-40 group"
        >
            <div className="flex items-center gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/50 rounded-xl shadow-xl hover:bg-zinc-800/95 hover:border-zinc-700/50 transition-all duration-200 hover:scale-[1.02]">
                {/* Credit icon */}
                <div className="relative">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                </div>

                {/* Credit info */}
                <div className="flex flex-col">
                    {loading ? (
                        <div className="animate-pulse">
                            <div className="h-5 w-16 bg-zinc-800 rounded mb-1" />
                            <div className="h-3 w-12 bg-zinc-800 rounded" />
                        </div>
                    ) : (
                        <>
                            <span className="text-white font-semibold text-base leading-tight">
                                {balance?.toLocaleString() ?? 0}
                            </span>
                            <span className="text-zinc-500 text-xs">
                                ≈ ${dollarValue}
                            </span>
                        </>
                    )}
                </div>

                {/* Arrow indicator */}
                <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </div>
        </Link>
    );
}
