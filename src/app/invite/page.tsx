'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function InviteRedirect() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    useEffect(() => {
        // Redirect to onboarding page with the token
        if (token) {
            router.replace(`/onboarding?token=${token}`);
        } else {
            router.replace('/');
        }
    }, [token, router]);

    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-zinc-400">Redirecting to onboarding...</p>
            </div>
        </div>
    );
}

export default function InvitePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        }>
            <InviteRedirect />
        </Suspense>
    );
}
