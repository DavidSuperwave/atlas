import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';
import { verificationQueue } from '@/lib/verification-queue';

const supabase = createServiceClient();

export const runtime = 'nodejs';

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/enrich/[scrapeId]/reset
 * 
 * Resets all leads for a scrape that are in "processing" state.
 * - Clears verification_status back to null
 * - Clears verification_data
 * - Removes queued items from in-memory queue
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ scrapeId: string }> }
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

        const { scrapeId } = await params;

        if (!scrapeId) {
            return corsJsonResponse({ error: 'Scrape ID is required' }, request, { status: 400 });
        }

        // Get scrape record
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .select('*')
            .eq('id', scrapeId)
            .single();

        if (scrapeError || !scrape) {
            return corsJsonResponse({ error: 'Scrape not found' }, request, { status: 404 });
        }

        // Verify ownership (or admin)
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        
        const isAdmin = profile?.role === 'admin';
        
        if (scrape.user_id !== user.id && !isAdmin) {
            return corsJsonResponse({ error: 'Not authorized' }, request, { status: 403 });
        }

        // Remove queued items from in-memory queue
        const queuedRemoved = verificationQueue.removeQueuedItemsForScrape(scrapeId);
        
        // Clear cancellation flag if set (so enrichment can be restarted)
        verificationQueue.clearCancellation(scrapeId);

        // Reset all leads that are in "processing" state
        const { data: resetLeads, error: resetError } = await supabase
            .from('leads')
            .update({
                verification_status: null,
                verification_data: null,
                email: null,
                email_validity: null,
                mx_record: null,
                inbox_type: null,
                provider: null
            })
            .eq('scrape_id', scrapeId)
            .eq('verification_status', 'processing')
            .select('id');

        if (resetError) {
            console.error('Error resetting leads:', resetError);
            return corsJsonResponse({ error: 'Failed to reset leads' }, request, { status: 500 });
        }

        const leadsReset = resetLeads?.length || 0;

        console.log(`[ENRICH-RESET] Reset ${leadsReset} leads for scrape ${scrapeId}, removed ${queuedRemoved} from queue`);

        return corsJsonResponse({
            success: true,
            message: `Reset ${leadsReset} leads for enrichment`,
            leadsReset,
            queuedRemoved,
            scrapeId
        }, request);

    } catch (error) {
        console.error('Error resetting enrichment:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

