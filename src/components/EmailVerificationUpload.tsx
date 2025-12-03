'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';

interface UploadPreview {
    filename: string;
    totalEmails: number;
    uniqueEmails: number;
    duplicatesCount: number;
    emailsToVerify: number;
    creditsRequired: number;
    availableCredits: number;
    hasEnoughCredits: boolean;
    emails: string[];
}

interface EmailVerificationUploadProps {
    onJobCreated: () => void;
}

export default function EmailVerificationUpload({ onJobCreated }: EmailVerificationUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [preview, setPreview] = useState<UploadPreview | null>(null);
    const [removeDuplicates, setRemoveDuplicates] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const processFile = async (file: File) => {
        setError(null);
        setIsUploading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('removeDuplicates', removeDuplicates.toString());

        try {
            const response = await fetch('/api/verify-emails/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to process file');
                return;
            }

            setPreview({
                filename: data.filename,
                totalEmails: data.totalEmails,
                uniqueEmails: data.uniqueEmails,
                duplicatesCount: data.duplicatesCount,
                emailsToVerify: data.emailsToVerify,
                creditsRequired: data.creditsRequired,
                availableCredits: data.availableCredits,
                hasEnoughCredits: data.hasEnoughCredits,
                emails: data.emails,
            });
        } catch (err) {
            console.error('Upload error:', err);
            setError('Failed to upload file');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }, [removeDuplicates]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    };

    const handleStartVerification = async () => {
        if (!preview) return;

        setIsStarting(true);
        setError(null);

        try {
            const response = await fetch('/api/verify-emails/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    emails: preview.emails,
                    filename: preview.filename,
                    removeDuplicates,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to start verification');
                return;
            }

            // Clear preview and notify parent
            setPreview(null);
            onJobCreated();
        } catch (err) {
            console.error('Start verification error:', err);
            setError('Failed to start verification');
        } finally {
            setIsStarting(false);
        }
    };

    const handleCancel = () => {
        setPreview(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveDuplicatesChange = async (checked: boolean) => {
        setRemoveDuplicates(checked);
        
        // If we have a preview, re-process with new setting
        if (preview && fileInputRef.current?.files?.[0]) {
            const formData = new FormData();
            formData.append('file', fileInputRef.current.files[0]);
            formData.append('removeDuplicates', checked.toString());

            try {
                const response = await fetch('/api/verify-emails/upload', {
                    method: 'POST',
                    body: formData,
                });

                const data = await response.json();
                if (response.ok) {
                    setPreview({
                        ...preview,
                        emailsToVerify: data.emailsToVerify,
                        creditsRequired: data.creditsRequired,
                        emails: data.emails,
                    });
                }
            } catch (err) {
                console.error('Re-process error:', err);
            }
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold mb-6 text-gray-900">Upload CSV for Verification</h2>
            
            {/* Error Message */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {!preview ? (
                /* Drop Zone */
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                        relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
                        transition-all duration-200
                        ${isDragging 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                        }
                        ${isUploading ? 'pointer-events-none opacity-60' : ''}
                    `}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    
                    {isUploading ? (
                        <div className="flex flex-col items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                            <p className="text-gray-600">Processing file...</p>
                        </div>
                    ) : (
                        <>
                            <svg 
                                className={`mx-auto h-16 w-16 mb-4 transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-400'}`}
                                xmlns="http://www.w3.org/2000/svg" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={1.5} 
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                                />
                            </svg>
                            <p className="text-lg font-medium text-gray-700 mb-2">
                                Drag and drop your CSV file here
                            </p>
                            <p className="text-gray-500">
                                or <span className="text-blue-600 hover:text-blue-700">browse</span> to select a file
                            </p>
                            <p className="text-sm text-gray-400 mt-3">
                                CSV file with email addresses
                            </p>
                        </>
                    )}
                </div>
            ) : (
                /* Preview Section */
                <div className="space-y-6">
                    {/* File Info */}
                    <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-medium text-green-800">Email addresses found</p>
                            <p className="text-sm text-green-600 truncate max-w-md" title={preview.filename}>
                                {preview.filename}
                            </p>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-gray-900">{preview.totalEmails}</p>
                            <p className="text-sm text-gray-500">Total Emails</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-gray-900">{preview.uniqueEmails}</p>
                            <p className="text-sm text-gray-500">Unique Emails</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-orange-600">{preview.duplicatesCount}</p>
                            <p className="text-sm text-gray-500">Duplicates</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-blue-600">{preview.emailsToVerify}</p>
                            <p className="text-sm text-gray-500">To Verify</p>
                        </div>
                    </div>

                    {/* Credits Info */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600">Credits Required:</span>
                            <span className="text-xl font-bold text-gray-900">{preview.creditsRequired}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-600">Available Credit:</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-xl font-bold ${preview.hasEnoughCredits ? 'text-green-600' : 'text-red-600'}`}>
                                    {preview.availableCredits.toLocaleString()}
                                </span>
                                {!preview.hasEnoughCredits && (
                                    <Link 
                                        href="/credits" 
                                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                                    >
                                        Need more?
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Settings */}
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="font-medium text-gray-700 mb-3">Settings:</p>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={removeDuplicates}
                                onChange={(e) => handleRemoveDuplicatesChange(e.target.checked)}
                                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Remove duplicates</span>
                        </label>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                        <button
                            onClick={handleCancel}
                            disabled={isStarting}
                            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleStartVerification}
                            disabled={isStarting || !preview.hasEnoughCredits}
                            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isStarting ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Starting...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Verify {preview.emailsToVerify} Emails
                                </>
                            )}
                        </button>
                    </div>

                    {!preview.hasEnoughCredits && (
                        <p className="text-center text-red-600 text-sm">
                            Insufficient credits. Please add more credits to continue.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}


