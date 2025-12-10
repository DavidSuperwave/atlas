import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';

/**
 * GET /api/admin/scrapes/completed-with-leads
 * 
 * Returns completed scrapes that have valid or catchall leads available for transfer.
 * Only returns scrapes that can be used as source for transfer.
 */
export async function GET() {
    try {
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

        // Get completed scrapes with lead counts
        const { data: scrapes, error: scrapesError } = await supabase
            .from('scrapes')
            .select('id, url, name, created_at, total_leads')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(50);

        if (scrapesError) {
            console.error('Error fetching scrapes:', scrapesError);
            return NextResponse.json({ error: 'Failed to fetch scrapes' }, { status: 500 });
        }

        if (!scrapes || scrapes.length === 0) {
            return NextResponse.json({ scrapes: [] });
        }

        // Get lead counts for each scrape
        const scrapesWithLeads = await Promise.all(
            scrapes.map(async (scrape) => {
                const { data: leadCounts } = await supabase
                    .from('leads')
                    .select('verification_status')
                    .eq('scrape_id', scrape.id)
                    .in('verification_status', ['valid', 'catchall']);

                const validLeads = leadCounts?.filter(l => l.verification_status === 'valid').length || 0;
                const catchallLeads = leadCounts?.filter(l => l.verification_status === 'catchall').length || 0;

                return {
                    id: scrape.id,
                    url: scrape.url,
                    name: scrape.name,
                    created_at: scrape.created_at,
                    total_leads: scrape.total_leads || 0,
                    valid_leads: validLeads,
                    catchall_leads: catchallLeads,
                };
            })
        );

        // Filter out scrapes with no transferable leads
        const transferableScrapes = scrapesWithLeads.filter(
            s => s.valid_leads > 0 || s.catchall_leads > 0
        );

        return NextResponse.json({ scrapes: transferableScrapes });
    } catch (error) {
        console.error('Error in completed-with-leads:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

