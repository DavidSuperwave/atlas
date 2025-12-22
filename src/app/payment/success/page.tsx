'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PaymentSuccessPage() {
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch current balance to show updated credits
        async function fetchBalance() {
            try {
                const res = await fetch('/api/credits/balance');
                if (res.ok) {
                    const data = await res.json();
                    setBalance(data.balance);
                }
            } catch (error) {
                console.error('Error fetching balance:', error);
            } finally {
                setLoading(false);
            }
        }

        // Delay fetch slightly to allow webhook to process
        const timer = setTimeout(fetchBalance, 1500);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                {/* Success Icon */}
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-gray-900 mb-3">Payment Successful!</h1>
                <p className="text-gray-500 mb-8">
                    Your credits have been added to your account. You can now start scraping leads!
                </p>

                {/* Balance Card */}
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 mb-8">
                    <div className="text-sm text-gray-500 mb-2">Current Balance</div>
                    {loading ? (
                        <div className="h-12 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-purple-600"></div>
                        </div>
                    ) : balance !== null ? (
                        <div className="text-4xl font-bold text-gray-900">{balance.toLocaleString()}</div>
                    ) : (
                        <div className="text-4xl font-bold text-gray-400">--</div>
                    )}
                    <div className="text-sm text-gray-500 mt-2">credits</div>
                </div>

                {/* Info Note */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
                    <p className="text-blue-700 text-sm">
                        <strong>Note:</strong> If your credits don&apos;t appear immediately, please wait a few moments and refresh. 
                        The payment is processing.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    <Link
                        href="/dashboard"
                        className="block w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
                    >
                        Start Scraping
                    </Link>
                    <Link
                        href="/credits"
                        className="block w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                    >
                        View Credit History
                    </Link>
                </div>

                {/* Support Link */}
                <p className="mt-8 text-gray-500 text-sm">
                    Need help? Contact us on{' '}
                    <a 
                        href="https://t.me/atlasscraper" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-purple-600 hover:text-purple-700"
                    >
                        Telegram
                    </a>
                </p>
            </div>
        </div>
    );
}

