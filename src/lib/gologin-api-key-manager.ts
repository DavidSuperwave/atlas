/**
 * GoLogin API Key Manager
 * 
 * This module manages multiple GoLogin API keys for horizontal scaling.
 * It provides functions to:
 * - CRUD operations for API keys
 * - Get the API key for a specific profile
 * - Get the default API key (from DB or env fallback)
 * - List all active API keys
 * 
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

import { createClient } from '@supabase/supabase-js';

// SECURITY: Service role key is REQUIRED for API key management
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('[API-KEY-MANAGER] NEXT_PUBLIC_SUPABASE_URL is not configured');
}
if (!serviceRoleKey) {
    throw new Error('[API-KEY-MANAGER] SUPABASE_SERVICE_ROLE_KEY is required for API key management');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/**
 * GoLogin API Key from database
 */
export interface GoLoginApiKey {
    id: string;
    name: string;
    api_token: string;
    is_active: boolean;
    is_default: boolean;
    max_concurrent_scrapes: number;
    created_at: string;
    updated_at: string;
}

/**
 * API Key without the sensitive token (for listing)
 */
export interface GoLoginApiKeySafe {
    id: string;
    name: string;
    is_active: boolean;
    is_default: boolean;
    max_concurrent_scrapes: number;
    created_at: string;
    updated_at: string;
    profile_count?: number;
    active_sessions?: number;
}

/**
 * Result of API key operations
 */
export interface ApiKeyResult {
    success: boolean;
    error?: string;
    apiKey?: GoLoginApiKey;
}

// Simple in-memory cache for API keys
const apiKeyCache = new Map<string, { key: GoLoginApiKey; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear cache for a specific key or all keys
 */
export function clearApiKeyCache(keyId?: string): void {
    if (keyId) {
        apiKeyCache.delete(keyId);
    } else {
        apiKeyCache.clear();
    }
    console.log(`[API-KEY-MANAGER] Cache cleared${keyId ? ` for key ${keyId}` : ' (all)'}`);
}

/**
 * List all API keys (without tokens for security)
 * 
 * @param includeInactive - Whether to include inactive keys
 * @returns Array of API keys without sensitive token field
 */
export async function listApiKeys(includeInactive = false): Promise<GoLoginApiKeySafe[]> {
    try {
        let query = supabase
            .from('gologin_api_keys')
            .select('id, name, is_active, is_default, max_concurrent_scrapes, created_at, updated_at')
            .order('created_at', { ascending: true });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[API-KEY-MANAGER] Error listing API keys:', error);
            return [];
        }

        // Get profile counts per key
        const keysWithCounts = await Promise.all((data || []).map(async (key) => {
            const { count: profileCount } = await supabase
                .from('gologin_profiles')
                .select('*', { count: 'exact', head: true })
                .eq('api_key_id', key.id);

            const { count: activeSessionCount } = await supabase
                .from('browser_sessions')
                .select('*', { count: 'exact', head: true })
                .eq('api_key_id', key.id)
                .eq('status', 'active');

            return {
                ...key,
                profile_count: profileCount || 0,
                active_sessions: activeSessionCount || 0
            };
        }));

        return keysWithCounts;
    } catch (err) {
        console.error('[API-KEY-MANAGER] Error in listApiKeys:', err);
        return [];
    }
}

/**
 * Get a specific API key by ID (includes token)
 * 
 * @param id - The API key ID
 * @returns The full API key including token, or null if not found
 */
export async function getApiKey(id: string): Promise<GoLoginApiKey | null> {
    // Check cache first
    const cached = apiKeyCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.key;
    }

    try {
        const { data, error } = await supabase
            .from('gologin_api_keys')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') { // Not found is expected
                console.error('[API-KEY-MANAGER] Error getting API key:', error);
            }
            return null;
        }

        // Cache the result
        if (data) {
            apiKeyCache.set(id, {
                key: data,
                expiresAt: Date.now() + CACHE_TTL
            });
        }

        return data;
    } catch (err) {
        console.error('[API-KEY-MANAGER] Error in getApiKey:', err);
        return null;
    }
}

/**
 * Get the default API key
 * 
 * Order of precedence:
 * 1. Database key marked as is_default=true
 * 2. First active key in database
 * 3. Create from GOLOGIN_API_TOKEN env var (if exists)
 * 
 * @returns The default API key or null if none configured
 */
export async function getDefaultApiKey(): Promise<GoLoginApiKey | null> {
    try {
        // First, try to get the key marked as default
        const { data: defaultKey } = await supabase
            .from('gologin_api_keys')
            .select('*')
            .eq('is_default', true)
            .eq('is_active', true)
            .single();

        if (defaultKey) {
            return defaultKey;
        }

        // No default key, try first active key
        const { data: firstKey } = await supabase
            .from('gologin_api_keys')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (firstKey) {
            return firstKey;
        }

        // No keys in database, check env var and auto-create
        const envToken = process.env.GOLOGIN_API_TOKEN;
        if (envToken) {
            console.log('[API-KEY-MANAGER] No API keys in database, creating from env var...');
            const result = await createApiKey('Default (from env)', envToken, true);
            if (result.success && result.apiKey) {
                return result.apiKey;
            }
        }

        return null;
    } catch (err) {
        console.error('[API-KEY-MANAGER] Error in getDefaultApiKey:', err);
        return null;
    }
}

/**
 * Get the API key that owns a specific profile
 * 
 * @param profileGoLoginId - The GoLogin profile ID (not database ID)
 * @returns The API key or null if not found
 */
