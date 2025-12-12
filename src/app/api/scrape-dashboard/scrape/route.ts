import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser } from '@/lib/supabase-server';

const supabase = createServiceClient();

/**
 * POST /api/scrape-dashboard/scrape
 * 
 * Creates a scrape request for scrape-only users.
 * - Checks user's account_type
 * - Creates scrape with requires_admin_approval=true
 * - Sets status to 'pending_approval'
 * - Does NOT add to queue (admin must manually transfer results)
 */
export async function POST(request: Request) {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user profile to check account type
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('account_type, credits_balance')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        // Parse request body
        const { url, pages = 1, name, tags = [] } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        // Validate pages
        if (pages < 1 || pages > 50) {
            return NextResponse.json({ error: 'Pages must be between 1 and 50' }, { status: 400 });
        }

        // For scrape-only users: create with pending_approval status
        if (profile.account_type === 'scrape_only') {
            // Create scrape record with pending_approval status
            const { data: scrape, error: scrapeError } = await supabase
                .from('scrapes')
                .insert({
                    url,
                    filters: { pages },
                    status: 'pending_approval',
                    user_id: user.id,
                    name: name?.trim() || null,
                    tags: Array.isArray(tags) ? tags : [],
                    requires_admin_approval: true,
                    scraper_mode: 'admin_manual', // Indicates this will be processed manually by admin
                })
                .select()
                .single();

            if (scrapeError) {
                console.error('Database error:', scrapeError);
                return NextResponse.json({ error: 'Failed to create scrape request' }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                scrapeId: scrape.id,
                status: 'pending_approval',
                message: 'Scrape request submitted! Our team will process it and add verified leads to your account.',
                requiresApproval: true,
            });
        }

        // For full app users: redirect to the regular scrape endpoint
        // This shouldn't normally happen since full app users use /api/scrape
        return NextResponse.json({
            error: 'Please use the main dashboard for full app users',
            redirectTo: '/dashboard',
        }, { status: 400 });

    } catch (error) {
        console.error('Error in scrape-dashboard/scrape:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

/**
 * GET /api/scrape-dashboard/scrape
 * 
 * Returns the user's scrape requests with their status.
 */
export async function GET() {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's scrapes
        const { data: scrapes, error } = await supabase
            .from('scrapes')
            .select('id, url, status, name, total_leads, created_at, transferred_leads_count, filters')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching scrapes:', error);
            return NextResponse.json({ error: 'Failed to fetch scrapes' }, { status: 500 });
        }

        return NextResponse.json({ scrapes: scrapes || [] });
    } catch (error) {
        console.error('Error in scrape-dashboard/scrape GET:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}




