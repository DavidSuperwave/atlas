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
 * POST /api/browser/close
 * 
 * Closes the user's browser session.
 * This marks the session as completed and allows queued scrapes to start.
 */
export async function POST(request: Request) {
    // Handle CORS for cross-origin requests
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return corsJsonResponse({ error: 'Unauthorized' }, request, { status: 401 });
        }

        // Get session ID from request body (optional)
        let sessionId: string | null = null;
        try {
            const body = await request.json();
            sessionId = body.sessionId;
        } catch {
            // No body, will close any active session for user
        }

        // Find and close user's active session
        let query = supabase
            .from('browser_sessions')
            .update({ 
                status: 'completed', 
                ended_at: new Date().toISOString() 
            })
            .eq('user_id', user.id)
            .eq('status', 'active')
            .eq('session_type', 'manual');

        if (sessionId) {
            query = query.eq('id', sessionId);
        }

        const { data, error } = await query.select();

        if (error) {
            console.error('[BROWSER-CLOSE] Error closing session:', error);
            return corsJsonResponse({ 
                error: 'Failed to close browser session' 
            }, request, { status: 500 });
        }

        const closedCount = data?.length || 0;

        if (closedCount === 0) {
            return corsJsonResponse({
                success: true,
                message: 'No active browser session to close'
            }, request);
        }

        console.log(`[BROWSER-CLOSE] Closed ${closedCount} session(s) for user: ${user.id}`);

        // Note: GoLogin cloud browser doesn't need explicit closing - 
        // it will timeout on its own. We just mark our session as closed.

        return corsJsonResponse({
            success: true,
            closedSessions: closedCount,
            message: 'Browser session closed. Any queued scrapes will start shortly.'
        }, request);

    } catch (error) {
        console.error('[BROWSER-CLOSE] Error:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

