import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Server-side Supabase client with service role for admin operations
export function createServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                persistSession: false,
            },
        }
    );
}

// Alias for backwards compatibility
export const createServerClient = createServiceClient;

// Server-side Supabase client that respects user auth using @supabase/ssr
export async function createAuthenticatedClient() {
    const cookieStore = await cookies();
    
    return createSupabaseServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );
}

// Get current user from request
export async function getCurrentUser() {
    try {
        const supabase = await createAuthenticatedClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
            return null;
        }
        
        return user;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

// Get user profile with credits
export async function getUserProfile(userId: string) {
    const supabase = createServiceClient();
    
    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
    
    return data;
}

// Check if user is admin
export async function isUserAdmin(userId: string): Promise<boolean> {
    const profile = await getUserProfile(userId);
    return profile?.is_admin ?? false;
}
