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
 * POST /api/browser/heartbeat
 * 
 * Updates the heartbeat for user's active browser session.
 * Called periodically by frontend to keep session alive.
 * Sessions without heartbeat for 30 minutes are considered stale.
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
            // No body, will update any active session for user
        }

        // Update heartbeat for user's active session
        let query = supabase
            .from('browser_sessions')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('status', 'active')
            .eq('session_type', 'manual');

        if (sessionId) {
            query = query.eq('id', sessionId);
        }

        const { data, error } = await query.select();

        if (error) {
            console.error('[BROWSER-HEARTBEAT] Error:', error);
            return corsJsonResponse({ 
                error: 'Failed to update heartbeat' 
            }, request, { status: 500 });
        }

        if (!data || data.length === 0) {
            return corsJsonResponse({
                success: false,
                message: 'No active session found'
            }, request, { status: 404 });
        }

        return corsJsonResponse({
            success: true,
            sessionId: data[0].id
        }, request);

    } catch (error) {
        console.error('[BROWSER-HEARTBEAT] Error:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, request, { status: 500 });
    }
}

