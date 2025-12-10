import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient, isUserAdmin } from '@/lib/supabase-server';

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
        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get recent scrapes (last 7 days or last 100) - include pending_approval
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

        // Get user info for the scrapes (including account_type and credits)
        const userIds = [...new Set((scrapes || []).map(s => s.user_id))];
        const { data: users } = await supabase
            .from('user_profiles')
            .select('id, email, name, account_type, credits_balance')
            .in('id', userIds);

        const userMap = new Map((users || []).map(u => [u.id, u]));

        // Add user info to scrapes
        const scrapesWithUsers = (scrapes || []).map(s => {
            const userInfo = userMap.get(s.user_id);
            return {
                ...s,
                user_email: userInfo?.email || 'Unknown',
                user_name: userInfo?.name || null,
                user_account_type: userInfo?.account_type || 'full',
                user_credits_balance: userInfo?.credits_balance || 0,
            };
        });

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

