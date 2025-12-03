import { NextResponse } from 'next/server';
import { scrapeApollo, ScrapedLead, getScraperMode } from '@/lib/scraper';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';
import { getUserProfileDbId } from '@/lib/gologin-profile-manager';

const supabase = createServiceClient();

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
    // Handle CORS for cross-origin requests
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    let scrapeId: string | null = null;
    
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

        // Create scrape record with user_id, name, tags, scraper_mode, and gologin_profile_id
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .insert({ 
                url, 
                filters, 
                status: 'running',
                user_id: user.id,
                name: name?.trim() || null,
                tags: Array.isArray(tags) ? tags : [],
                scraper_mode: scraperMode, // Track which scraper was used
                gologin_profile_id: gologinProfileDbId // Track which profile was used
            })
            .select()
            .single();

        if (scrapeError) {
            console.error('Database error:', scrapeError);
            return corsJsonResponse({ error: scrapeError.message }, request, { status: 500 });
        }

        scrapeId = scrape.id;

        // Start scraping process - pass user.id for GoLogin profile lookup
        const leads = await scrapeApollo(url, pages, user.id);
        
        // Validate and filter leads before saving
        const validLeads = leads.filter(lead => {
            // Must have first and last name
            if (!lead.first_name?.trim() || !lead.last_name?.trim()) {
                console.log(`Skipping lead without valid name: ${lead.first_name} ${lead.last_name}`);
                return false;
            }
            return true;
        });

        // Batch insert leads for better performance with user_id
        const { processedCount, errors } = await batchSaveLeads(scrape.id, user.id, validLeads);

        // Update scrape status with results
        await supabase.from('scrapes').update({ 
            status: 'completed', 
            total_leads: processedCount,
            error_details: errors.length > 0 ? { errors: errors.slice(0, 10) } : null // Store first 10 errors
        }).eq('id', scrape.id);

        return corsJsonResponse({ 
            success: true, 
            count: processedCount, 
            scrapeId: scrape.id,
            skipped: leads.length - validLeads.length,
            errors: errors.length,
            scraperMode // Include scraper mode in response for debugging
        }, request);

    } catch (error) {
        console.error('Scrape process failed:', error);
        
        // Update scrape status to failed if we have a scrape ID
        if (scrapeId) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await supabase.from('scrapes').update({ 
                status: 'failed',
                error_details: { 
                    message: errorMessage,
                    timestamp: new Date().toISOString()
                }
            }).eq('id', scrapeId);
        }
        
        return corsJsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, request, { status: 500 });
    }
}

/**
 * Batch save leads for better performance
 */
async function batchSaveLeads(scrapeId: string, userId: string, leads: ScrapedLead[]): Promise<{ processedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let processedCount = 0;
    
    // Process in batches of 50 to avoid hitting Supabase limits
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE);
        
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
            // Handle batch errors - try individual inserts as fallback
            console.error(`Batch insert error: ${error.message}`);
            
            // Fall back to individual inserts for this batch
            for (const leadData of leadsToInsert) {
                const { data: singleData, error: singleError } = await supabase
                    .from('leads')
                    .insert(leadData)
                    .select()
                    .single();

                if (singleError) {
                    if (singleError.code === '23505') {
                        // Duplicate - not an error, just skip
                        console.log(`Duplicate lead skipped: ${leadData.first_name} ${leadData.last_name}`);
                    } else {
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
