import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';

// GET - List all access requests (admin only)
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const supabase = createServiceClient();

        let query = supabase
            .from('access_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching access requests:', error);
            return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
        }

        return NextResponse.json({ requests: data });
    } catch (error) {
        console.error('Error fetching access requests:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PATCH - Update access request status (admin only)
export async function PATCH(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { id, status } = body;

        if (!id || !status) {
            return NextResponse.json({ error: 'ID and status are required' }, { status: 400 });
        }

        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        const supabase = createServiceClient();

        const { data, error } = await supabase
            .from('access_requests')
            .update({
                status,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating access request:', error);
            return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            request: data,
        });
    } catch (error) {
        console.error('Error updating access request:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

