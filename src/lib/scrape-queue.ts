/**
 * Scrape Queue System
 * 
 * Manages sequential scrape processing to prevent:
 * 1. Concurrent browser instances (same profile)
 * 2. Apollo detection (concurrent requests)
 * 3. Race conditions with shared browser
 * 
 * Architecture:
 * - Single worker processes scrapes one at a time
 * - Queue stored in Supabase (survives restarts)
 * - Checks browser availability before starting
 * - Notifies users of conflicts
 * 
 * Similar to verification-queue.ts but for scrapes
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ScrapedLead } from './scraper-types';
import { getUserProfileId, ProfileLookupResult } from './gologin-profile-manager';

// Lazy-loaded scraper function to avoid module load issues
let scrapeApolloFn: ((url: string, pages?: number, userId?: string) => Promise<ScrapedLead[]>) | null = null;

async function getScrapeApollo() {
    if (!scrapeApolloFn) {
        const module = await import('./scraper-gologin');
        scrapeApolloFn = module.scrapeApollo;
    }
    return scrapeApolloFn;
}

/**
 * Get the profile ID that will be used for a user's scrape
 */
async function getProfileForUser(userId: string): Promise<ProfileLookupResult> {
    return getUserProfileId(userId);
}

// Lazy-loaded Supabase client to avoid module load failures
let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (!supabaseClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!url || !key) {
            console.error('[SCRAPE-QUEUE] Missing Supabase environment variables:');
            console.error(`  NEXT_PUBLIC_SUPABASE_URL: ${url ? '✓ set' : '✗ MISSING'}`);
            console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ MISSING'}`);
            console.error(`  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ set (fallback)' : '✗ MISSING'}`);
            throw new Error('Supabase environment variables not configured');
        }
        
        supabaseClient = createClient(url, key);
        console.log('[SCRAPE-QUEUE] Supabase client initialized successfully');
    }
    return supabaseClient;
}

/** Queue polling interval in milliseconds */
const POLL_INTERVAL = 3000; // 3 seconds

/** Maximum time a scrape can run before being considered stuck */
const MAX_SCRAPE_DURATION = 60 * 60 * 1000; // 60 minutes for up to 50 pages

/** Time without heartbeat before session is considered stale (for sessions WITH heartbeats) */
const HEARTBEAT_STALE_THRESHOLD = 3 * 60 * 1000; // 3 minutes

/** Grace period for sessions without heartbeats before marking as stale */
const NO_HEARTBEAT_GRACE_PERIOD = 2 * 60 * 1000; // 2 minutes

/** Manual session stale threshold */
const MANUAL_STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

/** Time estimation constants (in seconds) */
const TIME_ESTIMATES = {
    /** Browser startup and initialization */
    BROWSER_STARTUP: 10,
    /** Time to load each Apollo page */
    PAGE_LOAD: 8,
    /** Time to extract data from each page (~25 leads) */
    DATA_EXTRACTION: 15,
    /** Human-like delays per page to avoid detection */
    HUMAN_DELAYS: 12,
    /** Database operations per page */
    DATABASE_OPS: 5,
    /** Buffer for network variability */
    BUFFER: 10,
};

/** Calculate estimated time for a scrape in seconds */
function estimateScrapeTime(pages: number = 1): { minSeconds: number; maxSeconds: number; avgSeconds: number } {
    const perPage = TIME_ESTIMATES.PAGE_LOAD + TIME_ESTIMATES.DATA_EXTRACTION + TIME_ESTIMATES.HUMAN_DELAYS + TIME_ESTIMATES.DATABASE_OPS;
    const base = TIME_ESTIMATES.BROWSER_STARTUP;
    
    const minSeconds = base + (perPage * pages);
    const maxSeconds = minSeconds + TIME_ESTIMATES.BUFFER + (pages * 10); // Extra buffer per page
    const avgSeconds = Math.round((minSeconds + maxSeconds) / 2);
    
    return { minSeconds, maxSeconds, avgSeconds };
}

/** Format seconds into human-readable string */
function formatTimeEstimate(seconds: number): string {
    if (seconds < 60) {
        return `~${seconds}s`;
    } else if (seconds < 3600) {
        const mins = Math.round(seconds / 60);
        return `~${mins} min${mins > 1 ? 's' : ''}`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.round((seconds % 3600) / 60);
        return `~${hours}h ${mins}m`;
    }
}

/** Interface for queue items */
interface ScrapeQueueItem {
    id: string;
    scrape_id: string;
    user_id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    priority: number;
    pages_scraped: number;
    leads_found: number;
}

/** Interface for scrape records */
interface ScrapeRecord {
    id: string;
    url: string;
    filters: Record<string, unknown> | null;
    status: string;
    user_id: string;
    name: string | null;
    tags: string[];
    scraper_mode: string;
}

/** Browser state for conflict detection */
type BrowserState = 'available' | 'manual_use' | 'scraping';

/**
 * Check if we're in GoLogin mode (case-insensitive)
 */
