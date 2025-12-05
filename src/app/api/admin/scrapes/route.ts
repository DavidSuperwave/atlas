import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';

const supabase = createServiceClient();

export const runtime = 'nodejs';

/**
 * GET /api/admin/scrapes
 * 
 * Returns all scrapes, queue items, and browser sessions for admin management.
 * Admin only endpoint.
 */
export async function GET() {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get recent scrapes (last 7 days or last 100)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: scrapes, error: scrapesError } = await supabase
            .from('scrapes')
            .select('*')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(100);

        if (scrapesError) {
            console.error('Error fetching scrapes:', scrapesError);
        }

        // Get user emails for the scrapes
        const userIds = [...new Set((scrapes || []).map(s => s.user_id))];
        const { data: users } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', userIds);

        const userMap = new Map((users || []).map(u => [u.id, u.email]));

        // Add user emails to scrapes
        const scrapesWithUsers = (scrapes || []).map(s => ({
            ...s,
            user_email: userMap.get(s.user_id) || 'Unknown'
        }));

        // Get queue items
        const { data: queueItems, error: queueError } = await supabase
            .from('scrape_queue')
            .select('*')
            .in('status', ['pending', 'running'])
            .order('created_at', { ascending: true });

        if (queueError) {
            console.error('Error fetching queue:', queueError);
        }

        // Get active browser sessions
        const { data: browserSessions, error: sessionsError } = await supabase
            .from('browser_sessions')
            .select('*')
            .eq('status', 'active')
            .order('started_at', { ascending: false });

        if (sessionsError) {
            console.error('Error fetching sessions:', sessionsError);
        }

        return NextResponse.json({
            scrapes: scrapesWithUsers || [],
            queueItems: queueItems || [],
            browserSessions: browserSessions || [],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in admin scrapes:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

