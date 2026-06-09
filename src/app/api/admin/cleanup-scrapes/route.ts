import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/admin/cleanup-scrapes
 * 
 * Check how many scrapes are in running/queued status
 */
export async function GET() {
    try {
        // Count scrapes by status
        const { data: runningCount } = await supabase
            .from('scrapes')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'running');

        const { data: queuedCount } = await supabase
            .from('scrapes')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'queued');

        // Get all running/queued scrapes with details
        const { data: activeScrapes } = await supabase
            .from('scrapes')
            .select('id, status, created_at, updated_at, name')
            .in('status', ['running', 'queued'])
            .order('created_at', { ascending: false });

        return NextResponse.json({
            success: true,
            counts: {
                running: runningCount,
                queued: queuedCount,
                total: (runningCount || 0) + (queuedCount || 0)
            },
            activeScrapes: activeScrapes || []
        });

    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

/**
 * POST /api/admin/cleanup-scrapes
 * 
 * Mark old stuck scrapes as failed
 * Body: { maxAgeMinutes?: number } - scrapes older than this will be marked failed (default 60)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const maxAgeMinutes = body.maxAgeMinutes || 60; // Default 1 hour

        const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

        // Mark old running scrapes as failed
        const { data: cleanedRunning, error: runningError } = await supabase
            .from('scrapes')
            .update({ 
                status: 'failed',
                error_message: `Automatically marked as failed - stuck in running status for over ${maxAgeMinutes} minutes`
            })
            .eq('status', 'running')
            .lt('updated_at', cutoffTime)
            .select('id');

        // Mark old queued scrapes as failed
        const { data: cleanedQueued, error: queuedError } = await supabase
            .from('scrapes')
            .update({ 
                status: 'failed',
                error_message: `Automatically marked as failed - stuck in queued status for over ${maxAgeMinutes} minutes`
            })
            .eq('status', 'queued')
            .lt('created_at', cutoffTime)
            .select('id');

        const totalCleaned = (cleanedRunning?.length || 0) + (cleanedQueued?.length || 0);

        console.log(`[CLEANUP-SCRAPES] Cleaned up ${totalCleaned} stuck scrapes (${cleanedRunning?.length || 0} running, ${cleanedQueued?.length || 0} queued)`);

        return NextResponse.json({
            success: true,
            message: `Cleaned up ${totalCleaned} stuck scrapes`,
            cleaned: {
                running: cleanedRunning?.length || 0,
                queued: cleanedQueued?.length || 0,
                total: totalCleaned
            },
            maxAgeMinutes
        });

    } catch (error) {
        console.error('[CLEANUP-SCRAPES] Error:', error);
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}


