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

// Lazy-loaded scraper function to avoid module load issues
let scrapeApolloFn: ((url: string, pages?: number, userId?: string) => Promise<ScrapedLead[]>) | null = null;

async function getScrapeApollo() {
    if (!scrapeApolloFn) {
        const module = await import('./scraper-gologin');
        scrapeApolloFn = module.scrapeApollo;
    }
    return scrapeApolloFn;
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
const MAX_SCRAPE_DURATION = 15 * 60 * 1000; // 15 minutes

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
        
        // Process immediately on start
        this.processNext().catch(err => {
            console.error('[SCRAPE-QUEUE] Error in initial processNext:', err);
        });

        // Then poll regularly
        this.processorInterval = setInterval(() => {
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
     * Check if the browser is available for scraping
     */
    async getBrowserState(): Promise<{ state: BrowserState; session?: { user_id: string; session_type: string } }> {
        const supabase = getSupabase();
        const { data: activeSession } = await supabase
            .from('browser_sessions')
            .select('*')
            .eq('status', 'active')
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

        if (!activeSession) {
            return { state: 'available' };
        }

        // Check if session is stale (no heartbeat in 30 minutes, or started > 30 min ago)
        const lastHeartbeat = activeSession.last_heartbeat 
            ? new Date(activeSession.last_heartbeat).getTime() 
            : new Date(activeSession.started_at).getTime();
        const now = Date.now();
        
        // If no activity for 30 minutes OR session started more than 30 minutes ago, mark as stale
        if (now - lastHeartbeat > 30 * 60 * 1000) {
            console.log(`[SCRAPE-QUEUE] Clearing stale browser session: ${activeSession.id}`);
            await supabase
                .from('browser_sessions')
                .update({ status: 'completed', ended_at: new Date().toISOString() })
                .eq('id', activeSession.id);
            return { state: 'available' };
        }

        if (activeSession.session_type === 'manual') {
            return { 
                state: 'manual_use', 
                session: { user_id: activeSession.user_id, session_type: 'manual' } 
            };
        }

        return { 
            state: 'scraping', 
            session: { user_id: activeSession.user_id, session_type: 'scrape' } 
        };
    }

    /**
     * Get the next pending scrape from the queue
     */
    async getNextPendingScrape(): Promise<ScrapeQueueItem | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('scrape_queue')
            .select('*')
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (error || !data) {
            return null;
        }

        return data as ScrapeQueueItem;
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

        try {
            const supabase = getSupabase();
            
            // Check browser availability
            const { state } = await this.getBrowserState();
            if (state !== 'available') {
                // Browser is in use, skip this cycle
                return;
            }

            // Get next pending scrape
            const nextItem = await this.getNextPendingScrape();
            if (!nextItem) {
                // No pending scrapes
                return;
            }

            // Mark as processing
            this.isProcessing = true;
            this.currentScrapeId = nextItem.scrape_id;

            console.log(`[SCRAPE-QUEUE] Processing scrape: ${nextItem.scrape_id}`);

            // Update queue status to running
            await supabase
                .from('scrape_queue')
                .update({ 
                    status: 'running', 
                    started_at: new Date().toISOString() 
                })
                .eq('id', nextItem.id);

            // Create browser session record
            const { data: session } = await supabase
                .from('browser_sessions')
                .insert({
                    profile_id: process.env.GOLOGIN_PROFILE_ID || 'default',
                    user_id: nextItem.user_id,
                    session_type: 'scrape',
                    status: 'active',
                    scrape_id: nextItem.scrape_id
                })
                .select()
                .single();

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

            // Extract pages from URL or default to 1
            const pages = 1; // Could parse from filters if needed

            // Run the scraper (lazy load to avoid module issues)
            console.log(`[SCRAPE-QUEUE] Starting scraper for URL: ${scrapeDetails.url}`);
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
            if (session) {
                await supabase
                    .from('browser_sessions')
                    .update({ 
                        status: 'completed', 
                        ended_at: new Date().toISOString() 
                    })
                    .eq('id', session.id);
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

                    // Close any active browser session for this scrape
                    await supabase
                        .from('browser_sessions')
                        .update({ 
                            status: 'error', 
                            ended_at: new Date().toISOString() 
                        })
                        .eq('scrape_id', this.currentScrapeId)
                        .eq('status', 'active');
                } catch (updateError) {
                    console.error('[SCRAPE-QUEUE] Failed to update status after error:', updateError);
                }
            }

        } finally {
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
// Only auto-start if explicitly enabled via ENABLE_SCRAPE_QUEUE env var
// This prevents startup issues on platforms with limited resources
const shouldAutoStart = process.env.ENABLE_SCRAPE_QUEUE === 'true' && isGoLoginMode();

console.log('[SCRAPE-QUEUE] Module loaded');
console.log(`[SCRAPE-QUEUE] SCRAPER_MODE: ${process.env.SCRAPER_MODE || '(not set)'}`);
console.log(`[SCRAPE-QUEUE] ENABLE_SCRAPE_QUEUE: ${process.env.ENABLE_SCRAPE_QUEUE || '(not set)'}`);
console.log(`[SCRAPE-QUEUE] Is GoLogin mode: ${isGoLoginMode()}`);
console.log(`[SCRAPE-QUEUE] Should auto-start: ${shouldAutoStart}`);

if (typeof process !== 'undefined' && shouldAutoStart) {
    console.log('[SCRAPE-QUEUE] Auto-start enabled, scheduling processor start...');
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
    }, 10000); // Increased to 10s to give Next.js more time
} else {
    console.log('[SCRAPE-QUEUE] Auto-start disabled or not in GoLogin mode');
}
