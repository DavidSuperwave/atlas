/**
 * Fetch Available GoLogin Profiles from GoLogin API
 * 
 * GET /api/admin/gologin-profiles/available
 * Returns profiles directly from GoLogin's API so admin can select from them
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { goLoginClient } from '@/lib/gologin-client';

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
 * GET - Fetch available profiles from GoLogin API
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

        // Check if GoLogin is configured
        if (!goLoginClient.isConfigured()) {
            return NextResponse.json({ 
                error: 'GoLogin API token not configured. Set GOLOGIN_API_TOKEN environment variable.',
                profiles: [],
                configured: false
            }, { status: 400 });
        }

        // Check if API is available
        const isAvailable = await goLoginClient.isAvailable();
        if (!isAvailable) {
            return NextResponse.json({ 
                error: 'GoLogin API is not reachable. Check your API token.',
                profiles: [],
                configured: true,
                available: false
            }, { status: 503 });
        }

        // Fetch profiles from GoLogin
        const result = await goLoginClient.listProfiles();

        if (!result.success) {
            return NextResponse.json({ 
                error: 'Failed to fetch profiles from GoLogin',
                profiles: [],
                configured: true,
                available: true
            }, { status: 500 });
        }

        // Get profiles already added to our database
        const { data: existingProfiles } = await supabase
            .from('gologin_profiles')
            .select('profile_id');
        
        const existingIds = new Set(existingProfiles?.map(p => p.profile_id) || []);

        // Mark which profiles are already added
        const profilesWithStatus = result.profiles.map(p => ({
            ...p,
            alreadyAdded: existingIds.has(p.id)
        }));

        return NextResponse.json({
            success: true,
            profiles: profilesWithStatus,
            total: result.total,
            configured: true,
            available: true
        });

    } catch (error) {
        console.error('[ADMIN-AVAILABLE-PROFILES] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            profiles: []
        }, { status: 500 });
    }
}