function isGoLoginMode(): boolean {
    const mode = process.env.SCRAPER_MODE?.toLowerCase();
    return mode === 'gologin';
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check Supabase
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        errors.push('NEXT_PUBLIC_SUPABASE_URL is not set');
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        errors.push('Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set');
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        warnings.push('SUPABASE_SERVICE_ROLE_KEY not set, using NEXT_PUBLIC_SUPABASE_ANON_KEY as fallback');
    }
    
    // Check GoLogin (if in gologin mode)
    if (isGoLoginMode()) {
        if (!process.env.GOLOGIN_API_TOKEN) {
            errors.push('GOLOGIN_API_TOKEN is not set (required for gologin mode)');
        }
        if (!process.env.GOLOGIN_PROFILE_ID) {
            warnings.push('GOLOGIN_PROFILE_ID not set, will use database profile assignments');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Scrape Queue Manager
 * 
 * Handles sequential processing of scrape requests
 */
class ScrapeQueue {
    private isProcessing = false;
    private processorInterval: ReturnType<typeof setInterval> | null = null;
    private currentScrapeId: string | null = null;
    private processorStarted = false;

    constructor() {
        console.log('[SCRAPE-QUEUE] Queue manager initialized');
    }

    /**
     * Check if the processor has been started
     */
    isProcessorStarted(): boolean {
        return this.processorStarted;
    }

    /**
     * Clean up stale sessions on startup
     * 
     * Three-tier detection:
     * 1. Sessions WITH heartbeats: stale if no heartbeat in 3 minutes
     * 2. Sessions WITHOUT heartbeats but young: stale after 2 minute grace period
     * 3. Sessions WITHOUT heartbeats and old: stale after 60 minute max duration
     * 
     * Also handles:
     * - Manual sessions (5 minute threshold)
     * - Orphaned sessions (no corresponding queue item)
     * - Stuck scrapes exceeding max duration
     */
    private async cleanupStaleSessions(): Promise<void> {
        try {
            const supabase = getSupabase();
            const now = new Date();
            const heartbeatCutoff = new Date(now.getTime() - HEARTBEAT_STALE_THRESHOLD);
            const maxDurationCutoff = new Date(now.getTime() - MAX_SCRAPE_DURATION);
            const manualStaleCutoff = new Date(now.getTime() - MANUAL_STALE_THRESHOLD);
            const noHeartbeatCutoff = new Date(now.getTime() - NO_HEARTBEAT_GRACE_PERIOD);
            
            console.log(`[SCRAPE-QUEUE] Running stale session cleanup...`);
            
            // Get ALL active sessions to check
            const { data: activeSessions, error: selectError } = await supabase
                .from('browser_sessions')
                .select('id, started_at, last_heartbeat, scrape_id, profile_id, session_type, user_id')
                .eq('status', 'active');
            
            if (selectError) {
                console.warn(`[SCRAPE-QUEUE] Error finding active sessions: ${selectError.message}`);
            } else if (activeSessions && activeSessions.length > 0) {
                console.log(`[SCRAPE-QUEUE] Found ${activeSessions.length} active browser session(s), checking for stale...`);
                for (const s of activeSessions) {
                    const age = s.started_at ? Math.round((now.getTime() - new Date(s.started_at).getTime()) / 1000) : 'unknown';
                    const lastHb = s.last_heartbeat ? Math.round((now.getTime() - new Date(s.last_heartbeat).getTime()) / 1000) : 'never';
                    console.log(`[SCRAPE-QUEUE]   Session ${s.id}: type=${s.session_type}, scrape=${s.scrape_id}, age=${age}s, lastHb=${lastHb}s ago`);
                }
                
                const staleSessions: typeof activeSessions = [];
                
                for (const s of activeSessions) {
                    let isStale = false;
                    let reason = '';
                    
                    // Handle manual sessions separately
                    if (s.session_type === 'manual') {
                        const checkTime = s.last_heartbeat 
                            ? new Date(s.last_heartbeat).getTime() 
                            : new Date(s.started_at).getTime();
                        if (checkTime < manualStaleCutoff.getTime()) {
                            isStale = true;
                            reason = `manual session inactive for ${Math.round((now.getTime() - checkTime) / 60000)} min`;
                        }
                    } else {
                        // Scrape sessions: three-tier detection
                        if (s.last_heartbeat) {
                            // Tier 1: Has heartbeats - use shorter threshold (3 min)
                            if (new Date(s.last_heartbeat).getTime() < heartbeatCutoff.getTime()) {
                                isStale = true;
                                reason = `last heartbeat ${Math.round((now.getTime() - new Date(s.last_heartbeat).getTime()) / 60000)} min ago`;
                            }
                        } else {
                            // Tier 2: No heartbeats but young - give 2 minute grace period
                            // This catches sessions that failed before sending first heartbeat
                            const startTime = s.started_at ? new Date(s.started_at).getTime() : 0;
                            if (startTime > 0 && startTime < noHeartbeatCutoff.getTime()) {
                                isStale = true;
                                reason = `started ${Math.round((now.getTime() - startTime) / 60000)} min ago, no heartbeats (likely failed)`;
                            }
                            // Tier 3: No heartbeats and old - use max duration (60 min)
                            else if (startTime < maxDurationCutoff.getTime()) {
                                isStale = true;
                                reason = `running for ${Math.round((now.getTime() - startTime) / 60000)} min without heartbeats`;
                            }
                        }
                    }
                    
                    if (isStale) {
                        console.log(`[SCRAPE-QUEUE] Session ${s.id} stale: ${reason}`);
                        staleSessions.push(s);
                    }
                }
                
                if (staleSessions.length > 0) {
                    console.log(`[SCRAPE-QUEUE] Cleaning up ${staleSessions.length} stale browser session(s)...`);
                    
                    for (const session of staleSessions) {
                        // Close the browser session
                        await supabase
                            .from('browser_sessions')
                            .update({ status: 'error', ended_at: now.toISOString() })
                            .eq('id', session.id);
                        
                        // Also reset the associated scrape if it exists and is running
                        if (session.scrape_id) {
                            // Mark queue item as failed (not pending - we don't want infinite retries)
                            await supabase
                                .from('scrape_queue')
                                .update({ 
                                    status: 'failed', 
                                    completed_at: now.toISOString(),
                                    error_message: 'Session timed out (no heartbeat)'
                                })
                                .eq('scrape_id', session.scrape_id)
                                .eq('status', 'running');
                            
                            // Mark scrape as failed
                            await supabase
                                .from('scrapes')
                                .update({ 
                                    status: 'failed',
                                    error_details: { message: 'Session timed out', timestamp: now.toISOString() }
                                })
                                .eq('id', session.scrape_id)
                                .eq('status', 'running');
                        }
                    }
                    console.log(`[SCRAPE-QUEUE] ✓ Stale sessions cleaned`);
                } else {
                    console.log(`[SCRAPE-QUEUE] No stale sessions found`);
                }
            }
            
            // Also check for stuck 'running' scrapes without active browser sessions
            // These are orphaned queue items where the browser session was closed but queue wasn't updated
            const { data: stuckScrapes } = await supabase
                .from('scrape_queue')
                .select('id, scrape_id')
                .eq('status', 'running')
                .lt('started_at', maxDurationCutoff.toISOString());
            
            if (stuckScrapes && stuckScrapes.length > 0) {
                console.log(`[SCRAPE-QUEUE] Found ${stuckScrapes.length} stuck scrape(s) exceeding max duration, marking as failed...`);
                for (const stuck of stuckScrapes) {
                    // Mark as failed - these have been running too long
                    await supabase
                        .from('scrape_queue')
                        .update({ 
                            status: 'failed', 
                            completed_at: now.toISOString(),
                            error_message: 'Exceeded maximum scrape duration'
                        })
                        .eq('id', stuck.id);
                    
                    await supabase
                        .from('scrapes')
                        .update({ 
                            status: 'failed',
                            error_details: { message: 'Exceeded maximum scrape duration', timestamp: now.toISOString() }
                        })
                        .eq('id', stuck.scrape_id);
                    
                    // Also close any lingering browser session for this scrape
                    await supabase
                        .from('browser_sessions')
                        .update({ status: 'error', ended_at: now.toISOString() })
                        .eq('scrape_id', stuck.scrape_id)
                        .eq('status', 'active');
                }
                console.log(`[SCRAPE-QUEUE] ✓ Stuck scrapes marked as failed`);
            }
            
            // Check for duplicate browser sessions (multiple active sessions for same scrape)
            // This can happen due to race conditions in the queue processor
            const { data: allActiveScrapes } = await supabase
                .from('browser_sessions')
                .select('id, scrape_id, started_at')
                .eq('status', 'active')
                .eq('session_type', 'scrape')
                .not('scrape_id', 'is', null);
            
            if (allActiveScrapes && allActiveScrapes.length > 0) {
                // Group by scrape_id
                const sessionsByScrape = new Map<string, typeof allActiveScrapes>();
                for (const session of allActiveScrapes) {
                    const existing = sessionsByScrape.get(session.scrape_id) || [];
                    existing.push(session);
                    sessionsByScrape.set(session.scrape_id, existing);
                }
                
                // Close duplicate sessions (keep only the oldest one per scrape)
                for (const [scrapeId, sessions] of sessionsByScrape) {
                    if (sessions.length > 1) {
                        console.log(`[SCRAPE-QUEUE] Found ${sessions.length} duplicate sessions for scrape ${scrapeId}, closing extras...`);
                        // Sort by started_at, keep the oldest
                        sessions.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
                        const duplicates = sessions.slice(1); // All except the oldest
                        
                        for (const dup of duplicates) {
                            await supabase
                                .from('browser_sessions')
                                .update({ status: 'error', ended_at: now.toISOString() })
                                .eq('id', dup.id);
                            console.log(`[SCRAPE-QUEUE]   Closed duplicate session ${dup.id}`);
                        }
                    }
                }
            }
            
            // Check for orphaned browser sessions without corresponding queue items
            // These can happen if a scrape fails before creating a queue item
            const { data: orphanedSessions } = await supabase
                .from('browser_sessions')
                .select('id, scrape_id, profile_id, started_at')
                .eq('status', 'active')
                .eq('session_type', 'scrape')
                .not('scrape_id', 'is', null);
            
            if (orphanedSessions && orphanedSessions.length > 0) {
                for (const session of orphanedSessions) {
                    // Check if there's a corresponding queue item
                    const { data: queueItem } = await supabase
                        .from('scrape_queue')
                        .select('id, status')
                        .eq('scrape_id', session.scrape_id)
                        .single();
                    
                    // If no queue item exists, or if it's completed/failed, close the session
                    if (!queueItem || queueItem.status === 'completed' || queueItem.status === 'failed' || queueItem.status === 'cancelled') {
                        console.log(`[SCRAPE-QUEUE] Found orphaned browser session ${session.id} for scrape ${session.scrape_id}, closing...`);
                        await supabase
                            .from('browser_sessions')
                            .update({ status: 'error', ended_at: now.toISOString() })
                            .eq('id', session.id);
                    }
                }
            }
        } catch (error) {
            console.warn(`[SCRAPE-QUEUE] Startup cleanup error:`, error);
        }
    }

    /**
     * Start the queue processor
     * Call this when the server starts
     */
    startProcessor(): void {
        if (this.processorInterval) {
            console.log('[SCRAPE-QUEUE] Processor already running');
            return;
        }

        // Validate environment before starting
        const { valid, errors, warnings } = validateEnvironment();
        
        if (warnings.length > 0) {
            warnings.forEach(w => console.warn(`[SCRAPE-QUEUE] Warning: ${w}`));
        }
        
        if (!valid) {
            console.error('[SCRAPE-QUEUE] Cannot start processor - environment validation failed:');
            errors.forEach(e => console.error(`  - ${e}`));
            return;
        }

        console.log('[SCRAPE-QUEUE] Starting queue processor...');
        console.log(`[SCRAPE-QUEUE] SCRAPER_MODE: ${process.env.SCRAPER_MODE || '(not set)'}`);
        console.log(`[SCRAPE-QUEUE] Is GoLogin mode: ${isGoLoginMode()}`);
        
        this.processorStarted = true;
        
        // Clean up stale sessions before processing
        this.cleanupStaleSessions().then(() => {
            // Process immediately on start
            this.processNext().catch(err => {
                console.error('[SCRAPE-QUEUE] Error in initial processNext:', err);
            });
        }).catch(err => {
            console.error('[SCRAPE-QUEUE] Error in startup cleanup:', err);
            // Still try to process even if cleanup fails
            this.processNext().catch(err => {
                console.error('[SCRAPE-QUEUE] Error in initial processNext:', err);
            });
        });

        // Then poll regularly
        let pollCount = 0;
        this.processorInterval = setInterval(() => {
            pollCount++;
            // Log heartbeat every 20 polls (~1 minute) to verify processor is running
            if (pollCount % 20 === 0) {
                console.log(`[SCRAPE-QUEUE] Heartbeat: processor alive, ${pollCount} polls completed`);
            }
            this.processNext().catch(err => {
                console.error('[SCRAPE-QUEUE] Error in processNext:', err);
            });
        }, POLL_INTERVAL);

        console.log(`[SCRAPE-QUEUE] Processor started (polling every ${POLL_INTERVAL}ms)`);
    }

    /**
     * Stop the queue processor
     */
    stopProcessor(): void {
        if (this.processorInterval) {
            clearInterval(this.processorInterval);
            this.processorInterval = null;
            this.processorStarted = false;
            console.log('[SCRAPE-QUEUE] Processor stopped');
        }
    }

    /**
     * Check if a specific profile is available for scraping
     * 
     * Uses same three-tier detection as cleanupStaleSessions():
     * 1. Sessions WITH heartbeats: stale if no heartbeat in 3 minutes
     * 2. Sessions WITHOUT heartbeats but young: stale after 2 minute grace period
     * 3. Sessions WITHOUT heartbeats and old: stale after 60 minute max duration
     * 
     * @param profileId - The GoLogin profile ID to check (if not provided, checks any)
     */
    async getBrowserState(profileId?: string): Promise<{ state: BrowserState; session?: { user_id: string; session_type: string; profile_id?: string } }> {
        const supabase = getSupabase();
        
        // Build query - check specific profile if provided, otherwise check all
        let query = supabase
            .from('browser_sessions')
            .select('*')
            .eq('status', 'active')
            .order('started_at', { ascending: false })
            .limit(1);
        
        if (profileId) {
            query = query.eq('profile_id', profileId);
        }
        
        const { data: activeSession, error } = await query.single();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows returned (which is fine)
            console.error(`[SCRAPE-QUEUE] Error checking browser sessions: ${error.message}`);
        }

        if (!activeSession) {
            return { state: 'available' };
        }

        // Check if session is stale using three-tier detection
        const now = Date.now();
        
        let isStale = false;
        let staleReason = '';
        
        if (activeSession.session_type === 'manual') {
            // Manual sessions: use last_heartbeat or started_at, 5 min threshold
            const checkTime = activeSession.last_heartbeat 
                ? new Date(activeSession.last_heartbeat).getTime() 
                : new Date(activeSession.started_at).getTime();
            if (now - checkTime > MANUAL_STALE_THRESHOLD) {
                isStale = true;
                staleReason = `manual session inactive for ${Math.round((now - checkTime) / 60000)} min`;
            }
        } else {
            // Scrape sessions: three-tier detection
            if (activeSession.last_heartbeat) {
                // Tier 1: Has heartbeats - use shorter threshold (3 min)
                const lastHb = new Date(activeSession.last_heartbeat).getTime();
                if (now - lastHb > HEARTBEAT_STALE_THRESHOLD) {
                    isStale = true;
                    staleReason = `no heartbeat for ${Math.round((now - lastHb) / 60000)} min`;
                }
            } else {
                // Tier 2: No heartbeats but young - give 2 minute grace period
                const startTime = new Date(activeSession.started_at).getTime();
                if (now - startTime > NO_HEARTBEAT_GRACE_PERIOD && now - startTime < MAX_SCRAPE_DURATION) {
                    isStale = true;
                    staleReason = `started ${Math.round((now - startTime) / 60000)} min ago, no heartbeats (likely failed)`;
                }
                // Tier 3: No heartbeats and old - use max duration (60 min)
                else if (now - startTime > MAX_SCRAPE_DURATION) {
                    isStale = true;
                    staleReason = `running for ${Math.round((now - startTime) / 60000)} min without heartbeats`;
                }
            }
        }
        
        if (isStale) {
            console.log(`[SCRAPE-QUEUE] Clearing stale browser session: ${activeSession.id} (profile: ${activeSession.profile_id}, reason: ${staleReason})`);
            await supabase
                .from('browser_sessions')
                .update({ status: 'error', ended_at: new Date().toISOString() })
                .eq('id', activeSession.id);
            
            // Also fail the associated scrape if exists
            if (activeSession.scrape_id) {
                await supabase
                    .from('scrape_queue')
                    .update({ 
                        status: 'failed', 
                        completed_at: new Date().toISOString(),
                        error_message: `Session stale: ${staleReason}`
                    })
                    .eq('scrape_id', activeSession.scrape_id)
                    .eq('status', 'running');
                
                await supabase
                    .from('scrapes')
                    .update({ 
                        status: 'failed',
                        error_details: { message: `Session stale: ${staleReason}`, timestamp: new Date().toISOString() }
                    })
                    .eq('id', activeSession.scrape_id)
                    .eq('status', 'running');
            }
            
            return { state: 'available' };
        }

        if (activeSession.session_type === 'manual') {
            console.log(`[SCRAPE-QUEUE] getBrowserState: Found active MANUAL session ${activeSession.id} for profile ${activeSession.profile_id}`);
            return { 
                state: 'manual_use', 
                session: { user_id: activeSession.user_id, session_type: 'manual', profile_id: activeSession.profile_id } 
            };
        }

        // Session is active and not stale - profile is in use
        const sessionAge = Math.round((now - new Date(activeSession.started_at).getTime()) / 1000);
        const lastHbAge = activeSession.last_heartbeat 
            ? Math.round((now - new Date(activeSession.last_heartbeat).getTime()) / 1000)
            : 'never';
        console.log(`[SCRAPE-QUEUE] getBrowserState: Found active SCRAPE session ${activeSession.id} for profile ${activeSession.profile_id}, scrape=${activeSession.scrape_id}, age=${sessionAge}s, lastHb=${lastHbAge}s ago`);
        
        return { 
            state: 'scraping', 
            session: { user_id: activeSession.user_id, session_type: 'scrape', profile_id: activeSession.profile_id } 
        };
    }

    /**
     * Atomically claim the next pending scrape from the queue
     * 
     * This prevents race conditions where multiple processor instances
     * try to process the same item simultaneously.
     * 
     * Uses UPDATE ... WHERE status='pending' RETURNING to ensure only one
     * instance can claim each item.
     */
    async claimNextPendingScrape(): Promise<ScrapeQueueItem | null> {
        const supabase = getSupabase();
        
        // First, find the next pending item
        const { data: pendingItem, error: findError } = await supabase
            .from('scrape_queue')
            .select('id')
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (findError) {
            // PGRST116 = no rows returned (which is normal when queue is empty)
            if (findError.code !== 'PGRST116') {
                console.error(`[SCRAPE-QUEUE] Error fetching pending scrape: ${findError.message} (code: ${findError.code})`);
            }
            return null;
        }

        if (!pendingItem) {
            return null;
        }

        // Now atomically claim it by updating status to 'running'
        // Only one instance will succeed due to the status='pending' condition
        const { data: claimedItem, error: claimError } = await supabase
            .from('scrape_queue')
            .update({ 
                status: 'running', 
                started_at: new Date().toISOString() 
            })
            .eq('id', pendingItem.id)
            .eq('status', 'pending') // Critical: only update if still pending
            .select('*')
            .single();

        if (claimError) {
            // PGRST116 = no rows updated (another instance claimed it first)
            if (claimError.code === 'PGRST116') {
                console.log(`[SCRAPE-QUEUE] Queue item ${pendingItem.id} was claimed by another instance`);
                return null;
            }
            console.error(`[SCRAPE-QUEUE] Error claiming scrape: ${claimError.message} (code: ${claimError.code})`);
            return null;
        }

        if (!claimedItem) {
            // Another instance claimed it first
            console.log(`[SCRAPE-QUEUE] Queue item ${pendingItem.id} was claimed by another instance`);
            return null;
        }

        console.log(`[SCRAPE-QUEUE] ✓ Claimed queue item: ${claimedItem.id} for scrape ${claimedItem.scrape_id}`);
        return claimedItem as ScrapeQueueItem;
    }

    /**
     * Get scrape details
     */
    async getScrapeDetails(scrapeId: string): Promise<ScrapeRecord | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('scrapes')
            .select('*')
            .eq('id', scrapeId)
            .single();

        if (error || !data) {
            return null;
        }

        // Safety check: Don't process scrapes that require admin approval
        // These are for scrape-only users and should be processed manually
        if (data.requires_admin_approval === true) {
            console.log(`[SCRAPE-QUEUE] Skipping scrape ${scrapeId} - requires admin approval`);
            return null;
        }

        return data as ScrapeRecord;
    }

    /**
     * Process the next scrape in the queue
     */
    async processNext(): Promise<void> {
        // Skip if already processing
        if (this.isProcessing) {
            return;
        }

        // Declare browserSession outside try block so it's accessible in catch/finally
        let browserSession: { id: string } | null = null;

        try {
            const supabase = getSupabase();
            
            // DEBUG: Check queue and session state periodically
            // Get counts for debugging
            const { count: pendingCount } = await supabase
                .from('scrape_queue')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');
            
            const { count: runningCount } = await supabase
                .from('scrape_queue')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'running');
            
            const { data: activeSessions } = await supabase
                .from('browser_sessions')
                .select('id, profile_id, scrape_id, started_at, last_heartbeat, session_type')
                .eq('status', 'active');
            
            // Log state if there are pending items or active sessions
            if ((pendingCount && pendingCount > 0) || (activeSessions && activeSessions.length > 0)) {
                console.log(`[SCRAPE-QUEUE] Queue state: ${pendingCount || 0} pending, ${runningCount || 0} running, ${activeSessions?.length || 0} active browser sessions`);
                if (activeSessions && activeSessions.length > 0) {
                    for (const session of activeSessions) {
                        const age = session.started_at 
                            ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
                            : 'unknown';
                        const lastHb = session.last_heartbeat
                            ? Math.round((Date.now() - new Date(session.last_heartbeat).getTime()) / 1000)
                            : 'never';
                        console.log(`[SCRAPE-QUEUE]   Session ${session.id}: profile=${session.profile_id}, scrape=${session.scrape_id}, type=${session.session_type}, age=${age}s, lastHb=${lastHb}s ago`);
                    }
                }
            }
            
            // Atomically claim the next pending scrape
            // This prevents race conditions where multiple instances try to process the same item
            const nextItem = await this.claimNextPendingScrape();
            if (!nextItem) {
                // No pending scrapes or another instance claimed it
                return;
            }
            
            console.log(`[SCRAPE-QUEUE] Processing claimed item: scrape_id=${nextItem.scrape_id}, user_id=${nextItem.user_id}`);
            
            // Mark as processing (local flag for this instance)
            this.isProcessing = true;
            this.currentScrapeId = nextItem.scrape_id;
            
            // Look up the profile that will be used for this user
            const profileResult = await getProfileForUser(nextItem.user_id);
            if (!profileResult.profileId) {
                console.error(`[SCRAPE-QUEUE] No profile available for user ${nextItem.user_id}: ${profileResult.error}`);
                // Mark the scrape as failed
                await supabase.from('scrape_queue').update({ 
                    status: 'failed', 
                    error_message: profileResult.error || 'No GoLogin profile assigned',
                    completed_at: new Date().toISOString()
                }).eq('id', nextItem.id);
                await supabase.from('scrapes').update({ 
                    status: 'failed',
                    error_details: { message: profileResult.error || 'No GoLogin profile assigned' }
                }).eq('id', nextItem.scrape_id);
                this.isProcessing = false;
                this.currentScrapeId = null;
                return;
            }
            
            console.log(`[SCRAPE-QUEUE] User ${nextItem.user_id} will use profile: ${profileResult.profileId} (source: ${profileResult.source})`);
            
            // Check if THIS specific profile is available
            const { state, session } = await this.getBrowserState(profileResult.profileId);
            if (state !== 'available') {
                // This profile is in use - put item back to pending
                console.log(`[SCRAPE-QUEUE] Profile ${profileResult.profileId} not available (state: ${state}), returning item to queue`);
                await supabase.from('scrape_queue').update({ 
                    status: 'pending',
                    started_at: null
                }).eq('id', nextItem.id);
                this.isProcessing = false;
                this.currentScrapeId = null;
                return;
            }

            console.log(`[SCRAPE-QUEUE] Starting scrape: ${nextItem.scrape_id}`);

            // Create browser session record with the ACTUAL profile being used
            const { data: sessionData } = await supabase
                .from('browser_sessions')
                .insert({
                    profile_id: profileResult.profileId,
                    user_id: nextItem.user_id,
                    session_type: 'scrape',
                    status: 'active',
                    scrape_id: nextItem.scrape_id
                })
                .select()
                .single();
            
            browserSession = sessionData;

            // Get scrape details
            const scrapeDetails = await this.getScrapeDetails(nextItem.scrape_id);
            if (!scrapeDetails) {
                throw new Error('Scrape record not found');
            }

            // Update scrape status to running
            await supabase
                .from('scrapes')
                .update({ status: 'running' })
                .eq('id', nextItem.scrape_id);

            // Extract pages from filters or default to 1
            const pages = (scrapeDetails.filters && typeof scrapeDetails.filters === 'object' && 'pages' in scrapeDetails.filters)
                ? Number(scrapeDetails.filters.pages) || 1
                : 1;

            console.log(`[SCRAPE-QUEUE] Scraping ${pages} page(s) from ${scrapeDetails.url} using profile ${profileResult.profileId}`);

            // Run the scraper (lazy load to avoid module issues)
            const scrapeApollo = await getScrapeApollo();
            const leads = await scrapeApollo(scrapeDetails.url, pages, nextItem.user_id);

            // Save leads to database
            const { processedCount, duplicateCount, errors } = await this.saveLeads(
                nextItem.scrape_id, 
                nextItem.user_id, 
                leads
            );

            // Update queue status to completed
            await supabase
                .from('scrape_queue')
                .update({ 
                    status: 'completed', 
                    completed_at: new Date().toISOString(),
                    pages_scraped: pages,
                    leads_found: processedCount
                })
                .eq('id', nextItem.id);

            // Update scrape status to completed
            await supabase
                .from('scrapes')
                .update({ 
                    status: 'completed',
                    total_leads: processedCount
                })
                .eq('id', nextItem.scrape_id);

            // Close browser session
            if (browserSession) {
                await supabase
                    .from('browser_sessions')
                    .update({ 
                        status: 'completed', 
                        ended_at: new Date().toISOString() 
                    })
                    .eq('id', browserSession.id);
            }

            console.log(`[SCRAPE-QUEUE] ✓ Scrape completed: ${processedCount} leads saved, ${duplicateCount} duplicates skipped`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[SCRAPE-QUEUE] Scrape failed:`, errorMessage);
            if (error instanceof Error && error.stack) {
                console.error(`[SCRAPE-QUEUE] Stack trace:`, error.stack);
            }

            // Update queue status to failed
            if (this.currentScrapeId) {
                try {
                    const supabase = getSupabase();
                    await supabase
                        .from('scrape_queue')
                        .update({ 
                            status: 'failed', 
                            completed_at: new Date().toISOString(),
                            error_message: errorMessage
                        })
                        .eq('scrape_id', this.currentScrapeId);

                    // Update scrape status to failed
                    await supabase
                        .from('scrapes')
                        .update({ 
                            status: 'failed',
                            error_details: { message: errorMessage, timestamp: new Date().toISOString() }
                        })
                        .eq('id', this.currentScrapeId);

                } catch (updateError) {
                    console.error('[SCRAPE-QUEUE] Failed to update status after error:', updateError);
                }
            }

        } finally {
            // ALWAYS close browser session if it was created, even if other cleanup failed
            if (browserSession) {
                try {
                    const supabase = getSupabase();
                    await supabase
                        .from('browser_sessions')
                        .update({ 
                            status: 'error',
                            ended_at: new Date().toISOString() 
                        })
                        .eq('id', browserSession.id)
                        .eq('status', 'active'); // Only update if still active
                } catch (sessionError) {
                    console.error('[SCRAPE-QUEUE] Failed to close browser session in finally block:', sessionError);
                }
            }
            
            // Also ensure any active session for this scrape is closed (fallback)
            if (this.currentScrapeId) {
                try {
                    const supabase = getSupabase();
                    await supabase
                        .from('browser_sessions')
                        .update({ 
                            status: 'error', 
                            ended_at: new Date().toISOString() 
                        })
                        .eq('scrape_id', this.currentScrapeId)
                        .eq('status', 'active');
                } catch (fallbackError) {
                    console.error('[SCRAPE-QUEUE] Failed to close browser session (fallback):', fallbackError);
                }
            }
            
            this.isProcessing = false;
            this.currentScrapeId = null;
        }
    }

    /**
     * Save leads to database - simple batch insert
     * 
     * No name-based duplicate checking - duplicates are detected by EMAIL
     * after enrichment (more accurate since names aren't unique identifiers)
     */
    async saveLeads(scrapeId: string, userId: string, leads: ScrapedLead[]): Promise<{ processedCount: number; duplicateCount: number; errors: string[] }> {
        const errors: string[] = [];

        // Filter out invalid leads
        const validLeads = leads.filter(lead => {
            if (!lead.first_name?.trim() || !lead.last_name?.trim()) {
                return false;
            }
            return true;
        });

        if (validLeads.length === 0) {
            return { processedCount: 0, duplicateCount: 0, errors: [] };
        }

        // Prepare all leads for batch insert
        const leadsToInsert = validLeads.map(lead => ({
            scrape_id: scrapeId,
            user_id: userId,
            first_name: lead.first_name?.trim() || null,
            last_name: lead.last_name?.trim() || null,
            title: lead.title?.trim() || null,
            company_name: lead.company_name?.trim() || null,
            company_linkedin: lead.company_linkedin?.trim() || null,
            location: lead.location?.trim() || null,
            company_size: lead.company_size?.trim() || null,
            industry: lead.industry?.trim() || null,
            website: lead.website?.trim() || null,
            keywords: lead.keywords || [],
            verification_status: 'pending',
            verification_data: null,
            phone_numbers: lead.phone_numbers || [],
            linkedin_url: lead.linkedin_url?.trim() || null,
            is_duplicate: false,
            original_lead_id: null
        }));

        console.log(`[SCRAPE-QUEUE] Inserting ${leadsToInsert.length} leads...`);
        
        const supabase = getSupabase();
        
        // Simple batch insert - no duplicate checking at this stage
        // Duplicates will be detected by EMAIL after enrichment
        const { data, error } = await supabase
            .from('leads')
            .insert(leadsToInsert)
            .select('id');

        if (error) {
            console.error(`[SCRAPE-QUEUE] Batch insert error: ${error.message}`);
            errors.push(`Insert failed: ${error.message}`);
            
            // If batch fails, try individual inserts
            console.log('[SCRAPE-QUEUE] Falling back to individual inserts...');
            let processedCount = 0;
            for (const lead of leadsToInsert) {
                try {
                    const { error: insertError } = await supabase
                        .from('leads')
                        .insert(lead);
                    
                    if (!insertError) {
                        processedCount++;
                    } else {
                        console.error(`[SCRAPE-QUEUE] Insert error for ${lead.first_name} ${lead.last_name}: ${insertError.message}`);
                    }
                } catch (individualError) {
                    console.error(`[SCRAPE-QUEUE] Individual insert failed:`, individualError);
                }
            }
            console.log(`[SCRAPE-QUEUE] Fallback complete: ${processedCount}/${leadsToInsert.length} inserted`);
            return { processedCount, duplicateCount: 0, errors };
        }

        const processedCount = data?.length || 0;
        console.log(`[SCRAPE-QUEUE] ✓ Batch insert complete: ${processedCount} leads saved`);

        return { processedCount, duplicateCount: 0, errors };
    }

    /**
     * Add a scrape to the queue
     */
    async addToQueue(scrapeId: string, userId: string, priority: number = 0): Promise<{ 
        success: boolean; 
        queueId?: string; 
        position?: number; 
        browserState?: BrowserState;
        error?: string;
    }> {
        try {
            const supabase = getSupabase();
            
            // Check browser state
            const { state } = await this.getBrowserState();

            // Create queue entry
            const { data, error } = await supabase
                .from('scrape_queue')
                .insert({
                    scrape_id: scrapeId,
                    user_id: userId,
                    status: 'pending',
                    priority
                })
                .select()
                .single();

            if (error) {
                return { success: false, error: error.message };
            }

            // Get queue position
            const { count } = await supabase
                .from('scrape_queue')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .lt('created_at', data.created_at);

            const position = (count || 0) + 1;

            return { 
                success: true, 
                queueId: data.id,
                position,
                browserState: state
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Get queue status for a scrape with time estimates
     */
    async getQueueStatus(scrapeId: string): Promise<{
        status: 'pending' | 'running' | 'completed' | 'failed' | 'not_found';
        position?: number;
        pagesScraped?: number;
        leadsFound?: number;
        errorMessage?: string;
        startedAt?: string;
        completedAt?: string;
        estimatedTimeRemaining?: number;
        estimatedCompletionTime?: string;
        timeEstimateFormatted?: string;
    }> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('scrape_queue')
            .select('*')
            .eq('scrape_id', scrapeId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return { status: 'not_found' };
        }

        let position: number | undefined;
        let estimatedTimeRemaining: number | undefined;
        let estimatedCompletionTime: string | undefined;
        let timeEstimateFormatted: string | undefined;

        // Calculate time estimates based on status
        const pages = 1; // Default pages per scrape
        const { avgSeconds } = estimateScrapeTime(pages);

        if (data.status === 'pending') {
            const { count } = await supabase
                .from('scrape_queue')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .lt('created_at', data.created_at);
            position = (count || 0) + 1;

            // Estimate: (position in queue) * avg time per scrape
            estimatedTimeRemaining = position * avgSeconds;
            timeEstimateFormatted = formatTimeEstimate(estimatedTimeRemaining);
            estimatedCompletionTime = new Date(Date.now() + estimatedTimeRemaining * 1000).toISOString();
        } else if (data.status === 'running' && data.started_at) {
            // Calculate elapsed time and estimate remaining
            const elapsedMs = Date.now() - new Date(data.started_at).getTime();
            const elapsedSeconds = Math.floor(elapsedMs / 1000);
            const remaining = Math.max(0, avgSeconds - elapsedSeconds);
            
            estimatedTimeRemaining = remaining;
            timeEstimateFormatted = remaining > 0 ? formatTimeEstimate(remaining) : 'Almost done...';
            estimatedCompletionTime = new Date(Date.now() + remaining * 1000).toISOString();
        }

        return {
            status: data.status,
            position,
            pagesScraped: data.pages_scraped,
            leadsFound: data.leads_found,
            errorMessage: data.error_message,
            startedAt: data.started_at,
            completedAt: data.completed_at,
            estimatedTimeRemaining,
            estimatedCompletionTime,
            timeEstimateFormatted
        };
    }

    /**
     * Check if a scrape is currently running
     */
    isRunning(): boolean {
        return this.isProcessing;
    }

    /**
     * Get current scrape ID if running
     */
    getCurrentScrapeId(): string | null {
        return this.currentScrapeId;
    }

    /**
     * Get processor status for health checks
     */
    getStatus(): {
        processorStarted: boolean;
        isProcessing: boolean;
        currentScrapeId: string | null;
        isGoLoginMode: boolean;
        scraperMode: string;
    } {
        return {
            processorStarted: this.processorStarted,
            isProcessing: this.isProcessing,
            currentScrapeId: this.currentScrapeId,
            isGoLoginMode: isGoLoginMode(),
            scraperMode: process.env.SCRAPER_MODE || 'local'
        };
    }
}

// Export singleton instance
export const scrapeQueue = new ScrapeQueue();

// Auto-start processor when imported (for Railway)
console.log('[SCRAPE-QUEUE] Module loaded');
console.log(`[SCRAPE-QUEUE] SCRAPER_MODE: ${process.env.SCRAPER_MODE || '(not set)'}`);
console.log(`[SCRAPE-QUEUE] Is GoLogin mode: ${isGoLoginMode()}`);

if (typeof process !== 'undefined' && isGoLoginMode()) {
    console.log('[SCRAPE-QUEUE] GoLogin mode detected, scheduling processor start...');
    // Delay start to allow Next.js to fully initialize
    setTimeout(() => {
        try {
            console.log('[SCRAPE-QUEUE] Auto-starting processor...');
            scrapeQueue.startProcessor();
        } catch (error) {
            console.error('[SCRAPE-QUEUE] Failed to auto-start processor:', error);
            if (error instanceof Error && error.stack) {
                console.error('[SCRAPE-QUEUE] Stack trace:', error.stack);
            }
        }
    }, 5000);
} else {
    console.log('[SCRAPE-QUEUE] Not in GoLogin mode, processor will not auto-start');
}
