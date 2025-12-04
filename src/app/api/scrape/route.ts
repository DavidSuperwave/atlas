import { NextResponse } from 'next/server';
import { getScraperMode } from '@/lib/scraper';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';
import { getUserProfileDbId } from '@/lib/gologin-profile-manager';
import { scrapeQueue } from '@/lib/scrape-queue';

const supabase = createServiceClient();

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/scrape
 * 
 * Creates a scrape request and adds it to the queue.
 * Returns immediately with queue status (202 Accepted).
 * 
 * For GoLogin mode: Uses queue system for sequential processing
 * For other modes: Falls back to synchronous processing (legacy)
 */
export async function POST(request: Request) {
    // Handle CORS for cross-origin requests
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    
    // Get current scraper mode for logging and tracking
    const scraperMode = getScraperMode();
    console.log(`[SCRAPE-API] Starting scrape with mode: ${scraperMode}`);
    
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return corsJsonResponse({ error: 'Unauthorized' }, request, { status: 401 });
        }

        const { url, filters, pages = 1, name, tags = [] } = await request.json();

        if (!url) {
            return corsJsonResponse({ error: 'URL is required' }, request, { status: 400 });
        }

        // Get the user's assigned GoLogin profile ID for tracking (if using gologin mode)
        let gologinProfileDbId: string | null = null;
        if (scraperMode === 'gologin') {
            gologinProfileDbId = await getUserProfileDbId(user.id);
        }

        // Create scrape record with status 'queued' for gologin mode, 'running' for others
        const initialStatus = scraperMode === 'gologin' ? 'queued' : 'running';
        
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .insert({ 
                url, 
                filters: { ...filters, pages }, // Store pages in filters
                status: initialStatus,
                user_id: user.id,
                name: name?.trim() || null,
                tags: Array.isArray(tags) ? tags : [],
                scraper_mode: scraperMode,
                gologin_profile_id: gologinProfileDbId
            })
            .select()
            .single();

        if (scrapeError) {
            console.error('Database error:', scrapeError);
            return corsJsonResponse({ error: scrapeError.message }, request, { status: 500 });
        }

        // For GoLogin mode: Add to queue and return immediately
        if (scraperMode === 'gologin') {
            console.log(`[SCRAPE-API] Adding scrape to queue: ${scrape.id}`);
            
            const queueResult = await scrapeQueue.addToQueue(scrape.id, user.id);
            
            if (!queueResult.success) {
                // Update scrape status to failed
                await supabase.from('scrapes').update({ 
                    status: 'failed',
                    error_details: { message: queueResult.error }
                }).eq('id', scrape.id);
                
                return corsJsonResponse({ 
                    error: queueResult.error || 'Failed to add to queue' 
                }, request, { status: 500 });
            }

            // Return 202 Accepted with queue info
            return corsJsonResponse({ 
                success: true, 
                scrapeId: scrape.id,
                queueId: queueResult.queueId,
                status: 'queued',
                position: queueResult.position,
                browserState: queueResult.browserState,
                message: queueResult.browserState === 'manual_use' 
                    ? 'Browser is in use. Scrape will start when browser is available.'
                    : queueResult.position && queueResult.position > 1
                    ? `Scrape queued. Position: ${queueResult.position}`
                    : 'Scrape queued and will start shortly.',
                scraperMode
            }, request, { status: 202 });
        }

        // For other modes: Run synchronously (legacy behavior)
        // This maintains backward compatibility with local/dolphin modes
        const { scrapeApollo } = await import('@/lib/scraper');
        const leads = await scrapeApollo(url, pages, user.id);
        
        // Validate and filter leads before saving
        const validLeads = leads.filter(lead => {
            if (!lead.first_name?.trim() || !lead.last_name?.trim()) {
                console.log(`Skipping lead without valid name: ${lead.first_name} ${lead.last_name}`);
                return false;
            }
            return true;
        });

        // Batch insert leads
        const { processedCount, errors } = await batchSaveLeads(scrape.id, user.id, validLeads);

        // Update scrape status with results
        await supabase.from('scrapes').update({ 
            status: 'completed', 
            total_leads: processedCount,
            error_details: errors.length > 0 ? { errors: errors.slice(0, 10) } : null
        }).eq('id', scrape.id);

        return corsJsonResponse({ 
            success: true, 
            count: processedCount, 
            scrapeId: scrape.id,
            skipped: leads.length - validLeads.length,
            errors: errors.length,
            scraperMode
        }, request);

    } catch (error) {
        console.error('Scrape process failed:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

/**
 * Save leads using FAST batch insert (duplicates marked async)
 */
async function batchSaveLeads(scrapeId: string, userId: string, leads: { 
    first_name?: string; 
    last_name?: string; 
    title?: string;
    company_name?: string;
    company_linkedin?: string;
    location?: string;
    company_size?: string;
    industry?: string;
    website?: string;
    keywords?: string[];
    phone_numbers?: string[];
    linkedin_url?: string;
}[]): Promise<{ processedCount: number; errors: string[] }> {
    const errors: string[] = [];
    
    // Filter out invalid leads
    const validLeads = leads.filter(lead => lead.first_name?.trim() && lead.last_name?.trim());
    
    if (validLeads.length === 0) {
        return { processedCount: 0, errors: [] };
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
    console.log(`[SCRAPE-API] Batch inserting ${leadsToInsert.length} leads...`);
    const { data, error } = await supabase
        .from('leads')
        .insert(leadsToInsert)
        .select('id');

    if (error) {
        console.error(`[SCRAPE-API] Batch insert error: ${error.message}`);
        errors.push(`Batch insert failed: ${error.message}`);
        return { processedCount: 0, errors };
    }

    const processedCount = data?.length || 0;
    console.log(`[SCRAPE-API] ✓ Batch inserted ${processedCount} leads`);
    
    // Trigger async duplicate marking (doesn't block the response)
    markDuplicatesAsync(scrapeId).catch(err => {
        console.error(`[SCRAPE-API] Async duplicate marking failed:`, err);
    });

    return { processedCount, errors };
}

/**
 * Mark duplicates asynchronously AFTER leads are saved
 */
async function markDuplicatesAsync(scrapeId: string): Promise<void> {
    console.log(`[SCRAPE-API] Starting async duplicate marking for scrape ${scrapeId}...`);
    
    try {
        // Get all leads from this scrape
        const { data: scrapeLeads, error: fetchError } = await supabase
            .from('leads')
            .select('id, first_name, last_name, company_name, created_at')
            .eq('scrape_id', scrapeId);

        if (fetchError || !scrapeLeads) {
            console.error(`[SCRAPE-API] Failed to fetch leads for duplicate check:`, fetchError);
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

        console.log(`[SCRAPE-API] ✓ Async duplicate marking complete: ${duplicateCount} duplicates found`);
    } catch (error) {
        console.error(`[SCRAPE-API] Error in async duplicate marking:`, error);
    }
}