export async function getApiKeyForProfile(profileGoLoginId: string): Promise<GoLoginApiKey | null> {
    try {
        const { data: profile, error } = await supabase
            .from('gologin_profiles')
            .select('api_key_id')
            .eq('profile_id', profileGoLoginId)
            .single();

        if (error || !profile?.api_key_id) {
            // Profile not found or no API key assigned
            // Fall back to default key
            console.log(`[API-KEY-MANAGER] No API key for profile ${profileGoLoginId}, using default`);
            return getDefaultApiKey();
        }

        return getApiKey(profile.api_key_id);
    } catch (err) {
        console.error('[API-KEY-MANAGER] Error in getApiKeyForProfile:', err);
        return getDefaultApiKey();
    }
}

/**
 * Get the API key for a profile by database profile ID
 * 
 * @param profileDbId - The database ID of the profile (gologin_profiles.id)
 * @returns The API key or null if not found
 */
export async function getApiKeyForProfileDbId(profileDbId: string): Promise<GoLoginApiKey | null> {
    try {
        const { data: profile, error } = await supabase
            .from('gologin_profiles')
            .select('api_key_id, profile_id')
            .eq('id', profileDbId)
            .single();

        if (error || !profile?.api_key_id) {
            console.log(`[API-KEY-MANAGER] No API key for profile DB ID ${profileDbId}, using default`);
            return getDefaultApiKey();
        }

        return getApiKey(profile.api_key_id);
    } catch (err) {
        console.error('[API-KEY-MANAGER] Error in getApiKeyForProfileDbId:', err);
        return getDefaultApiKey();
    }
}

/**
 * Create a new API key
 * 
 * @param name - Display name for the key
 * @param apiToken - The GoLogin API token
 * @param isDefault - Whether this should be the default key
 * @returns Result with created key or error
 */
export async function createApiKey(
    name: string,
    apiToken: string,
    isDefault = false
): Promise<ApiKeyResult> {
    try {
        // If setting as default, unset other defaults first
        if (isDefault) {
            await supabase
                .from('gologin_api_keys')
                .update({ is_default: false })
                .eq('is_default', true);
        }

        const { data, error } = await supabase
            .from('gologin_api_keys')
            .insert({
                name,
                api_token: apiToken,
                is_default: isDefault,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('[API-KEY-MANAGER] Error creating API key:', error);
            return { success: false, error: error.message };
        }

        clearApiKeyCache();
        console.log(`[API-KEY-MANAGER] Created API key: ${name} (${data.id})`);
        return { success: true, apiKey: data };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Update an API key
 * 
 * @param id - The API key ID
 * @param updates - Fields to update
 * @returns Result with success status
 */
export async function updateApiKey(
    id: string,
    updates: {
        name?: string;
        is_active?: boolean;
        is_default?: boolean;
        max_concurrent_scrapes?: number;
    }
): Promise<ApiKeyResult> {
    try {
        // If setting as default, unset other defaults first
        if (updates.is_default === true) {
            await supabase
                .from('gologin_api_keys')
                .update({ is_default: false })
                .neq('id', id);
        }

        const { data, error } = await supabase
            .from('gologin_api_keys')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[API-KEY-MANAGER] Error updating API key:', error);
            return { success: false, error: error.message };
        }

        clearApiKeyCache(id);
        console.log(`[API-KEY-MANAGER] Updated API key: ${id}`);
        return { success: true, apiKey: data };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Delete (deactivate) an API key
 * 
 * @param id - The API key ID
 * @returns Result with success status
 */
export async function deleteApiKey(id: string): Promise<ApiKeyResult> {
    return updateApiKey(id, { is_active: false });
}

/**
 * Update the API token for a key
 * 
 * @param id - The API key ID
 * @param newToken - The new API token
 * @returns Result with success status
 */
export async function updateApiToken(id: string, newToken: string): Promise<ApiKeyResult> {
    try {
        const { data, error } = await supabase
            .from('gologin_api_keys')
            .update({ api_token: newToken })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[API-KEY-MANAGER] Error updating API token:', error);
            return { success: false, error: error.message };
        }

        clearApiKeyCache(id);
        console.log(`[API-KEY-MANAGER] Updated API token for key: ${id}`);
        return { success: true, apiKey: data };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Get all active API keys with their tokens (for worker initialization)
 * 
 * @returns Array of full API key objects including tokens
 */
export async function getAllActiveApiKeys(): Promise<GoLoginApiKey[]> {
    try {
        const { data, error } = await supabase
            .from('gologin_api_keys')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[API-KEY-MANAGER] Error getting active API keys:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[API-KEY-MANAGER] Error in getAllActiveApiKeys:', err);
        return [];
    }
}

/**
 * Check if any API keys are configured (DB or env)
 * 
 * @returns True if at least one API key is available
 */
export async function hasAnyApiKey(): Promise<boolean> {
    // Check env var first (quick check)
    if (process.env.GOLOGIN_API_TOKEN) {
        return true;
    }

    // Check database
    const { count, error } = await supabase
        .from('gologin_api_keys')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

    if (error) {
        console.error('[API-KEY-MANAGER] Error checking for API keys:', error);
        return false;
    }

    return (count || 0) > 0;
}

/**
 * Ensure at least one API key exists (auto-create from env if needed)
 * 
 * Call this on startup to migrate from env-only to database-based keys
 */
export async function ensureApiKeyExists(): Promise<void> {
    const hasKey = await hasAnyApiKey();
    
    if (!hasKey) {
        console.log('[API-KEY-MANAGER] No API keys configured');
        return;
    }

    // If we have env var but no DB keys, create one
    const { count } = await supabase
        .from('gologin_api_keys')
        .select('*', { count: 'exact', head: true });

    if ((count || 0) === 0 && process.env.GOLOGIN_API_TOKEN) {
        console.log('[API-KEY-MANAGER] Migrating env var to database...');
        await createApiKey('Default (from env)', process.env.GOLOGIN_API_TOKEN, true);
    }
}






