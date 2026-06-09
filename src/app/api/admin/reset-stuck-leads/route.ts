import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/admin/reset-stuck-leads
 * 
 * Resets leads that are stuck in "processing" status back to "pending"
 * so they can be re-enriched.
 * 
 * Body: { scrapeId?: string } - optionally reset only for a specific scrape
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { scrapeId } = body;

        let query = supabase
            .from('leads')
            .update({ 
                verification_status: 'pending',
                email: null,
                email_validity: null,
                mx_record: null,
                inbox_type: null,
                provider: null,
                verification_data: null
            })
            .eq('verification_status', 'processing');

        // If scrapeId provided, only reset leads for that scrape
        if (scrapeId) {
            query = query.eq('scrape_id', scrapeId);
        }

        const { data, error, count } = await query.select('id');

        if (error) {
            console.error('[RESET-STUCK-LEADS] Error:', error);
            return NextResponse.json({ 
                success: false, 
                error: error.message 
            }, { status: 500 });
        }

        const resetCount = data?.length || 0;
        console.log(`[RESET-STUCK-LEADS] Reset ${resetCount} stuck leads to pending`);

        return NextResponse.json({
            success: true,
            message: `Reset ${resetCount} stuck leads to pending status`,
            resetCount,
            scrapeId: scrapeId || 'all'
        });

    } catch (error) {
        console.error('[RESET-STUCK-LEADS] Error:', error);
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

/**
 * GET /api/admin/reset-stuck-leads
 * 
 * Get count of stuck processing leads
 */
export async function GET() {
    try {
        const { count, error } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('verification_status', 'processing');

        if (error) {
            return NextResponse.json({ 
                success: false, 
                error: error.message 
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            stuckCount: count || 0
        });

    } catch (error) {
        return NextResponse.json({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}


