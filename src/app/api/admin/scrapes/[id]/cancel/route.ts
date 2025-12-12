import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';

/**
 * POST /api/admin/scrapes/[id]/cancel
 * 
 * Cancels a pending scrape request.
 * Admin only endpoint.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: scrapeId } = await params;
        
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const supabase = createServiceClient();

        // Get the scrape
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .select('*')
            .eq('id', scrapeId)
            .single();

        if (scrapeError || !scrape) {
            return NextResponse.json({ error: 'Scrape not found' }, { status: 404 });
        }

        // Only allow cancelling pending_approval scrapes
        if (scrape.status !== 'pending_approval') {
            return NextResponse.json({ 
                error: 'Can only cancel pending scrape requests',
                currentStatus: scrape.status
            }, { status: 400 });
        }

        // Update scrape status to cancelled
        const { error: updateError } = await supabase
            .from('scrapes')
            .update({
                status: 'cancelled',
                approved_by: user.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', scrapeId);

        if (updateError) {
            console.error('Error updating scrape:', updateError);
            return NextResponse.json({ error: 'Failed to cancel scrape' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Scrape request cancelled',
            scrapeId,
        });
    } catch (error) {
        console.error('Error in cancel:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}




