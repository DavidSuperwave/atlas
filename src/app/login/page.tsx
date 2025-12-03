'use client';

import AuthModal from '@/components/AuthModal';

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Abstract gradient background */}
            <div className="absolute inset-0 bg-black">
                {/* Blue-green gradient orbs */}
                <div className="absolute top-1/4 -left-32 w-96 h-96 bg-gradient-to-br from-blue-600 via-cyan-500 to-teal-400 rounded-full blur-3xl opacity-50 animate-pulse" />
                <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-gradient-to-tl from-blue-700 via-indigo-600 to-purple-500 rounded-full blur-3xl opacity-40" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/30 via-cyan-400/20 to-emerald-500/30 rounded-full blur-3xl opacity-30" />
                
                {/* Curved light streaks */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-0 right-0 w-[800px] h-[800px] opacity-60">
                        <svg viewBox="0 0 800 800" className="w-full h-full">
                            <defs>
                                <linearGradient id="streak1" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                                    <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.6" />
                                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.3" />
                                </linearGradient>
                                <linearGradient id="streak2" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" />
                                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.3" />
                                </linearGradient>
                            </defs>
                            <path d="M 600 0 Q 400 200 300 400 Q 200 600 400 800" stroke="url(#streak1)" strokeWidth="3" fill="none" />
                            <path d="M 700 0 Q 500 200 400 400 Q 300 600 500 800" stroke="url(#streak2)" strokeWidth="2" fill="none" />
                            <path d="M 500 0 Q 300 200 200 400 Q 100 600 300 800" stroke="url(#streak1)" strokeWidth="1.5" fill="none" opacity="0.5" />
                        </svg>
                    </div>
                    <div className="absolute bottom-0 left-0 w-[600px] h-[600px] opacity-50">
                        <svg viewBox="0 0 600 600" className="w-full h-full">
                            <path d="M 0 400 Q 200 300 300 200 Q 400 100 600 0" stroke="url(#streak1)" strokeWidth="2" fill="none" />
                            <path d="M 0 500 Q 200 400 300 300 Q 400 200 600 100" stroke="url(#streak2)" strokeWidth="1.5" fill="none" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Auth modal */}
            <div className="relative z-10 w-full max-w-md">
                <AuthModal defaultMode="signin" />
            </div>
        </div>
    );
}
