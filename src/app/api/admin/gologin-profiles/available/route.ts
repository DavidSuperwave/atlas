/**
 * Fetch Available GoLogin Profiles from GoLogin API
 * 
 * GET /api/admin/gologin-profiles/available
 * GET /api/admin/gologin-profiles/available?apiKeyId=xxx
 * 
 * Returns profiles directly from GoLogin's API so admin can select from them.
 * If apiKeyId is provided, uses that specific API key's token.
 * Otherwise, uses the default API key (env var or first DB key).
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';
import { goLoginClient, createGoLoginClient } from '@/lib/gologin-client';
import { getApiKey, getDefaultApiKey } from '@/lib/gologin-api-key-manager';

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
 * Query params:
 * - apiKeyId: Optional - use specific API key (if not provided, uses default)
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

        // Parse query params
        const { searchParams } = new URL(request.url);
        const apiKeyId = searchParams.get('apiKeyId');

        // Get the appropriate client
        let client = goLoginClient;
        let usedApiKeyId: string | null = null;
        let usedApiKeyName: string | null = null;

        if (apiKeyId) {
            // Use specific API key
            const apiKey = await getApiKey(apiKeyId);
            if (!apiKey) {
                return NextResponse.json({ 
                    error: 'API key not found',
                    profiles: []
                }, { status: 404 });
            }
            if (!apiKey.is_active) {
                return NextResponse.json({ 
                    error: 'API key is inactive',
                    profiles: []
                }, { status: 400 });
            }
            client = createGoLoginClient(apiKey.api_token);
            usedApiKeyId = apiKey.id;
            usedApiKeyName = apiKey.name;
        } else {
            // Try to use default API key from database
            const defaultKey = await getDefaultApiKey();
            if (defaultKey) {
                client = createGoLoginClient(defaultKey.api_token);
                usedApiKeyId = defaultKey.id;
                usedApiKeyName = defaultKey.name;
            }
            // If no default key, fall back to goLoginClient (env var)
        }

        // Check if GoLogin is configured
        if (!client.hasApiToken()) {
            return NextResponse.json({ 
                error: 'GoLogin API token not configured. Add an API key in the admin panel.',
                profiles: [],
                configured: false
            }, { status: 400 });
        }

        // Check if API is available
        const isAvailable = await client.isAvailable();
        if (!isAvailable) {
            return NextResponse.json({ 
                error: 'GoLogin API is not reachable. Check your API token.',
                profiles: [],
                configured: true,
                available: false
            }, { status: 503 });
        }

        // Fetch profiles from GoLogin
        const result = await client.listProfiles();

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
            .select('profile_id, api_key_id');
        
        const existingIds = new Set(existingProfiles?.map(p => p.profile_id) || []);
        
        // Also track which profiles belong to which API key
        const profileApiKeyMap = new Map(
            existingProfiles?.map(p => [p.profile_id, p.api_key_id]) || []
        );

        // Mark which profiles are already added and to which key
        const profilesWithStatus = result.profiles.map(p => ({
            ...p,
            alreadyAdded: existingIds.has(p.id),
            existingApiKeyId: profileApiKeyMap.get(p.id) || null
        }));

        // Log for debugging
        console.log(`[ADMIN-AVAILABLE-PROFILES] Found ${result.profiles.length} profiles from GoLogin (key: ${usedApiKeyName || 'env'})`);

        return NextResponse.json({
            success: true,
            profiles: profilesWithStatus,
            total: result.total,
            configured: true,
            available: true,
            apiKeyId: usedApiKeyId,
            apiKeyName: usedApiKeyName,
            debug: {
                totalFromGoLogin: result.total,
                alreadyInDatabase: existingIds.size,
                availableToAdd: profilesWithStatus.filter(p => !p.alreadyAdded).length
            }
        });

    } catch (error) {
        console.error('[ADMIN-AVAILABLE-PROFILES] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
            profiles: []
        }, { status: 500 });
    }
}

