import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';

// GET - List all invites
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

        const { data: invites, error } = await supabase
            .from('invites')
            .select(`
                *,
                invited_by_profile:user_profiles!invites_invited_by_fkey(email)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching invites:', error);
            return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
        }

        // Transform data to include admin email
        const transformedInvites = invites.map(invite => ({
            ...invite,
            invited_by_email: invite.invited_by_profile?.email || null,
        }));

        return NextResponse.json({ invites: transformedInvites });
    } catch (error) {
        console.error('Error fetching invites:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

