'use client';

import { useState, useEffect } from 'react';

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

interface VerificationJobCardProps {
    job: VerificationJob;
    onRefresh: () => void;
}

export default function VerificationJobCard({ job, onRefresh }: VerificationJobCardProps) {
    const [isDownloading, setIsDownloading] = useState(false);
    const [liveJob, setLiveJob] = useState(job);

    // Poll for updates when job is processing
    useEffect(() => {
        if (job.status !== 'processing') {
            setLiveJob(job);
            return;
        }

        const fetchStatus = async () => {
            try {
                const response = await fetch(`/api/verify-emails/status/${job.id}`);
                const data = await response.json();
                if (response.ok && data.job) {
                    setLiveJob({
                        ...job,
                        status: data.job.status,
                        processed_emails: data.job.processedEmails,
                        valid_count: data.job.validCount,
                        catchall_count: data.job.catchallCount,
                        invalid_count: data.job.invalidCount,
                        credits_used: data.job.creditsUsed,
                        completed_at: data.job.completedAt,
                        error_message: data.job.errorMessage,
                    });

                    if (data.job.status !== 'processing') {
                        onRefresh();
                    }
                }
            } catch (err) {
                console.error('Error fetching status:', err);
            }
        };

        const interval = setInterval(fetchStatus, 2000);
        fetchStatus(); // Initial fetch

        return () => clearInterval(interval);
    }, [job.id, job.status, onRefresh]);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const response = await fetch(`/api/verify-emails/download/${liveJob.id}`);
            
            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${liveJob.filename.replace(/\.csv$/i, '')}-verified.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download error:', err);
        } finally {
            setIsDownloading(false);
        }
    };

    const progress = liveJob.total_emails > 0 
        ? Math.round((liveJob.processed_emails / liveJob.total_emails) * 100) 
        : 0;

    const getStatusBadge = () => {
        switch (liveJob.status) {
            case 'completed':
                return (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                        Completed
                    </span>
                );
            case 'processing':
                return (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1.5">
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing
                    </span>
                );
            case 'failed':
                return (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                        Failed
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        {liveJob.status}
                    </span>
                );
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate" title={liveJob.filename}>
                        {liveJob.filename}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                        {new Date(liveJob.created_at).toLocaleString()}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {getStatusBadge()}
                </div>
            </div>

            {/* Progress Bar (shown when processing) */}
            {liveJob.status === 'processing' && (
                <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-medium text-gray-900">
                            {liveJob.processed_emails} / {liveJob.total_emails} ({progress}%)
                        </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-xl font-bold text-gray-900">{liveJob.total_emails}</p>
                    <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                    <p className="text-xl font-bold text-green-600">{liveJob.valid_count}</p>
                    <p className="text-xs text-gray-500">Valid</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg text-center">
                    <p className="text-xl font-bold text-yellow-600">{liveJob.catchall_count}</p>
                    <p className="text-xs text-gray-500">Catch-all</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center">
                    <p className="text-xl font-bold text-red-600">{liveJob.invalid_count}</p>
                    <p className="text-xs text-gray-500">Invalid</p>
                </div>
            </div>

            {/* Credits Used & Error Message */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                    Credits used: <span className="font-medium text-gray-700">{liveJob.credits_used}</span>
                </div>
                
                {liveJob.status === 'completed' && (
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {isDownloading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Downloading...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download CSV
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Error Message */}
            {liveJob.status === 'failed' && liveJob.error_message && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {liveJob.error_message}
                </div>
            )}
        </div>
    );
}


