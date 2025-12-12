/**
 * Fetch Available GoLogin Profiles for a Specific API Key
 * 
 * GET /api/admin/gologin-api-keys/[id]/profiles
 * Returns profiles directly from GoLogin's API using this key's token
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { getApiKey } from '@/lib/gologin-api-key-manager';
import { createGoLoginClient } from '@/lib/gologin-client';

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
 * GET - Fetch available profiles from GoLogin API for a specific API key
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await checkAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { id: apiKeyId } = await params;

        if (!apiKeyId) {
            return NextResponse.json({ error: 'API key ID is required' }, { status: 400 });
        }

        // Get the API key with token
        const apiKey = await getApiKey(apiKeyId);
        if (!apiKey) {
            return NextResponse.json({ error: 'API key not found' }, { status: 404 });
        }

        if (!apiKey.is_active) {
            return NextResponse.json({ 
                error: 'API key is inactive',
                profiles: []
            }, { status: 400 });
        }

        // Create a client using this specific API key's token
        const client = createGoLoginClient(apiKey.api_token);

        // Check if API is available
        const isAvailable = await client.isAvailable();
        if (!isAvailable) {
            return NextResponse.json({ 
                error: 'GoLogin API is not reachable with this key. Check if the token is valid.',
                profiles: [],
                available: false
            }, { status: 503 });
        }

        // Fetch profiles from GoLogin
        const result = await client.listProfiles();

        if (!result.success) {
            return NextResponse.json({ 
                error: 'Failed to fetch profiles from GoLogin',
                profiles: [],
                available: true
            }, { status: 500 });
        }

        // Get profiles already added to our database for this API key
        const { data: existingProfiles } = await supabase
            .from('gologin_profiles')
            .select('profile_id')
            .eq('api_key_id', apiKeyId);
        
        const existingIds = new Set(existingProfiles?.map(p => p.profile_id) || []);

        // Also get profiles added under other API keys (shouldn't add same profile twice)
        const { data: allExistingProfiles } = await supabase
            .from('gologin_profiles')
            .select('profile_id, api_key_id');
        
        const otherKeyIds = new Set(
            allExistingProfiles
                ?.filter(p => p.api_key_id !== apiKeyId)
                ?.map(p => p.profile_id) || []
        );

        // Mark which profiles are already added
        const profilesWithStatus = result.profiles.map(p => ({
            ...p,
            alreadyAdded: existingIds.has(p.id),
            addedToOtherKey: otherKeyIds.has(p.id)
        }));

        console.log(`[ADMIN-API-KEY-PROFILES] Found ${result.profiles.length} profiles from GoLogin for key ${apiKeyId}`);

        return NextResponse.json({
            success: true,
            apiKeyId,
            apiKeyName: apiKey.name,
            profiles: profilesWithStatus,
            total: result.total,
            available: true,
            debug: {
                totalFromGoLogin: result.total,
                alreadyInThisKey: existingIds.size,
                addedToOtherKeys: otherKeyIds.size,
                availableToAdd: profilesWithStatus.filter(p => !p.alreadyAdded && !p.addedToOtherKey).length
            }
        });

    } catch (error) {
        console.error('[ADMIN-API-KEY-PROFILES] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            profiles: []
        }, { status: 500 });
    }
}






