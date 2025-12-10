import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';
import { goLoginClient } from '@/lib/gologin-client';
import { scrapeQueue } from '@/lib/scrape-queue';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const supabase = createServiceClient();

export const runtime = 'nodejs';

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/browser/access
 * 
 * Starts a GoLogin cloud browser for manual user access.
 * Returns the remoteOrbitaUrl for embedding in an iframe.
 * 
 * Checks for conflicts:
 * - If scrape is running, returns error
 * - If another user has browser open, returns error
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

        // Rate limit per user for browser access
        const rateLimit = checkRateLimit(user.id, RATE_LIMITS.BROWSER_ACCESS);
        if (rateLimit.limited) {
            return corsJsonResponse({
                error: 'Rate limit exceeded',
                retryAfter: rateLimit.resetInSeconds
            }, request, {
                status: 429,
                headers: { 'Retry-After': rateLimit.resetInSeconds.toString() }
            });
        }

        // Check browser state
        const { state, session } = await scrapeQueue.getBrowserState();

        if (state === 'scraping') {
            return corsJsonResponse({ 
                error: 'Browser is currently being used for scraping',
                browserState: state,
                message: 'Please wait for the scrape to complete before accessing the browser.'
            }, request, { status: 409 }); // Conflict
        }

        if (state === 'manual_use') {
            // Check if it's the same user
            if (session?.user_id === user.id) {
                // Same user, get existing session
                const { data: existingSession } = await supabase
                    .from('browser_sessions')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .single();

                if (existingSession?.remote_url) {
                    // Update heartbeat
                    await supabase
                        .from('browser_sessions')
                        .update({ last_heartbeat: new Date().toISOString() })
                        .eq('id', existingSession.id);

                    return corsJsonResponse({
                        success: true,
                        url: existingSession.remote_url,
                        sessionId: existingSession.id,
                        message: 'Reconnected to existing browser session'
                    }, request);
                }
            }

            return corsJsonResponse({ 
                error: 'Browser is currently being used by another user',
                browserState: state,
                message: 'Please wait for the other user to finish.'
            }, request, { status: 409 }); // Conflict
        }

        // Browser is available - start cloud browser
        console.log(`[BROWSER-ACCESS] Starting cloud browser for user: ${user.id}`);

        const profileId = process.env.GOLOGIN_PROFILE_ID;
        if (!profileId) {
            return corsJsonResponse({ 
                error: 'GoLogin profile not configured',
                message: 'GOLOGIN_PROFILE_ID environment variable is not set.'
            }, request, { status: 500 });
        }

        // Start cloud browser
        const result = await goLoginClient.startCloudBrowser(profileId);

        if (!result.success || !result.url) {
            return corsJsonResponse({ 
                error: result.error || 'Failed to start cloud browser',
                message: 'Could not start the browser. Please try again.'
            }, request, { status: 500 });
        }

        // Create browser session record
        const { data: newSession, error: sessionError } = await supabase
            .from('browser_sessions')
            .insert({
                profile_id: profileId,
                user_id: user.id,
                session_type: 'manual',
                status: 'active',
                remote_url: result.url,
                last_heartbeat: new Date().toISOString()
            })
            .select()
            .single();

        if (sessionError) {
            console.error('[BROWSER-ACCESS] Failed to create session record:', sessionError);
        }

        console.log(`[BROWSER-ACCESS] Browser started successfully for user: ${user.id}`);

        return corsJsonResponse({
            success: true,
            url: result.url,
            sessionId: newSession?.id,
            message: 'Browser started successfully'
        }, request);

    } catch (error) {
        console.error('[BROWSER-ACCESS] Error starting browser:', error);
        return corsJsonResponse({ 
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to start browser. Please try again.'
        }, request, { status: 500 });
    }
}

