'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/supabase-client';

export default function AccountDisabledPage() {
    const router = useRouter();

    async function handleSignOut() {
        await signOut();
        router.push('/login');
        router.refresh();
    }

    // Prevent navigation away from this page while disabled
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Just a safeguard, actual blocking is done by middleware
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            {/* Background effects */}
            <div className="absolute inset-0">
                <div className="absolute top-1/3 -left-48 w-[500px] h-[500px] bg-gradient-to-br from-red-900/20 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 -right-48 w-[500px] h-[500px] bg-gradient-to-tl from-red-900/10 to-transparent rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md text-center">
                {/* Icon */}
                <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-white mb-4">
                    Account Disabled
                </h1>

                {/* Message */}
                <div className="bg-zinc-900/60 backdrop-blur-xl rounded-2xl border border-zinc-800/50 p-6 mb-6">
                    <p className="text-zinc-400 mb-4">
                        Your account has been disabled by an administrator. 
                        You no longer have access to this application.
                    </p>
                    <p className="text-zinc-500 text-sm">
                        If you believe this is a mistake or would like to appeal this decision, 
                        please contact support.
                    </p>
                </div>

                {/* Contact info */}
                <div className="bg-zinc-900/40 rounded-xl border border-zinc-800/30 p-4 mb-6">
                    <p className="text-zinc-500 text-sm mb-2">Need help?</p>
                    <p className="text-zinc-300 text-sm">
                        Contact the administrator for assistance.
                    </p>
                </div>

                {/* Sign out button */}
                <button
                    onClick={handleSignOut}
                    className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}

