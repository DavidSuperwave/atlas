'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import EmailVerificationUpload from '@/components/EmailVerificationUpload';
import VerificationJobCard from '@/components/VerificationJobCard';

interface VerificationJob {
    id: string;
    filename: string;
    status: string;
    total_emails: number;
    processed_emails: number;
    valid_count: number;
    catchall_count: number;
    invalid_count: number;
    credits_used: number;
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
}

export default function VerifyPage() {
    const { user, loading: authLoading } = useAuth();
    const [jobs, setJobs] = useState<VerificationJob[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchJobs = useCallback(async () => {
        if (!user) return;
        
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('email_verification_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching jobs:', error);
        } else {
            setJobs(data || []);
        }
        setLoading(false);
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchJobs();
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [user, authLoading, fetchJobs]);

    // Refresh jobs that are still processing
    useEffect(() => {
        const hasProcessingJobs = jobs.some(job => job.status === 'processing');
        if (!hasProcessingJobs) return;

        const interval = setInterval(fetchJobs, 2000);
        return () => clearInterval(interval);
    }, [jobs, fetchJobs]);

    const handleJobCreated = () => {
        fetchJobs();
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Please sign in</h2>
                    <p className="text-gray-600">You need to be signed in to verify emails.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            <div className="max-w-6xl mx-auto p-8">
                <div className="mb-8">
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
                        Email Verification
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Upload a CSV file with email addresses to verify them in bulk.
                    </p>
                </div>

                {/* Upload Section */}
                <EmailVerificationUpload onJobCreated={handleJobCreated} />

                {/* Jobs Section */}
                <div className="mt-10">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        Verification Jobs
                    </h2>

                    {jobs.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
                            <svg 
                                className="mx-auto h-12 w-12 text-gray-400 mb-4" 
                                xmlns="http://www.w3.org/2000/svg" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={1.5} 
                                    d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z" 
                                />
                            </svg>
                            <p>No verification jobs yet. Upload a CSV to get started!</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {jobs.map((job) => (
                                <VerificationJobCard 
                                    key={job.id} 
                                    job={job}
                                    onRefresh={fetchJobs}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


