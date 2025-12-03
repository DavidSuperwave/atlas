'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient, User } from '@supabase/supabase-js';

// Singleton client for browser
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        supabaseClient = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
    }
    return supabaseClient;
}

// Auth helper functions
export async function signUp(email: string, password: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    
    if (error) throw error;
    return data;
}

export async function signIn(email: string, password: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    
    if (error) throw error;
    return data;
}

// Social sign in helpers
export async function signInWithGoogle() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/auth/callback`,
        },
    });
    
    if (error) throw error;
    return data;
}

export async function signInWithApple() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
            redirectTo: `${window.location.origin}/auth/callback`,
        },
    });
    
    if (error) throw error;
    return data;
}

export async function signOut() {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getSession() {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// Subscribe to auth state changes
export function onAuthStateChange(callback: (user: User | null) => void) {
    const supabase = getSupabaseClient();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        callback(session?.user ?? null);
    });
    
    return subscription;
}

// Get user profile with credits
export async function getUserProfile(userId: string) {
    const supabase = getSupabaseClient();
    
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
