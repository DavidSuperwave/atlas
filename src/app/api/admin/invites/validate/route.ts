import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Find invite by token
        const { data: invite, error } = await supabase
            .from('invites')
            .select('*')
            .eq('token', token)
            .single();

        if (error || !invite) {
            return NextResponse.json({ valid: false, error: 'Invalid invite token' }, { status: 404 });
        }

        // Check if already used
        if (invite.used_at) {
            return NextResponse.json({ valid: false, error: 'This invite has already been used' }, { status: 400 });
        }

        // Check if expired
        if (new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ valid: false, error: 'This invite has expired' }, { status: 400 });
        }

        return NextResponse.json({
            valid: true,
            email: invite.email,
            expires_at: invite.expires_at,
        });
    } catch (error) {
        console.error('Error validating invite:', error);
        return NextResponse.json({ valid: false, error: 'Internal server error' }, { status: 500 });
    }
}

