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
 * POST /api/enrich/[scrapeId]/cancel
 * 
 * Cancels enrichment for a specific scrape.
 * - Marks the scrape as cancelled in the verification queue
 * - Removes queued items from in-memory queue
 * - Resets leads in "processing" state back to unprocessed
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

        // Cancel enrichment in the verification queue
        // This marks the scrape as cancelled and removes queued items
        const queuedRemoved = verificationQueue.cancelEnrichment(scrapeId);

        // Reset all leads that are in "processing" state back to unprocessed
        const { data: resetLeads, error: resetError } = await supabase
            .from('leads')
            .update({
                verification_status: null,
                verification_data: null
            })
            .eq('scrape_id', scrapeId)
            .eq('verification_status', 'processing')
            .select('id');

        if (resetError) {
            console.error('Error resetting leads during cancellation:', resetError);
            // Don't fail the entire operation - cancellation in queue already happened
        }

        const leadsReset = resetLeads?.length || 0;

        console.log(`[ENRICH-CANCEL] Cancelled enrichment for scrape ${scrapeId}: removed ${queuedRemoved} from queue, reset ${leadsReset} leads`);

        return corsJsonResponse({
            success: true,
            message: `Enrichment cancelled for scrape`,
            queuedRemoved,
            leadsReset,
            scrapeId
        }, request);

    } catch (error) {
        console.error('Error cancelling enrichment:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

