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

        // Check if session is stale (no heartbeat in 30 minutes)
        const lastHeartbeat = new Date(activeSession.last_heartbeat).getTime();
        const now = Date.now();
        if (now - lastHeartbeat > 30 * 60 * 1000) {
            // Mark as completed and return available
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
     * Save leads to database (batch insert)
     */
    async saveLeads(scrapeId: string, userId: string, leads: ScrapedLead[]): Promise<{ processedCount: number; errors: string[] }> {
        const errors: string[] = [];
        let processedCount = 0;

        // Filter out invalid leads
        const validLeads = leads.filter(lead => {
            if (!lead.first_name?.trim() || !lead.last_name?.trim()) {
                return false;
            }
            return true;
        });

        // Process in batches of 50
        const BATCH_SIZE = 50;
        
        for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
            const batch = validLeads.slice(i, i + BATCH_SIZE);
            
            const leadsToInsert = batch.map(lead => ({
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
                linkedin_url: lead.linkedin_url?.trim() || null
            }));

            const { data, error } = await supabase
                .from('leads')
                .insert(leadsToInsert)
                .select();

            if (error) {
                console.error(`[SCRAPE-QUEUE] Batch insert error: ${error.message}`);
                // Fall back to individual inserts
                for (const leadData of leadsToInsert) {
                    const { data: singleData, error: singleError } = await supabase
                        .from('leads')
                        .insert(leadData)
                        .select()
                        .single();

                    if (singleError) {
                        if (singleError.code !== '23505') { // Not a duplicate
                            errors.push(`Failed to save ${leadData.first_name} ${leadData.last_name}: ${singleError.message}`);
                        }
                    } else if (singleData) {
                        processedCount++;
                    }
                }
            } else if (data) {
                processedCount += data.length;
            }
        }

        return { processedCount, errors };
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
     * Get queue status for a scrape
     */
    async getQueueStatus(scrapeId: string): Promise<{
        status: 'pending' | 'running' | 'completed' | 'failed' | 'not_found';
        position?: number;
        pagesScraped?: number;
        leadsFound?: number;
        errorMessage?: string;
        startedAt?: string;
        completedAt?: string;
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
        if (data.status === 'pending') {
            const { count } = await supabase
                .from('scrape_queue')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .lt('created_at', data.created_at);
            position = (count || 0) + 1;
        }

        return {
            status: data.status,
            position,
            pagesScraped: data.pages_scraped,
            leadsFound: data.leads_found,
            errorMessage: data.error_message,
            startedAt: data.started_at,
            completedAt: data.completed_at
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

