/**
 * GoLogin Profile Manager
 * 
 * This module handles user-to-profile assignments for GoLogin.
 * It provides functions to:
 * - Get a user's assigned GoLogin profile ID
 * - Fallback to environment variable if no assignment exists
 * - Cache profile lookups for performance
 * 
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

import { createClient } from '@supabase/supabase-js';

// SECURITY: Service role key is REQUIRED for profile management
// These operations need to bypass RLS to manage profiles across users
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('[PROFILE-MANAGER] NEXT_PUBLIC_SUPABASE_URL is not configured');
}
if (!serviceRoleKey) {
    throw new Error('[PROFILE-MANAGER] SUPABASE_SERVICE_ROLE_KEY is required for profile management operations');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Simple in-memory cache for profile assignments
// In production with multiple instances, consider Redis
const profileCache = new Map<string, { profileId: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Result of a profile lookup
 */
export interface ProfileLookupResult {
    profileId: string;
    source: 'database' | 'environment' | 'none';
    profileName?: string;
    error?: string;
}

/**
 * GoLogin profile from database
 */
export interface GoLoginProfile {
    id: string;
    profile_id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * User profile assignment from database
 */
export interface UserProfileAssignment {
    id: string;
    user_id: string;
    profile_id: string;
    assigned_by: string | null;
    assigned_at: string;
    gologin_profiles?: GoLoginProfile;
}

/**
 * Get the GoLogin profile ID for a user
 * 
 * Lookup order:
 * 1. Check cache
 * 2. Query database for user's assigned profile
 * 3. Fallback to GOLOGIN_PROFILE_ID environment variable
 * 
 * @param userId - The user's ID
 * @returns ProfileLookupResult with profile ID and source
 */
export async function getUserProfileId(userId: string): Promise<ProfileLookupResult> {
    // Check cache first
    const cached = profileCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        console.log(`[PROFILE-MANAGER] Cache hit for user ${userId}: ${cached.profileId}`);
        return {
            profileId: cached.profileId,
            source: 'database'
        };
    }

    try {
        // Query database for user's assigned profile
        const { data, error } = await supabase
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

        if (error) {
            if (error.code === 'PGRST116') {
                // No assignment found - this is expected, use fallback
                console.log(`[PROFILE-MANAGER] No profile assignment for user ${userId}, using fallback`);
            } else {
                console.error(`[PROFILE-MANAGER] Database error:`, error);
            }
        } else if (data && data.gologin_profiles) {
            const profile = data.gologin_profiles as unknown as GoLoginProfile;
            
            if (!profile.is_active) {
                console.warn(`[PROFILE-MANAGER] Assigned profile is inactive for user ${userId}`);
                // Fall through to environment variable fallback
            } else {
                // Cache the result
                profileCache.set(userId, {
                    profileId: profile.profile_id,
                    expiresAt: Date.now() + CACHE_TTL
                });

                console.log(`[PROFILE-MANAGER] Found profile for user ${userId}: ${profile.name} (${profile.profile_id})`);
                return {
                    profileId: profile.profile_id,
                    source: 'database',
                    profileName: profile.name
                };
            }
        }
    } catch (err) {
        console.error(`[PROFILE-MANAGER] Error looking up profile:`, err);
    }

    // Fallback to environment variable
    const envProfileId = process.env.GOLOGIN_PROFILE_ID;
    if (envProfileId) {
        console.log(`[PROFILE-MANAGER] Using environment variable fallback for user ${userId}`);
        return {
            profileId: envProfileId,
            source: 'environment'
        };
    }

    // No profile found
    console.error(`[PROFILE-MANAGER] No profile found for user ${userId} and no fallback configured`);
    return {
        profileId: '',
        source: 'none',
        error: 'No GoLogin profile assigned and no fallback configured. Please contact an administrator.'
    };
}

/**
 * Get the database record ID for a user's profile assignment
 * 
 * @param userId - The user's ID
 * @returns The gologin_profiles table ID or null
 */
export async function getUserProfileDbId(userId: string): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('user_gologin_profiles')
            .select('profile_id')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return null;
        }

        return data.profile_id;
    } catch {
        return null;
    }
}

/**
 * Clear cached profile for a user
 * Call this when a profile assignment changes
 * 
 * @param userId - The user's ID to clear from cache
 */
export function clearProfileCache(userId: string): void {
    profileCache.delete(userId);
    console.log(`[PROFILE-MANAGER] Cleared cache for user ${userId}`);
}

/**
 * Clear all cached profiles
 * Call this when profiles are bulk-updated
 */
