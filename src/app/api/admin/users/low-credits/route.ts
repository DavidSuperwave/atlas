import { NextResponse } from 'next/server';
import { getCurrentUser, isUserAdmin, createServiceClient } from '@/lib/supabase-server';

interface LowCreditsUser {
    id: string;
    email: string;
    credits_balance: number;
    telegram_username: string | null;
    created_at: string;
}

// GET: Get users with low credits (admin only)
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        // Apply reasonable bounds to threshold
        const rawThreshold = parseInt(searchParams.get('threshold') || '1000', 10);
        const threshold = Math.min(Math.max(0, rawThreshold), 1000000); // Between 0 and 1M

        const supabase = createServiceClient();

        // Get users with credits below threshold
        const { data: users, error: usersError } = await supabase
            .from('user_profiles')
            .select('id, email, credits_balance, created_at')
            .lt('credits_balance', threshold)
            .order('credits_balance', { ascending: true });

        if (usersError) {
            console.error('Error fetching low credits users:', usersError);
            return NextResponse.json(
                { error: 'Failed to fetch users' },
                { status: 500 }
            );
        }

        // Get telegram usernames from access_requests for these users
        const emails = users?.map(u => u.email.toLowerCase()) || [];
        let telegramMap = new Map<string, string>();

        if (emails.length > 0) {
            const { data: accessRequests, error: accessError } = await supabase
                .from('access_requests')
                .select('email, telegram_username')
                .in('email', emails);

            if (accessError) {
                console.error('Error fetching access requests:', accessError);
            } else if (accessRequests) {
                accessRequests.forEach(ar => {
                    if (ar.telegram_username) {
                        telegramMap.set(ar.email.toLowerCase(), ar.telegram_username);
                    }
                });
            }
        }

        // Combine user data with telegram usernames
        const lowCreditsUsers: LowCreditsUser[] = (users || []).map(u => ({
            id: u.id,
            email: u.email,
            credits_balance: u.credits_balance,
            telegram_username: telegramMap.get(u.email.toLowerCase()) || null,
            created_at: u.created_at,
        }));

        return NextResponse.json({ 
            users: lowCreditsUsers,
            threshold,
            count: lowCreditsUsers.length,
        });
    } catch (error) {
        console.error('Error fetching low credits users:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

