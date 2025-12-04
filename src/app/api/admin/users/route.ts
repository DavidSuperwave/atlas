import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';

// GET - List all users with their status
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const supabase = createServiceClient();

        // Fetch all users with their profiles
        const { data: users, error } = await supabase
            .from('user_profiles')
            .select(`
                id,
                email,
                name,
                is_admin,
                is_disabled,
                is_approved,
                onboarding_completed,
                onboarding_completed_at,
                approved_at,
                approved_by,
                disabled_at,
                disabled_by,
                credits_balance,
                created_at,
                has_apollo_account,
                requested_credits_plan
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
            return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
        }

        // Calculate status for each user
        const usersWithStatus = users.map(u => {
            let status: 'pending' | 'approved' | 'disabled' = 'pending';
            
            if (u.is_disabled) {
                status = 'disabled';
            } else if (u.is_approved) {
                status = 'approved';
            } else {
                status = 'pending';
            }

            return {
                ...u,
                status,
            };
        });

        return NextResponse.json({ users: usersWithStatus });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

