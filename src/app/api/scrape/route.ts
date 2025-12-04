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
 * Check if a lead already exists in the database (duplicate detection)
 * Returns the original lead ID if found, null otherwise
 */
async function findExistingLead(firstName: string, lastName: string, companyName: string | null): Promise<string | null> {
    const { data } = await supabase
        .from('leads')
        .select('id')
        .ilike('first_name', firstName.trim())
        .ilike('last_name', lastName.trim())
        .ilike('company_name', companyName?.trim() || '')
        .limit(1)
        .single();

    return data?.id || null;
}

/**
 * Save leads with duplicate tracking (legacy for non-queue modes)
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
    let processedCount = 0;
    let duplicateCount = 0;
    
    // Process leads individually to check for duplicates
    for (const lead of leads) {
        const firstName = lead.first_name?.trim() || '';
        const lastName = lead.last_name?.trim() || '';
        const companyName = lead.company_name?.trim() || null;

        // Check for existing lead (duplicate detection)
        const originalLeadId = await findExistingLead(firstName, lastName, companyName);
        const isDuplicate = originalLeadId !== null;

        if (isDuplicate) {
            duplicateCount++;
            console.log(`[SCRAPE-API] Duplicate detected: ${firstName} ${lastName} at ${companyName} (original: ${originalLeadId})`);
        }

        const leadToInsert = {
            scrape_id: scrapeId,
            user_id: userId,
            first_name: firstName || null,
            last_name: lastName || null,
            title: lead.title?.trim() || null,
            company_name: companyName,
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
            is_duplicate: isDuplicate,
            original_lead_id: originalLeadId
        };

        const { data, error } = await supabase
            .from('leads')
            .insert(leadToInsert)
            .select()
            .single();

        if (error) {
            console.error(`[SCRAPE-API] Insert error for ${firstName} ${lastName}: ${error.message}`);
            errors.push(`Failed to save ${firstName} ${lastName}: ${error.message}`);
        } else if (data) {
            processedCount++;
        }
    }

    console.log(`[SCRAPE-API] Saved ${processedCount} leads (${duplicateCount} duplicates tracked)`);
    return { processedCount, errors };
}
