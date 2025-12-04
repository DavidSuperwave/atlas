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
 * GET /api/browser/status
 * 
 * Returns the current browser state:
 * - available: Browser is free
 * - manual_use: User is using browser manually
 * - scraping: Scrape is in progress
 */
export async function GET(request: Request) {
    // Handle CORS for cross-origin requests
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return corsJsonResponse({ error: 'Unauthorized' }, request, { status: 401 });
        }

        // Get browser state
        const { state, session } = await scrapeQueue.getBrowserState();

        // Get active session details if any
        let sessionDetails = null;
        if (state !== 'available') {
            const { data: activeSession } = await supabase
                .from('browser_sessions')
                .select('*')
                .eq('status', 'active')
                .order('started_at', { ascending: false })
                .limit(1)
                .single();

            if (activeSession) {
                sessionDetails = {
                    id: activeSession.id,
                    type: activeSession.session_type,
                    userId: activeSession.user_id,
                    isCurrentUser: activeSession.user_id === user.id,
                    scrapeId: activeSession.scrape_id,
                    startedAt: activeSession.started_at,
                    remoteUrl: activeSession.user_id === user.id ? activeSession.remote_url : null
                };
            }
        }

        // Get queue info
        const pendingScrapes = await supabase
            .from('scrape_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        let message = '';
        switch (state) {
            case 'available':
                message = 'Browser is available';
                break;
            case 'manual_use':
                message = session?.user_id === user.id 
                    ? 'You are using the browser'
                    : 'Another user is using the browser';
                break;
            case 'scraping':
                message = 'Browser is being used for scraping';
                break;
        }

        return corsJsonResponse({
            state,
            message,
            session: sessionDetails,
            queuedScrapes: pendingScrapes.count || 0,
            isCurrentUserSession: sessionDetails?.isCurrentUser || false
        }, request);

    } catch (error) {
        console.error('[BROWSER-STATUS] Error:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

