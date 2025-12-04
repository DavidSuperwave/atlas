import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';
import { scrapeQueue } from '@/lib/scrape-queue';

const supabase = createServiceClient();

export const runtime = 'nodejs';

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/scrape/[id]/status
 * 
 * Returns the status of a scrape request, including queue position if pending.
 * Used by frontend to poll for scrape completion.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    // Handle CORS for cross-origin requests
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return corsJsonResponse({ error: 'Unauthorized' }, request, { status: 401 });
        }

        const { id } = await params;

        if (!id) {
            return corsJsonResponse({ error: 'Scrape ID is required' }, request, { status: 400 });
        }

        // Get scrape record
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .select('*')
            .eq('id', id)
            .single();

        if (scrapeError || !scrape) {
            return corsJsonResponse({ error: 'Scrape not found' }, request, { status: 404 });
        }

        // Verify ownership
        if (scrape.user_id !== user.id) {
            return corsJsonResponse({ error: 'Not authorized' }, request, { status: 403 });
        }

        // Get queue status if applicable
        const queueStatus = await scrapeQueue.getQueueStatus(id);

        // Get lead count
        const { count: leadCount } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('scrape_id', id);

        // Get browser state for additional context
        const browserState = await scrapeQueue.getBrowserState();

        // Build response based on status
        let message = '';
        switch (scrape.status) {
            case 'queued':
                if (queueStatus.position && queueStatus.position > 1) {
                    message = `Queued. Position: ${queueStatus.position}`;
                } else if (browserState.state === 'manual_use') {
                    message = 'Waiting for browser to become available';
                } else {
                    message = 'Starting soon...';
                }
                break;
            case 'running':
                message = 'Scraping in progress...';
                break;
            case 'completed':
                message = `Completed. Found ${leadCount || 0} leads.`;
                break;
            case 'failed':
                message = scrape.error_details?.message || 'Scrape failed';
                break;
            default:
                message = scrape.status;
        }

        return corsJsonResponse({
            id: scrape.id,
            status: scrape.status,
            url: scrape.url,
            totalLeads: leadCount || 0,
            queuePosition: queueStatus.position,
            pagesScraped: queueStatus.pagesScraped,
            leadsFound: queueStatus.leadsFound,
            browserState: browserState.state,
            message,
            errorDetails: scrape.error_details,
            createdAt: scrape.created_at,
            startedAt: queueStatus.startedAt,
            completedAt: queueStatus.completedAt
        }, request);

    } catch (error) {
        console.error('Error getting scrape status:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

