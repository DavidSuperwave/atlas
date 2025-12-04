'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BrowserViewerProps {
    onClose?: () => void;
    className?: string;
}

interface BrowserStatus {
    state: 'available' | 'manual_use' | 'scraping';
    message: string;
    session?: {
        id: string;
        type: string;
        userId: string;
        isCurrentUser: boolean;
        scrapeId?: string;
        startedAt: string;
        remoteUrl?: string;
    };
    queuedScrapes: number;
    isCurrentUserSession: boolean;
}

/**
 * BrowserViewer Component
 * 
 * Provides an embedded browser viewer for manual Apollo access.
 * Features:
 * - Opens GoLogin cloud browser in iframe
 * - Shows browser status (available/in_use/scraping)
 * - Sends heartbeat to keep session alive
 * - Handles conflict detection
 */
export default function BrowserViewer({ onClose, className = '' }: BrowserViewerProps) {
    const [status, setStatus] = useState<BrowserStatus | null>(null);
    const [browserUrl, setBrowserUrl] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch browser status
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/browser/status');
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
                
                // If current user has an active session with URL, use it
                if (data.session?.isCurrentUser && data.session?.remoteUrl) {
                    setBrowserUrl(data.session.remoteUrl);
                    setSessionId(data.session.id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch browser status:', err);
        }
    }, []);

    // Start browser session
    const startBrowser = async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/browser/access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.message || data.error || 'Failed to start browser');
                return;
            }

            setBrowserUrl(data.url);
            setSessionId(data.sessionId);
            
            // Start heartbeat
            startHeartbeat(data.sessionId);
            
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start browser');
        } finally {
            setLoading(false);
        }
    };

    // Close browser session
    const closeBrowser = async () => {
        try {
            await fetch('/api/browser/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });

            setBrowserUrl(null);
            setSessionId(null);
            stopHeartbeat();
            
            // Refresh status
            await fetchStatus();
            
            onClose?.();
        } catch (err) {
            console.error('Failed to close browser:', err);
        }
    };

    // Heartbeat to keep session alive
    const sendHeartbeat = useCallback(async () => {
        if (!sessionId) return;

        try {
            await fetch('/api/browser/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
        } catch (err) {
            console.error('Heartbeat failed:', err);
        }
    }, [sessionId]);

    const startHeartbeat = (sid: string) => {
        stopHeartbeat();
        // Send heartbeat every 5 minutes
        heartbeatInterval.current = setInterval(() => {
            sendHeartbeat();
        }, 5 * 60 * 1000);
    };

    const stopHeartbeat = () => {
        if (heartbeatInterval.current) {
            clearInterval(heartbeatInterval.current);
            heartbeatInterval.current = null;
        }
    };

    // Initial fetch and cleanup
    useEffect(() => {
        fetchStatus();
        
        // Poll status every 10 seconds when not viewing browser
        const statusInterval = setInterval(() => {
            if (!browserUrl) {
                fetchStatus();
            }
        }, 10000);

        return () => {
            clearInterval(statusInterval);
            stopHeartbeat();
        };
    }, [fetchStatus, browserUrl]);

    // If we have a browser URL, show the viewer
    if (browserUrl) {
        return (
            <div className={`flex flex-col h-full ${className}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-white font-medium">Browser Session Active</span>
                    </div>
                    <button
                        onClick={closeBrowser}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                        Close Browser
                    </button>
                </div>

                {/* Browser iframe */}
                <div className="flex-1 bg-black">
                    <iframe
                        src={browserUrl}
                        className="w-full h-full border-0"
                        allow="clipboard-read; clipboard-write"
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
                    />
                </div>

                {/* Footer info */}
                <div className="p-2 bg-gray-900 border-t border-gray-700 text-gray-400 text-sm">
                    <p>Tip: Use this browser to log into Apollo or check your data. Close when done to allow scrapes to run.</p>
                </div>
            </div>
        );
    }

    // Status display when browser is not open
    return (
        <div className={`p-6 ${className}`}>
            <h2 className="text-xl font-semibold text-white mb-4">Browser Access</h2>
            
            {/* Status indicator */}
            {status && (
                <div className={`mb-6 p-4 rounded-lg border ${
                    status.state === 'available' 
                        ? 'bg-green-900/20 border-green-700' 
                        : status.state === 'scraping'
                        ? 'bg-yellow-900/20 border-yellow-700'
                        : 'bg-blue-900/20 border-blue-700'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                            status.state === 'available' 
                                ? 'bg-green-500' 
                                : status.state === 'scraping'
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-blue-500'
                        }`}></div>
                        <span className="text-white font-medium">{status.message}</span>
                    </div>
                    
                    {status.queuedScrapes > 0 && (
                        <p className="mt-2 text-sm text-gray-400">
                            {status.queuedScrapes} scrape(s) in queue
                        </p>
                    )}
                </div>
            )}

            {/* Error message */}
            {error && (
                <div className="mb-4 p-4 bg-red-900/20 border border-red-700 rounded-lg">
                    <p className="text-red-400">{error}</p>
                </div>
            )}

            {/* Open browser button */}
            <button
                onClick={startBrowser}
                disabled={loading || status?.state === 'scraping'}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-all ${
                    loading || status?.state === 'scraping'
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Starting Browser...
                    </span>
                ) : status?.state === 'scraping' ? (
                    'Browser in use (scraping)'
                ) : (
                    'Open Browser'
                )}
            </button>

            {/* Info */}
            <div className="mt-6 space-y-3 text-sm text-gray-400">
                <p>
                    <strong className="text-gray-300">What is this?</strong><br />
                    Opens the GoLogin browser where your Apollo session is saved.
                </p>
                <p>
                    <strong className="text-gray-300">When to use:</strong><br />
                    - Log into Apollo for the first time<br />
                    - Complete 2FA verification<br />
                    - Check your Apollo dashboard<br />
                    - Troubleshoot login issues
                </p>
                <p>
                    <strong className="text-gray-300">Note:</strong><br />
                    While the browser is open, scrapes will be queued and start automatically when you close it.
                </p>
            </div>
        </div>
    );
}

