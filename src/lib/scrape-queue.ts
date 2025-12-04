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

import { createClient } from '@supabase/supabase-js';
import { scrapeApollo } from './scraper-gologin';
import { ScrapedLead } from './scraper-types';

// Use service role client for queue operations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
 * Scrape Queue Manager
 * 
 * Handles sequential processing of scrape requests
 */
class ScrapeQueue {
    private isProcessing = false;
    private processorInterval: ReturnType<typeof setInterval> | null = null;
    private currentScrapeId: string | null = null;

    constructor() {
        console.log('[SCRAPE-QUEUE] Queue manager initialized');
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

        console.log('[SCRAPE-QUEUE] Starting queue processor...');
        
        // Process immediately on start
        this.processNext();

        // Then poll regularly
        this.processorInterval = setInterval(() => {
            this.processNext();
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
            console.log('[SCRAPE-QUEUE] Processor stopped');
        }
    }

    /**
     * Check if the browser is available for scraping
     */
    async getBrowserState(): Promise<{ state: BrowserState; session?: { user_id: string; session_type: string } }> {
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

            // Run the scraper
            console.log(`[SCRAPE-QUEUE] Starting scraper for URL: ${scrapeDetails.url}`);
            const leads = await scrapeApollo(scrapeDetails.url, pages, nextItem.user_id);

            // Save leads to database
            const { processedCount, errors } = await this.saveLeads(
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

            console.log(`[SCRAPE-QUEUE] ✓ Scrape completed: ${processedCount} leads saved`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[SCRAPE-QUEUE] Scrape failed:`, errorMessage);

            // Update queue status to failed
            if (this.currentScrapeId) {
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
            }

        } finally {
            this.isProcessing = false;
            this.currentScrapeId = null;
        }
    }

    /**
     * Save leads to database using FAST batch insert
     * Duplicates are marked asynchronously AFTER insert to avoid blocking
     */
    async saveLeads(scrapeId: string, userId: string, leads: ScrapedLead[]): Promise<{ processedCount: number; duplicateCount: number; errors: string[] }> {
        const errors: string[] = [];
        let processedCount = 0;

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

        // Prepare all leads for batch insert (NO duplicate check - that happens async)
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
            is_duplicate: false,  // Will be updated async
            original_lead_id: null  // Will be updated async
        }));

        // SINGLE batch insert - much faster than individual inserts
        console.log(`[SCRAPE-QUEUE] Batch inserting ${leadsToInsert.length} leads...`);
        const { data, error } = await supabase
            .from('leads')
            .insert(leadsToInsert)
            .select('id');

        if (error) {
            console.error(`[SCRAPE-QUEUE] Batch insert error: ${error.message}`);
            errors.push(`Batch insert failed: ${error.message}`);
        } else {
            processedCount = data?.length || 0;
            console.log(`[SCRAPE-QUEUE] ✓ Batch inserted ${processedCount} leads`);
            
            // Trigger async duplicate marking (doesn't block the user)
            this.markDuplicatesAsync(scrapeId).catch(err => {
                console.error(`[SCRAPE-QUEUE] Async duplicate marking failed:`, err);
            });
        }

        return { processedCount, duplicateCount: 0, errors };
    }

    /**
     * Mark duplicates asynchronously AFTER leads are saved
     * This runs in the background and doesn't block the scrape
     */
    async markDuplicatesAsync(scrapeId: string): Promise<void> {
        console.log(`[SCRAPE-QUEUE] Starting async duplicate marking for scrape ${scrapeId}...`);
        
        try {
            // Get all leads from this scrape
            const { data: scrapeLeads, error: fetchError } = await supabase
                .from('leads')
                .select('id, first_name, last_name, company_name, created_at')
                .eq('scrape_id', scrapeId);

            if (fetchError || !scrapeLeads) {
                console.error(`[SCRAPE-QUEUE] Failed to fetch leads for duplicate check:`, fetchError);
                return;
            }

            let duplicateCount = 0;

            // For each lead in this scrape, check if an older lead exists with same name/company
            for (const lead of scrapeLeads) {
                const { data: existingLead } = await supabase
                    .from('leads')
                    .select('id')
                    .ilike('first_name', lead.first_name || '')
                    .ilike('last_name', lead.last_name || '')
                    .ilike('company_name', lead.company_name || '')
                    .lt('created_at', lead.created_at)  // Only older leads
                    .neq('id', lead.id)  // Not itself
                    .limit(1)
                    .single();

                if (existingLead) {
                    // Mark as duplicate
                    await supabase
                        .from('leads')
                        .update({ 
                            is_duplicate: true, 
                            original_lead_id: existingLead.id 
                        })
                        .eq('id', lead.id);
                    duplicateCount++;
                }
            }

            console.log(`[SCRAPE-QUEUE] ✓ Async duplicate marking complete: ${duplicateCount} duplicates found`);
        } catch (error) {
            console.error(`[SCRAPE-QUEUE] Error in async duplicate marking:`, error);
        }
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
}

// Export singleton instance
export const scrapeQueue = new ScrapeQueue();

// Auto-start processor when imported (for Railway)
if (typeof process !== 'undefined' && process.env.SCRAPER_MODE === 'gologin') {
    // Delay start slightly to allow for initialization
    setTimeout(() => {
        scrapeQueue.startProcessor();
    }, 5000);
}

