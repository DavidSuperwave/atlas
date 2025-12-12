/**
 * Admin GoLogin Profiles API
 * 
 * Endpoints for managing GoLogin browser profiles.
 * Only accessible by admin users.
 * 
 * GET /api/admin/gologin-profiles - List all profiles with assignments
 * POST /api/admin/gologin-profiles - Create new profile
 * PUT /api/admin/gologin-profiles - Update profile
 * DELETE /api/admin/gologin-profiles - Soft delete profile
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { 
    listProfiles, 
    listAllAssignments, 
    createProfile, 
    updateProfile, 
    deleteProfile 
} from '@/lib/gologin-profile-manager';

const supabase = createServiceClient();

/**
 * Check if user is admin
 */
async function checkAdmin(userId: string): Promise<boolean> {
    const { data } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    
    return data?.is_admin === true;
}

/**
 * GET - List all GoLogin profiles with their assignments and API key info
 */
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get all profiles (including inactive)
        const profiles = await listProfiles(true);

        // Get all assignments
        const assignments = await listAllAssignments();

        // Get all users for the dropdown
        const { data: users } = await supabase
            .from('user_profiles')
            .select('id, email')
            .order('email');

        // Get all API keys for reference
        const { data: apiKeys } = await supabase
            .from('gologin_api_keys')
            .select('id, name, is_active')
            .order('name');

        // Create API key lookup map
        const apiKeyMap = new Map((apiKeys || []).map(k => [k.id, k]));

        // Map assignments and API key info to profiles
        const profilesWithAssignments = profiles.map(profile => {
            const profileAssignments = assignments.filter(
                a => (a.gologin_profiles as any)?.id === profile.id
            );
            const apiKey = profile.api_key_id ? apiKeyMap.get(profile.api_key_id) : null;
            
            return {
                ...profile,
                api_key_name: apiKey?.name || null,
                api_key_active: apiKey?.is_active ?? null,
                assignments: profileAssignments.map(a => ({
                    user_id: a.user_id,
                    assigned_at: a.assigned_at,
                    assigned_by: a.assigned_by
                }))
            };
        });

        return NextResponse.json({
            success: true,
            profiles: profilesWithAssignments,
            users: users || [],
            apiKeys: apiKeys || [],
            total: profiles.length
        });

    } catch (error) {
        console.error('[ADMIN-PROFILES] Error listing profiles:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * POST - Create a new GoLogin profile
 * Now requires api_key_id to link profile to its parent API key
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

        const { profile_id, name, description, api_key_id } = await request.json();

        if (!profile_id || !name) {
            return NextResponse.json({ 
                error: 'profile_id and name are required' 
            }, { status: 400 });
        }

        // api_key_id is now strongly recommended (will be required in future)
        if (!api_key_id) {
            console.warn('[ADMIN-PROFILES] Creating profile without api_key_id - will use default key');
        }

        const result = await createProfile(profile_id, name, description, api_key_id);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to create profile'
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            profile: result.profile
        });

    } catch (error) {
        console.error('[ADMIN-PROFILES] Error creating profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * PUT - Update an existing GoLogin profile
 */
export async function PUT(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { id, name, description, is_active } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const updates: { name?: string; description?: string; is_active?: boolean } = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (is_active !== undefined) updates.is_active = is_active;

        const result = await updateProfile(id, updates);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to update profile'
            }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ADMIN-PROFILES] Error updating profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

/**
 * DELETE - Soft delete a GoLogin profile (marks as inactive)
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

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const result = await deleteProfile(id);

        if (!result.success) {
            return NextResponse.json({ 
                error: result.error || 'Failed to delete profile'
            }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[ADMIN-PROFILES] Error deleting profile:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

