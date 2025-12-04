'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type OnboardingStep = 1 | 2 | 3 | 'completing' | 'complete';
type CampaignPlatform = 'instantly' | 'plusvibe' | 'smartlead' | null;

interface FormData {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    hasApolloAccount: boolean | null;
    campaignPlatform: CampaignPlatform;
    campaignApiKey: string;
    campaignWorkspaceId: string;
    campaignId: string;
    creditsPlan: string | null;
}

function OnboardingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    
    const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
    const [validating, setValidating] = useState(true);
    const [inviteValid, setInviteValid] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState<FormData>({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        hasApolloAccount: null,
        campaignPlatform: null,
        campaignApiKey: '',
        campaignWorkspaceId: '',
        campaignId: '',
        creditsPlan: null,
    });
    
    const [stepTransition, setStepTransition] = useState(false);

    useEffect(() => {
        if (token) {
            validateToken();
        } else {
            setValidating(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function validateToken() {
        try {
            const res = await fetch(`/api/admin/invites/validate?token=${token}`);
            const data = await res.json();
            
            if (res.ok && data.valid) {
                setInviteValid(true);
                setFormData(prev => ({
                    ...prev,
                    email: data.email,
                    name: data.name || '',
                }));
            } else {
                setError(data.error || 'Invalid or expired invite');
            }
        } catch (err) {
            setError('Failed to validate invite');
        } finally {
            setValidating(false);
        }
    }

    async function handleComplete() {
        setError('');
        
        // Validation for step 1
        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }
        
        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (formData.hasApolloAccount === null) {
            setError('Please select your Apollo account status');
            return;
        }

        setCurrentStep('completing');
        setLoading(true);

        try {
            const res = await fetch('/api/onboarding/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    name: formData.name,
                    password: formData.password,
                    hasApolloAccount: formData.hasApolloAccount,
                    campaignPlatform: formData.campaignPlatform,
                    campaignApiKey: formData.campaignApiKey,
                    campaignWorkspaceId: formData.campaignWorkspaceId,
                    campaignId: formData.campaignId,
                    creditsPlan: formData.creditsPlan,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to complete onboarding');
                setCurrentStep(1);
                return;
            }

            // Save campaign account to localStorage if provided
            if (data.campaignAccount && formData.campaignPlatform && formData.campaignApiKey && formData.campaignId) {
                try {
                    const existingAccounts = localStorage.getItem('campaign_accounts');
                    const accounts = existingAccounts ? JSON.parse(existingAccounts) : [];
                    
                    // Create new account entry
                    const newAccount = {
                        id: `onboarding-${Date.now()}`,
                        name: `${formData.campaignPlatform.charAt(0).toUpperCase() + formData.campaignPlatform.slice(1)} Account`,
                        apiKey: formData.campaignApiKey,
                        workspaceId: formData.campaignWorkspaceId || undefined,
                        platform: formData.campaignPlatform,
                    };
                    
                    accounts.push(newAccount);
                    localStorage.setItem('campaign_accounts', JSON.stringify(accounts));
                } catch (err) {
                    console.error('Failed to save campaign account:', err);
                }
            }

            // Show completion animation for 3 seconds then show final screen
            setTimeout(() => {
                setCurrentStep('complete');
            }, 3000);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
            setCurrentStep(1);
        } finally {
            setLoading(false);
        }
    }

    function handleNext() {
        setError('');
        
        if (currentStep === 1) {
            // Validate step 1
            if (!formData.name.trim()) {
                setError('Name is required');
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                setError('Passwords do not match');
                return;
            }
            if (formData.password.length < 6) {
                setError('Password must be at least 6 characters');
                return;
            }
            if (formData.hasApolloAccount === null) {
                setError('Please select your Apollo account status');
                return;
            }
            // Fade out animation
            setStepTransition(true);
            setTimeout(() => {
                setCurrentStep(2);
                setStepTransition(false);
            }, 200);
        } else if (currentStep === 2) {
            setStepTransition(true);
            setTimeout(() => {
                setCurrentStep(3);
                setStepTransition(false);
            }, 200);
        } else if (currentStep === 3) {
            handleComplete();
        }
    }

    function handleBack() {
        setStepTransition(true);
        setTimeout(() => {
            if (currentStep === 2) setCurrentStep(1);
            if (currentStep === 3) setCurrentStep(2);
            setStepTransition(false);
        }, 200);
    }

    function handleSkip() {
        if (currentStep === 2) setCurrentStep(3);
        if (currentStep === 3) handleComplete();
    }

    if (validating) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                    <p className="text-zinc-400">Validating invite...</p>
                </div>
            </div>
        );
    }

    if (!token || !inviteValid) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Invalid Invite</h1>
                    <p className="text-zinc-400 mb-6">
                        {error || 'This invite link is invalid or has expired.'}
                    </p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
                    >
                        Request Access
                    </Link>
                </div>
            </div>
        );
    }

    // Completing animation
    if (currentStep === 'completing') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="relative mb-8">
                        {/* Animated rings */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-32 h-32 rounded-full border-2 border-white/10 animate-ping" style={{ animationDuration: '2s' }} />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-24 h-24 rounded-full border-2 border-white/20 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.5s' }} />
                        </div>
                        <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                            <svg
                                viewBox="0 0 100 100"
                                className="w-20 h-20 text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="50" cy="50" r="45" />
                                <ellipse cx="50" cy="50" rx="45" ry="18" />
                                <ellipse cx="50" cy="50" rx="18" ry="45" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-3">Welcome to Atlas</h1>
                    <p className="text-zinc-400 text-lg">We are setting up your workspace...</p>
                    <div className="mt-8 flex justify-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0s' }} />
                        <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                </div>
            </div>
        );
    }

    // Completion screen
    if (currentStep === 'complete') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="text-center max-w-lg">
                    <div className="w-20 h-20 mx-auto mb-8 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    
                    <h1 className="text-3xl font-bold text-white mb-3">You're All Set!</h1>
                    <p className="text-zinc-400 text-lg mb-8">
                        Watch this video first while we set up your workspace.
                    </p>

                    {/* Video placeholder */}
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 mb-8">
                        <div className="aspect-video bg-zinc-800 rounded-xl flex items-center justify-center mb-4">
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 bg-white/10 rounded-full flex items-center justify-center">
                                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </div>
                                <p className="text-zinc-500 text-sm">Getting Started Video</p>
                            </div>
                        </div>
                        <p className="text-zinc-500 text-sm">
                            Learn how to use Atlas to find and verify leads.
                        </p>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-8">
                        <p className="text-amber-200 text-sm">
                            <strong>Note:</strong> If your workspace isn't ready in 1 hour, reach out to us on{' '}
                            <a href="#" className="underline hover:text-amber-100">Telegram</a>.
                        </p>
                        <p className="text-amber-200/80 text-xs mt-2">
                            You will be notified when your workspace is ready.
                        </p>
                    </div>

                    <Link
                        href="/login"
                        className="inline-block px-8 py-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
                    >
                        Go to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            {/* Background */}
            <div className="absolute inset-0">
                <div className="absolute top-1/3 -left-48 w-[500px] h-[500px] bg-gradient-to-br from-zinc-800/40 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 -right-48 w-[500px] h-[500px] bg-gradient-to-tl from-zinc-800/30 to-transparent rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-xl">
                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {[1, 2, 3].map((step) => (
                        <div key={step} className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                                currentStep === step 
                                    ? 'bg-white text-black' 
                                    : currentStep > step 
                                        ? 'bg-emerald-500 text-white' 
                                        : 'bg-zinc-800 text-zinc-500'
                            }`}>
                                {currentStep > step ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : step}
                            </div>
                            {step < 3 && (
                                <div className={`w-12 h-0.5 mx-2 ${
                                    currentStep > step ? 'bg-emerald-500' : 'bg-zinc-800'
                                }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className={`bg-zinc-900/60 backdrop-blur-xl rounded-2xl border border-zinc-800/50 p-8 transition-opacity duration-200 ${stepTransition ? 'opacity-0' : 'opacity-100'}`}>
                    {error && (
                        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Step 1: Account Creation */}
                    {currentStep === 1 && (
                        <div className="space-y-6">
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">Create Your Account</h2>
                                <p className="text-zinc-400 text-sm">Set up your Atlas credentials</p>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Your full name"
                                    className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                />
                            </div>

                            {/* Email (read-only) */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    readOnly
                                    className="w-full px-4 py-3 bg-zinc-800/40 border border-zinc-700/50 rounded-xl text-zinc-400 cursor-not-allowed"
                                />
                                <p className="text-xs text-zinc-500 mt-1">
                                    This invite is for {formData.email}
                                </p>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Password <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Create a password (min 6 characters)"
                                    className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                />
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Confirm Password <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="password"
                                    value={formData.confirmPassword}
                                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    placeholder="Confirm your password"
                                    className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                />
                            </div>

                            {/* Apollo Account Selection */}
                            <div className="pt-4 border-t border-zinc-800">
                                <label className="block text-sm font-medium text-zinc-400 mb-3">
                                    Do you have an Apollo account? <span className="text-red-400">*</span>
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, hasApolloAccount: true })}
                                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                                            formData.hasApolloAccount === true
                                                ? 'border-emerald-500 bg-emerald-500/10'
                                                : 'border-zinc-700 hover:border-zinc-600'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                formData.hasApolloAccount === true
                                                    ? 'border-emerald-500 bg-emerald-500'
                                                    : 'border-zinc-600'
                                            }`}>
                                                {formData.hasApolloAccount === true && (
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-white text-sm font-medium">I have an Apollo account</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, hasApolloAccount: false })}
                                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                                            formData.hasApolloAccount === false
                                                ? 'border-amber-500 bg-amber-500/10'
                                                : 'border-zinc-700 hover:border-zinc-600'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                formData.hasApolloAccount === false
                                                    ? 'border-amber-500 bg-amber-500'
                                                    : 'border-zinc-600'
                                            }`}>
                                                {formData.hasApolloAccount === false && (
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-white text-sm font-medium">I don't have one</span>
                                        </div>
                                    </button>
                                </div>
                                <p className="text-xs text-zinc-500 mt-3 flex items-start gap-2">
                                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>We recommend buying a separate Apollo account to keep IP detection low.</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step 2: API Keys Configuration */}
                    {currentStep === 2 && (
                        <div className="space-y-6">
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">Configure API Keys</h2>
                                <p className="text-zinc-400 text-sm">Preset API keys to upload leads to your account</p>
                            </div>

                            {/* Platform Selection */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Select Platform
                                </label>
                                <select
                                    value={formData.campaignPlatform || ''}
                                    onChange={(e) => {
                                        const platform = e.target.value as CampaignPlatform;
                                        setFormData({
                                            ...formData,
                                            campaignPlatform: platform || null,
                                            campaignApiKey: '',
                                            campaignWorkspaceId: '',
                                            campaignId: '',
                                        });
                                    }}
                                    className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                >
                                    <option value="">Select a platform...</option>
                                    <option value="instantly">Instantly</option>
                                    <option value="plusvibe">PlusVibe</option>
                                    <option value="smartlead">Smartlead</option>
                                </select>
                            </div>

                            {/* Conditional Fields Based on Platform */}
                            {formData.campaignPlatform && (
                                <div className="space-y-4 animate-fadeIn">
                                    {/* API Key - Required for all */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            API Key <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="password"
                                            value={formData.campaignApiKey}
                                            onChange={(e) => setFormData({ ...formData, campaignApiKey: e.target.value })}
                                            placeholder={`Enter your ${formData.campaignPlatform.charAt(0).toUpperCase() + formData.campaignPlatform.slice(1)} API key`}
                                            className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                        />
                                    </div>

                                    {/* Workspace ID - Required for PlusVibe only */}
                                    {formData.campaignPlatform === 'plusvibe' && (
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                                Workspace ID <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.campaignWorkspaceId}
                                                onChange={(e) => setFormData({ ...formData, campaignWorkspaceId: e.target.value })}
                                                placeholder="Enter your PlusVibe workspace ID"
                                                className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                            />
                                        </div>
                                    )}

                                    {/* Campaign ID - Required for all */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Campaign ID <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.campaignId}
                                            onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
                                            placeholder={`Enter your ${formData.campaignPlatform.charAt(0).toUpperCase() + formData.campaignPlatform.slice(1)} campaign ID`}
                                            className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                <p className="text-blue-200 text-sm">
                                    <strong>Optional:</strong> You can skip this step and configure API keys later from your dashboard settings.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Credits & Pricing */}
                    {currentStep === 3 && (
                        <div className="space-y-6">
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">Get Enrichment</h2>
                                <p className="text-zinc-400 text-sm">You are given 1000 free enrichment credits with your account</p>
                            </div>

                            {/* Free Credits Banner */}
                            <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/40 rounded-xl p-6 text-center">
                                <div className="text-4xl font-bold text-emerald-400 mb-2">1,000</div>
                                <div className="text-emerald-200 font-medium">Free Enrichment Credits</div>
                                <p className="text-emerald-100/70 text-sm mt-2">
                                    You only pay if your enrichment is valid
                                </p>
                            </div>

                            {/* Pricing Plans Placeholder */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-400">Choose a plan (optional)</h3>
                                
                                {[
                                    { id: 'starter', name: 'Starter', credits: '5,000', price: 'TBD' },
                                    { id: 'pro', name: 'Pro', credits: '25,000', price: 'TBD' },
                                    { id: 'enterprise', name: 'Enterprise', credits: 'Unlimited', price: 'Contact Us' },
                                ].map((plan) => (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, creditsPlan: plan.id })}
                                        className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center justify-between ${
                                            formData.creditsPlan === plan.id
                                                ? 'border-white bg-white/5'
                                                : 'border-zinc-700 hover:border-zinc-600'
                                        }`}
                                    >
                                        <div>
                                            <div className="text-white font-medium">{plan.name}</div>
                                            <div className="text-zinc-400 text-sm">{plan.credits} credits</div>
                                        </div>
                                        <div className="text-zinc-400 text-sm">{plan.price}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-4">
                                <p className="text-zinc-400 text-sm">
                                    <strong className="text-zinc-300">Note:</strong> Credits are only used up if you get are able to verify a lead.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
                        <div>
                            {currentStep > 1 && typeof currentStep === 'number' && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Go Back
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            {(currentStep === 2 || currentStep === 3) && (
                                <button
                                    type="button"
                                    onClick={handleSkip}
                                    className="px-4 py-2 text-zinc-400 hover:text-white transition-colors text-sm"
                                >
                                    Skip
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={loading}
                                className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {currentStep === 3 ? (
                                    loading ? 'Creating...' : 'Complete Setup'
                                ) : (
                                    <>
                                        Continue
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Already have account */}
                <div className="mt-8 text-center">
                    <p className="text-zinc-500 text-sm">
                        Already have an account?{' '}
                        <Link href="/login" className="text-white hover:text-zinc-300 transition-colors underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function OnboardingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        }>
            <OnboardingContent />
        </Suspense>
    );
}