export function clearAllProfileCache(): void {
    profileCache.clear();
    console.log(`[PROFILE-MANAGER] Cleared all profile cache`);
}

/**
 * List all GoLogin profiles
 * 
 * @param includeInactive - Whether to include inactive profiles
 * @returns Array of profiles
 */
export async function listProfiles(includeInactive = false): Promise<GoLoginProfile[]> {
    const query = supabase
        .from('gologin_profiles')
        .select('*')
        .order('name');

    if (!includeInactive) {
        query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error(`[PROFILE-MANAGER] Error listing profiles:`, error);
        return [];
    }

    return data || [];
}

/**
 * Get profile by GoLogin profile ID
 * 
 * @param goLoginProfileId - The GoLogin profile ID (not the database ID)
 * @returns Profile or null
 */
export async function getProfileByGoLoginId(goLoginProfileId: string): Promise<GoLoginProfile | null> {
    const { data, error } = await supabase
        .from('gologin_profiles')
        .select('*')
        .eq('profile_id', goLoginProfileId)
        .single();

    if (error) {
        return null;
    }

    return data;
}

/**
 * Get all profile assignments with user and profile details
 * For admin dashboard
 * 
 * @returns Array of assignments with joined data
 */
export async function listAllAssignments(): Promise<UserProfileAssignment[]> {
    const { data, error } = await supabase
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
        .order('assigned_at', { ascending: false });

    if (error) {
        console.error(`[PROFILE-MANAGER] Error listing assignments:`, error);
        return [];
    }

    return data || [];
}

/**
 * Assign a profile to a user
 * 
 * @param userId - The user to assign the profile to
 * @param profileDbId - The database ID of the profile (gologin_profiles.id)
 * @param assignedBy - The admin who is making the assignment
 * @returns Success status
 */
export async function assignProfileToUser(
    userId: string,
    profileDbId: string,
    assignedBy: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Use upsert to handle both new assignments and updates
        const { error } = await supabase
            .from('user_gologin_profiles')
            .upsert({
                user_id: userId,
                profile_id: profileDbId,
                assigned_by: assignedBy,
                assigned_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            console.error(`[PROFILE-MANAGER] Error assigning profile:`, error);
            return { success: false, error: error.message };
        }

        // Clear cache for this user
        clearProfileCache(userId);

        console.log(`[PROFILE-MANAGER] Assigned profile ${profileDbId} to user ${userId}`);
        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Remove a user's profile assignment
 * 
 * @param userId - The user to unassign
 * @returns Success status
 */
export async function unassignProfileFromUser(
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('user_gologin_profiles')
            .delete()
            .eq('user_id', userId);

        if (error) {
            console.error(`[PROFILE-MANAGER] Error unassigning profile:`, error);
            return { success: false, error: error.message };
        }

        // Clear cache for this user
        clearProfileCache(userId);

        console.log(`[PROFILE-MANAGER] Unassigned profile from user ${userId}`);
        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Create a new GoLogin profile entry
 * 
 * @param profileId - The GoLogin profile ID from GoLogin dashboard
 * @param name - Display name for the profile
 * @param description - Optional description
 * @returns The created profile or error
 */
export async function createProfile(
    profileId: string,
    name: string,
    description?: string
): Promise<{ success: boolean; profile?: GoLoginProfile; error?: string }> {
    try {
        const { data, error } = await supabase
            .from('gologin_profiles')
            .insert({
                profile_id: profileId,
                name,
                description: description || null,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error(`[PROFILE-MANAGER] Error creating profile:`, error);
            return { success: false, error: error.message };
        }

        console.log(`[PROFILE-MANAGER] Created profile: ${name} (${profileId})`);
        return { success: true, profile: data };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Update a GoLogin profile entry
 * 
 * @param id - The database ID of the profile
 * @param updates - Fields to update
 * @returns Success status
 */
export async function updateProfile(
    id: string,
    updates: {
        name?: string;
        description?: string;
        is_active?: boolean;
    }
): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('gologin_profiles')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error(`[PROFILE-MANAGER] Error updating profile:`, error);
            return { success: false, error: error.message };
        }

        // Clear all cache since profile data changed
        clearAllProfileCache();

        console.log(`[PROFILE-MANAGER] Updated profile ${id}`);
        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

/**
 * Delete a GoLogin profile (soft delete - marks as inactive)
 * 
 * @param id - The database ID of the profile
 * @returns Success status
 */
export async function deleteProfile(
    id: string
): Promise<{ success: boolean; error?: string }> {
    return updateProfile(id, { is_active: false });
}

