import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';

// POST - Disable a user account
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(currentUser.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: userId } = await params;

        // Prevent disabling self
        if (userId === currentUser.id) {
            return NextResponse.json(
                { error: 'You cannot disable your own account' },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();

        // Check if user exists
        const { data: targetUser, error: fetchError } = await supabase
            .from('user_profiles')
            .select('id, email, is_disabled, is_admin')
            .eq('id', userId)
            .single();

        if (fetchError || !targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if already disabled
        if (targetUser.is_disabled) {
            return NextResponse.json(
                { error: 'User is already disabled' },
                { status: 400 }
            );
        }

        // Disable the user
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                is_disabled: true,
                disabled_at: new Date().toISOString(),
                disabled_by: currentUser.id,
            })
            .eq('id', userId);

        if (updateError) {
            console.error('Error disabling user:', updateError);
            return NextResponse.json({ error: 'Failed to disable user' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'User account disabled successfully',
            user: {
                id: userId,
                email: targetUser.email,
                is_disabled: true,
            },
        });
    } catch (error) {
        console.error('Error disabling user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE - Enable a user account (re-enable)
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(currentUser.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id: userId } = await params;

        const supabase = createServiceClient();

        // Check if user exists
        const { data: targetUser, error: fetchError } = await supabase
            .from('user_profiles')
            .select('id, email, is_disabled')
            .eq('id', userId)
            .single();

        if (fetchError || !targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if already enabled
        if (!targetUser.is_disabled) {
            return NextResponse.json(
                { error: 'User is already enabled' },
                { status: 400 }
            );
        }

        // Enable the user
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                is_disabled: false,
                disabled_at: null,
                disabled_by: null,
            })
            .eq('id', userId);

        if (updateError) {
            console.error('Error enabling user:', updateError);
            return NextResponse.json({ error: 'Failed to enable user' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'User account enabled successfully',
            user: {
                id: userId,
                email: targetUser.email,
                is_disabled: false,
            },
        });
    } catch (error) {
        console.error('Error enabling user:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

