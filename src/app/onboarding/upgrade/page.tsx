'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

type OnboardingStep = 1 | 2 | 3 | 'completing' | 'complete';
type CampaignPlatform = 'instantly' | 'plusvibe' | 'smartlead' | null;

interface FormData {
    name: string;
    hasApolloAccount: boolean | null;
    campaignPlatform: CampaignPlatform;
    campaignApiKey: string;
    campaignWorkspaceId: string;
    campaignId: string;
    creditsPlan: string | null;
}

export default function UpgradePage() {
    const router = useRouter();
    const { user, profile, loading: authLoading } = useAuth();
    
    const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [canUpgrade, setCanUpgrade] = useState(false);
    const [checkingUpgrade, setCheckingUpgrade] = useState(true);
    
    const [formData, setFormData] = useState<FormData>({
        name: '',
        hasApolloAccount: null,
        campaignPlatform: null,
        campaignApiKey: '',
        campaignWorkspaceId: '',
        campaignId: '',
        creditsPlan: null,
    });
    
    const [stepTransition, setStepTransition] = useState(false);

    // Check if user can upgrade
    useEffect(() => {
        async function checkUpgradeStatus() {
            if (authLoading) return;
            
            if (!user) {
                router.push('/login');
                return;
            }

            try {
                const res = await fetch('/api/onboarding/upgrade');
                const data = await res.json();
                
                if (res.ok && data.canUpgrade) {
                    setCanUpgrade(true);
                    setFormData(prev => ({
                        ...prev,
                        name: data.name || '',
                    }));
                } else {
                    // User can't upgrade - redirect to appropriate dashboard
                    router.push(data.accountType === 'full' ? '/dashboard' : '/scrape-dashboard');
                }
            } catch (err) {
                setError('Failed to check upgrade status');
            } finally {
                setCheckingUpgrade(false);
            }
        }
        
        checkUpgradeStatus();
    }, [user, authLoading, router]);

    async function handleComplete() {
        setError('');
        
        if (!formData.name.trim()) {
            setError('Name is required');
            return;
        }

        if (formData.hasApolloAccount === null) {
            setError('Please select your Apollo account status');
            return;
        }

        setCurrentStep('completing');
        setLoading(true);

        try {
            const res = await fetch('/api/onboarding/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
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
                setError(data.error || 'Failed to complete upgrade');
                setCurrentStep(1);
                return;
            }

            // Save campaign account to localStorage if provided
            if (data.campaignAccount && formData.campaignPlatform && formData.campaignApiKey && formData.campaignId) {
                try {
                    const existingAccounts = localStorage.getItem('campaign_accounts');
                    const accounts = existingAccounts ? JSON.parse(existingAccounts) : [];
                    
                    const newAccount = {
                        id: `upgrade-${Date.now()}`,
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

            setTimeout(() => {
                setCurrentStep('complete');
            }, 3000);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to complete upgrade');
            setCurrentStep(1);
        } finally {
            setLoading(false);
        }
    }

    function handleNext() {
        setError('');
        
        if (currentStep === 1) {
            if (!formData.name.trim()) {
                setError('Name is required');
                return;
            }
            if (formData.hasApolloAccount === null) {
                setError('Please select your Apollo account status');
                return;
            }
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
        }
    }

    function handleBack() {
        if (currentStep === 2) {
            setStepTransition(true);
            setTimeout(() => {
                setCurrentStep(1);
                setStepTransition(false);
            }, 200);
        } else if (currentStep === 3) {
            setStepTransition(true);
            setTimeout(() => {
                setCurrentStep(2);
                setStepTransition(false);
            }, 200);
        }
    }

    if (authLoading || checkingUpgrade) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!canUpgrade) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-4">Unable to Upgrade</h1>
                    <p className="text-zinc-400 mb-6">
                        {error || 'Your account type does not support upgrading.'}
                    </p>
                    <Link
                        href="/scrape-dashboard"
                        className="inline-block px-6 py-3 bg-white hover:bg-zinc-200 text-black font-semibold rounded-xl transition-colors"
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    // Completing animation
    if (currentStep === 'completing') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="relative w-24 h-24 mx-auto mb-8">
                        <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-ping"></div>
                        <div className="absolute inset-0 rounded-full bg-emerald-500/10 flex items-center justify-center animate-pulse">
                            <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Upgrading Your Account...</h2>
                    <p className="text-zinc-400">Please wait while we set up your full account</p>
                </div>
            </div>
        );
    }

    // Complete screen
    if (currentStep === 'complete') {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-4">Account Upgraded!</h1>
                    <p className="text-zinc-400 mb-8">
                        Your account is now pending admin approval. You&apos;ll receive access to the full app soon.
                    </p>
                    <Link
                        href="/dashboard"
                        className="inline-block px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
                    >
                        Go to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-gradient-to-br from-emerald-950/30 via-black to-black pointer-events-none" />
            
            <div className="relative max-w-lg w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Upgrade to Full App</h1>
                    <p className="text-zinc-400">Complete your profile to access all features</p>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    {[1, 2, 3].map((step) => (
                        <div key={step} className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                                step === currentStep 
                                    ? 'bg-emerald-500 text-black' 
                                    : step < (typeof currentStep === 'number' ? currentStep : 99)
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'bg-zinc-800 text-zinc-500'
                            }`}>
                                {step < (typeof currentStep === 'number' ? currentStep : 99) ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                ) : step}
                            </div>
                            {step < 3 && (
                                <div className={`w-12 h-1 mx-2 rounded ${
                                    step < (typeof currentStep === 'number' ? currentStep : 99) 
                                        ? 'bg-emerald-500/50' 
                                        : 'bg-zinc-800'
                                }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Form Content */}
                <div className={`bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 transition-opacity duration-200 ${stepTransition ? 'opacity-50' : 'opacity-100'}`}>
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Step 1: Profile Info */}
                    {currentStep === 1 && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-semibold text-white">Your Profile</h2>
                            
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">Your Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Enter your name"
                                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">Email</label>
                                <div className="px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-400">
                                    {profile?.email}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-3">Do you have an Apollo.io account?</label>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { value: true, label: 'Yes' },
                                        { value: false, label: 'No' },
                                    ].map((option) => (
                                        <button
                                            key={String(option.value)}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, hasApolloAccount: option.value }))}
                                            className={`p-4 rounded-xl border transition-all ${
                                                formData.hasApolloAccount === option.value
                                                    ? 'border-emerald-500 bg-emerald-500/10'
                                                    : 'border-zinc-700 hover:border-zinc-600'
                                            }`}
                                        >
                                            <span className="text-white font-medium">{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleNext}
                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
                            >
                                Continue
                            </button>
                        </div>
                    )}

                    {/* Step 2: Campaign Platform */}
                    {currentStep === 2 && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-semibold text-white">Campaign Platform (Optional)</h2>
                            <p className="text-zinc-400 text-sm">Connect your email campaign platform for seamless lead export</p>
                            
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { value: 'instantly' as CampaignPlatform, label: 'Instantly' },
                                    { value: 'plusvibe' as CampaignPlatform, label: 'PlusVibe' },
                                    { value: 'smartlead' as CampaignPlatform, label: 'SmartLead' },
                                ].map((platform) => (
                                    <button
                                        key={platform.value}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, campaignPlatform: prev.campaignPlatform === platform.value ? null : platform.value }))}
                                        className={`p-4 rounded-xl border transition-all ${
                                            formData.campaignPlatform === platform.value
                                                ? 'border-emerald-500 bg-emerald-500/10'
                                                : 'border-zinc-700 hover:border-zinc-600'
                                        }`}
                                    >
                                        <span className="text-white font-medium">{platform.label}</span>
                                    </button>
                                ))}
                            </div>

                            {formData.campaignPlatform && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">API Key</label>
                                        <input
                                            type="password"
                                            value={formData.campaignApiKey}
                                            onChange={(e) => setFormData(prev => ({ ...prev, campaignApiKey: e.target.value }))}
                                            placeholder="Enter API key"
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">Campaign ID</label>
                                        <input
                                            type="text"
                                            value={formData.campaignId}
                                            onChange={(e) => setFormData(prev => ({ ...prev, campaignId: e.target.value }))}
                                            placeholder="Enter campaign ID"
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button
                                    onClick={handleBack}
                                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleNext}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
                                >
                                    {formData.campaignPlatform ? 'Continue' : 'Skip'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Credit Plan */}
                    {currentStep === 3 && (
                        <div className="space-y-6">
                            <h2 className="text-xl font-semibold text-white">Select a Credit Plan (Optional)</h2>
                            <p className="text-zinc-400 text-sm">Choose a plan to get started with more credits</p>
                            
                            <div className="space-y-3">
                                {[
                                    { value: 'starter', label: 'Starter', credits: '5,000 credits' },
                                    { value: 'pro', label: 'Pro', credits: '25,000 credits' },
                                    { value: 'enterprise', label: 'Enterprise', credits: '100,000 credits' },
                                ].map((plan) => (
                                    <button
                                        key={plan.value}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, creditsPlan: prev.creditsPlan === plan.value ? null : plan.value }))}
                                        className={`w-full p-4 rounded-xl border transition-all text-left ${
                                            formData.creditsPlan === plan.value
                                                ? 'border-emerald-500 bg-emerald-500/10'
                                                : 'border-zinc-700 hover:border-zinc-600'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="text-white font-medium">{plan.label}</span>
                                            <span className="text-zinc-400 text-sm">{plan.credits}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={handleBack}
                                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={loading}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
                                >
                                    {loading ? 'Upgrading...' : 'Complete Upgrade'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Cancel Link */}
                <div className="mt-6 text-center">
                    <Link href="/scrape-dashboard" className="text-zinc-500 hover:text-white text-sm transition-colors">
                        Cancel and return to dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}




