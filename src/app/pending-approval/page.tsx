'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/supabase-client';

export default function PendingApprovalPage() {
    const router = useRouter();

    async function handleSignOut() {
        await signOut();
        router.push('/login');
        router.refresh();
    }

    // Prevent navigation away from this page while pending
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Just a safeguard, actual blocking is done by middleware
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            {/* Background effects */}
            <div className="absolute inset-0">
                <div className="absolute top-1/3 -left-48 w-[500px] h-[500px] bg-gradient-to-br from-amber-900/20 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 -right-48 w-[500px] h-[500px] bg-gradient-to-tl from-amber-900/10 to-transparent rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-md text-center">
                {/* Icon - Clock/Pending */}
                <div className="w-20 h-20 mx-auto mb-6 bg-amber-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-white mb-4">
                    Account Pending Approval
                </h1>

                {/* Message */}
                <div className="bg-zinc-900/60 backdrop-blur-xl rounded-2xl border border-zinc-800/50 p-6 mb-6">
                    <p className="text-zinc-400 mb-4">
                        Your account has been created successfully! We&apos;re currently setting up your workspace.
                    </p>
                    <p className="text-zinc-500 text-sm">
                        You will receive an email notification when your workspace is ready and you can start using Atlas.
                    </p>
                </div>

                {/* Info box */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-left">
                            <p className="text-amber-200 text-sm font-medium mb-1">
                                What happens next?
                            </p>
                            <ul className="text-amber-200/80 text-xs space-y-1">
                                <li>• Our team will review your account</li>
                                <li>• Your workspace will be configured</li>
                                <li>• You&apos;ll receive an email when ready</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Contact info */}
                <div className="bg-zinc-900/40 rounded-xl border border-zinc-800/30 p-4 mb-6">
                    <p className="text-zinc-500 text-sm mb-2">Taking longer than expected?</p>
                    <p className="text-zinc-300 text-sm">
                        Reach out to us on <a href="#" className="text-white underline hover:text-zinc-300">Telegram</a> if you haven&apos;t heard back within 24 hours.
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

