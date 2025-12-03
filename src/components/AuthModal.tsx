'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signUp, signInWithGoogle, signInWithApple } from '@/lib/supabase-client';

interface AuthModalProps {
    defaultMode?: 'signin' | 'signup';
}

export default function AuthModal({ defaultMode = 'signup' }: AuthModalProps) {
    const router = useRouter();
    const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'signup') {
                if (password.length < 6) {
                    setError('Password must be at least 6 characters');
                    setLoading(false);
                    return;
                }
                const data = await signUp(email, password);
                if (data.user && !data.session) {
                    setSuccess(true);
                } else if (data.session) {
                    router.push('/');
                    router.refresh();
                }
            } else {
                await signIn(email, password);
                router.push('/');
                router.refresh();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setLoading(false);
        }
    }

    async function handleGoogleSignIn() {
        try {
            await signInWithGoogle();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Google sign in failed');
        }
    }

    async function handleAppleSignIn() {
        try {
            await signInWithApple();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Apple sign in failed');
        }
    }

    if (success) {
        return (
            <div className="relative w-full max-w-md mx-auto">
                {/* Background blur effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-3xl" />
                
                <div className="relative p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
                    <p className="text-slate-400 mb-6">
                        We&apos;ve sent a confirmation link to <span className="text-white font-medium">{email}</span>
                    </p>
                    <button
                        onClick={() => setMode('signin')}
                        className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                    >
                        Back to sign in
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full max-w-md mx-auto">
            {/* Glassmorphism container */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/50" />
            
            <div className="relative p-8">
                {/* Tab switcher */}
                <div className="flex justify-center mb-8">
                    <div className="inline-flex bg-slate-800/60 rounded-full p-1">
                        <button
                            onClick={() => setMode('signup')}
                            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                                mode === 'signup'
                                    ? 'bg-slate-700 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Sign up
                        </button>
                        <button
                            onClick={() => setMode('signin')}
                            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                                mode === 'signin'
                                    ? 'bg-slate-700 text-white shadow-lg'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            Sign in
                        </button>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-white mb-6">
                    {mode === 'signup' ? 'Create an account' : 'Welcome back'}
                </h1>

                {/* Error message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name fields (only for signup) */}
                    {mode === 'signup' && (
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="First name"
                                    className="w-full px-4 py-3.5 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                />
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Last name"
                                    className="w-full px-4 py-3.5 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                />
                            </div>
                        </div>
                    )}

                    {/* Email field */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Password field */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 px-4 bg-white text-slate-900 font-semibold rounded-xl hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                            </span>
                        ) : (
                            mode === 'signup' ? 'Create an account' : 'Sign in'
                        )}
                    </button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-slate-700/50" />
                    <span className="text-slate-500 text-sm uppercase tracking-wider">or sign in with</span>
                    <div className="flex-1 h-px bg-slate-700/50" />
                </div>

                {/* Social login buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleGoogleSignIn}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-slate-500/50 transition-all"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                    </button>
                    <button
                        onClick={handleAppleSignIn}
                        className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-slate-800/60 border border-slate-600/50 rounded-xl text-white hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-slate-500/50 transition-all"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                    </button>
                </div>

                {/* Terms */}
                <p className="text-center text-slate-500 text-sm mt-6">
                    By creating an account, you agree to our{' '}
                    <a href="#" className="text-slate-400 hover:text-white transition-colors">Terms & Service</a>
                </p>
            </div>
        </div>
    );
}


