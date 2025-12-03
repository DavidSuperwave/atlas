/**
 * Admin GoLogin Profile Assignment API
 * 
 * Endpoints for assigning/unassigning GoLogin profiles to users.
 * Only accessible by admin users.
 * 
 * GET /api/admin/gologin-profiles/assign?userId=xxx - Get user's assigned profile
 * POST /api/admin/gologin-profiles/assign - Assign profile to user
 * DELETE /api/admin/gologin-profiles/assign - Unassign profile from user
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { 
    assignProfileToUser, 
    unassignProfileFromUser,
    getUserProfileId
} from '@/lib/gologin-profile-manager';

const supabase = createServiceClient();

/**
 * Check if user is admin
 */
async function checkAdmin(userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    
    return data?.is_admin === true;
}

/**
 * GET - Get a user's assigned profile
 */
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        // Get user's profile assignment
        const result = await getUserProfileId(userId);

        // Also get the full assignment details from database
        const { data: assignment } = await supabase
            .from('user_gologin_profiles')
            .select(`
                *,
                gologin_profiles (
                    id,
                    profile_id,
                    name,
                    is_active
                )
            `)
            .eq('user_id', userId)
            .single();

        return NextResponse.json({
            success: true,
            hasAssignment: !!assignment,
            assignment: assignment ? {
                profileDbId: assignment.profile_id,
                profileGoLoginId: result.profileId,
                profileName: (assignment.gologin_profiles as any)?.name,
                assignedAt: assignment.assigned_at,
                assignedBy: assignment.assigned_by,
                source: result.source
            } : null,
            fallbackProfileId: !assignment ? result.profileId : null,
            source: result.source
        });

    } catch (error) {
        console.error('[ADMIN-ASSIGN] Error getting assignment:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * POST - Assign a profile to a user
 */
export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { userId, profileDbId } = await request.json();

        if (!userId || !profileDbId) {
            return NextResponse.json({ 
                error: 'userId and profileDbId are required' 
            }, { status: 400 });
        }

        // Verify the profile exists
        const { data: profile } = await supabase
            .from('gologin_profiles')
            .select('id, name, is_active')
            .eq('id', profileDbId)
            .single();

        if (!profile) {
            return NextResponse.json({ 
                error: 'Profile not found' 
            }, { status: 404 });
        }

        if (!profile.is_active) {
            return NextResponse.json({ 
                error: 'Cannot assign inactive profile' 
            }, { status: 400 });
        }

        // Verify the target user exists
        const { data: targetUser } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('id', userId)
            .single();

        if (!targetUser) {
            return NextResponse.json({ 
                error: 'User not found' 
            }, { status: 404 });
        }

        const result = await assignProfileToUser(userId, profileDbId, user.id);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to assign profile'
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: `Assigned profile "${profile.name}" to user ${targetUser.email}`
        });

    } catch (error) {
        console.error('[ADMIN-ASSIGN] Error assigning profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * DELETE - Unassign a profile from a user
 */
export async function DELETE(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        const result = await unassignProfileFromUser(userId);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to unassign profile'
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Profile unassigned successfully'
        });

    } catch (error) {
        console.error('[ADMIN-ASSIGN] Error unassigning profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

