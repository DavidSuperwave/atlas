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
 * POST /api/scrape/[id]/cancel-enrichment
 * 
 * Cancels pending enrichment for a scrape by resetting leads stuck in 'processing' status.
 * This is useful when leads get stuck due to server restarts or queue issues.
 * 
 * - Resets leads with 'processing' status back to 'pending'
 * - Clears partial verification data
 * - Note: Items already in the verification queue will still be processed,
 *   but their status will be reset so they can be re-enriched if needed
 */
export async function POST(
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
            .select('user_id')
            .eq('id', id)
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

        // Find all leads with 'processing' status for this scrape
        const { data: processingLeads, error: leadsError } = await supabase
            .from('leads')
            .select('id')
            .eq('scrape_id', id)
            .eq('verification_status', 'processing');

        if (leadsError) {
            console.error('[CANCEL-ENRICHMENT] Error fetching processing leads:', leadsError);
            return corsJsonResponse({ error: 'Failed to fetch leads' }, request, { status: 500 });
        }

        const processingCount = processingLeads?.length || 0;

        if (processingCount === 0) {
            return corsJsonResponse({
                success: true,
                message: 'No leads in processing status',
                reset_count: 0
            }, request);
        }

        console.log(`[CANCEL-ENRICHMENT] Resetting ${processingCount} leads from 'processing' to 'pending' for scrape ${id}`);

        // Reset leads: set status back to 'pending' and clear partial verification data
        const { data: updatedLeads, error: updateError } = await supabase
            .from('leads')
            .update({
                verification_status: 'pending',
                // Clear partial verification data (but keep email if it was already set)
                // Don't clear email_validity, mx_record, etc. if they were already set
                // Only clear verification_data to remove partial processing info
                verification_data: null,
                // Clear provider and api_key_used since they're from partial processing
                provider: null,
                api_key_used: null
            })
            .eq('scrape_id', id)
            .eq('verification_status', 'processing')
            .select('id');

        if (updateError) {
            console.error('[CANCEL-ENRICHMENT] Error resetting leads:', updateError);
            return corsJsonResponse({ error: 'Failed to reset leads' }, request, { status: 500 });
        }

        const resetCount = updatedLeads?.length || 0;

        console.log(`[CANCEL-ENRICHMENT] ✓ Reset ${resetCount} leads for scrape ${id}`);

        // Note: Items in the verification queue will still be processed, but since we've
        // reset their status, they won't cause issues. If they're still in queue,
        // they'll be processed but may overwrite the 'pending' status.
        // This is acceptable as it ensures leads aren't stuck.

        return corsJsonResponse({
            success: true,
            message: `Reset ${resetCount} leads from processing status`,
            reset_count: resetCount,
            scrape_id: id
        }, request);

    } catch (error) {
        console.error('[CANCEL-ENRICHMENT] Error cancelling enrichment:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

