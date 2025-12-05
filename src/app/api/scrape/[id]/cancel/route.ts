import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';

const supabase = createServiceClient();

export const runtime = 'nodejs';

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/scrape/[id]/cancel
 * 
 * Cancels a pending or running scrape.
 * - Pending scrapes are immediately cancelled
 * - Running scrapes are marked for cancellation (will stop after current page)
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
            .select('*')
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

        // Check if scrape can be cancelled
        if (scrape.status === 'completed') {
            return corsJsonResponse({ error: 'Scrape already completed' }, request, { status: 400 });
        }
        
        if (scrape.status === 'failed') {
            return corsJsonResponse({ error: 'Scrape already failed' }, request, { status: 400 });
        }
        
        if (scrape.status === 'cancelled') {
            return corsJsonResponse({ error: 'Scrape already cancelled' }, request, { status: 400 });
        }

        // Update scrape status to cancelled
        const { error: updateError } = await supabase
            .from('scrapes')
            .update({ 
                status: 'cancelled',
                error_details: { 
                    message: 'Cancelled by user',
                    cancelled_by: user.id,
                    cancelled_at: new Date().toISOString()
                }
            })
            .eq('id', id);

        if (updateError) {
            console.error('Error cancelling scrape:', updateError);
            return corsJsonResponse({ error: 'Failed to cancel scrape' }, request, { status: 500 });
        }

        // Also update the queue entry if exists
        await supabase
            .from('scrape_queue')
            .update({ 
                status: 'cancelled',
                completed_at: new Date().toISOString(),
                error_message: 'Cancelled by user'
            })
            .eq('scrape_id', id);

        // Close any active browser session for this scrape
        await supabase
            .from('browser_sessions')
            .update({ 
                status: 'completed',
                ended_at: new Date().toISOString()
            })
            .eq('scrape_id', id)
            .eq('status', 'active');

        console.log(`[SCRAPE-CANCEL] Scrape ${id} cancelled by user ${user.id}`);

        return corsJsonResponse({
            success: true,
            message: 'Scrape cancelled',
            id: id,
            previousStatus: scrape.status
        }, request);

    } catch (error) {
        console.error('Error cancelling scrape:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

