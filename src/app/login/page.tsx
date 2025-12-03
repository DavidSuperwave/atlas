'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/supabase-client';

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/dashboard';
    const inviteToken = searchParams.get('token');
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await signIn(email, password);
            router.push(redirect);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-black">
            {/* Abstract background */}
            <div className="absolute inset-0">
                {/* Subtle gradient orbs */}
                <div className="absolute top-1/3 -left-48 w-[500px] h-[500px] bg-gradient-to-br from-zinc-800/40 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 -right-48 w-[500px] h-[500px] bg-gradient-to-tl from-zinc-800/30 to-transparent rounded-full blur-3xl" />
                
                {/* Grid pattern overlay */}
                <div 
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                        `,
                        backgroundSize: '60px 60px'
                    }}
                />
            </div>

            {/* Login card */}
            <div className="relative z-10 w-full max-w-md">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block">
                        <div className="w-12 h-12 mx-auto mb-4">
                            <svg
                                viewBox="0 0 100 100"
                                className="w-full h-full text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="50" cy="50" r="45" />
                                <ellipse cx="50" cy="50" rx="45" ry="18" />
                                <ellipse cx="50" cy="50" rx="18" ry="45" />
                            </svg>
                        </div>
                    </Link>
                    <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                        Welcome back
                    </h1>
                    <p className="text-zinc-500 mt-2 text-sm">
                        Sign in to access your dashboard
                    </p>
                </div>

                {/* Form container with glassmorphism */}
                <div className="bg-zinc-900/60 backdrop-blur-xl rounded-2xl border border-zinc-800/50 p-8">
                    {/* Error message */}
                    {error && (
                        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Invite token notice */}
                    {inviteToken && (
                        <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
                            You&apos;ve been invited! Create your account to get started.
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email field */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                required
                                className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                            />
                        </div>

                        {/* Password field */}
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                required
                                className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                            />
                        </div>

                        {/* Submit button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 px-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Signing in...
                                </span>
                            ) : (
                                'Sign in'
                            )}
                        </button>
                    </form>

                    {/* Forgot password link */}
                    <div className="mt-6 text-center">
                        <a href="#" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                            Forgot your password?
                        </a>
                    </div>
                </div>

                {/* Request access link */}
                <div className="mt-8 text-center">
                    <p className="text-zinc-500 text-sm">
                        Don&apos;t have an account?{' '}
                        <Link href="/" className="text-white hover:text-zinc-300 transition-colors underline">
                            Request access
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
