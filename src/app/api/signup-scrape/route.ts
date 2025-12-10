import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/signup-scrape
 * 
 * Creates a scrape-only user account using a signup link token.
 * - Validates the token
 * - Creates the user account with account_type='scrape_only'
 * - Auto-approves the user (no admin approval needed)
 * - Marks the signup link as used
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, email, password } = body;

        // Validate required fields
        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        if (!email?.trim()) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        // Password validation: minimum 6 characters
        if (!password || password.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Validate signup link token
        const { data: signupLink, error: linkError } = await supabase
            .from('scrape_signup_links')
            .select('*')
            .eq('token', token)
            .single();

        if (linkError || !signupLink) {
            return NextResponse.json({ error: 'Invalid signup link' }, { status: 404 });
        }

        if (signupLink.used_at) {
            return NextResponse.json({ error: 'This signup link has already been used' }, { status: 400 });
        }

        if (new Date(signupLink.expires_at) < new Date()) {
            return NextResponse.json({ error: 'This signup link has expired' }, { status: 400 });
        }

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();

        if (existingUser) {
            return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
        }

        // Create Supabase Auth client for admin operations
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // Create user account using admin API (bypasses email confirmation)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.toLowerCase(),
            password: password,
            email_confirm: true, // Auto-confirm since they have a valid signup link
            user_metadata: {
                account_type: 'scrape_only',
            },
        });

        if (authError) {
            console.error('Error creating user:', authError);
            
            if (authError.message?.includes('already registered')) {
                return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
            }
            
            return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        // Create user profile with account_type='scrape_only' and auto-approve
        const { error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: authData.user.id,
                email: email.toLowerCase(),
                credits_balance: 0,
                is_admin: false,
                is_approved: true, // Auto-approve scrape-only users
                approved_at: new Date().toISOString(),
                account_type: 'scrape_only',
                onboarding_completed: true, // No full onboarding needed
                onboarding_completed_at: new Date().toISOString(),
            });

        if (profileError) {
            console.error('Error creating user profile:', profileError);
            // Try to clean up the auth user
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
        }

        // Mark the signup link as used
        const { error: updateError } = await supabase
            .from('scrape_signup_links')
            .update({
                used_at: new Date().toISOString(),
                used_by: authData.user.id,
            })
            .eq('id', signupLink.id);

        if (updateError) {
            console.error('Error updating signup link:', updateError);
            // Don't fail the request - the user was created successfully
        }

        return NextResponse.json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: authData.user.id,
                email: email.toLowerCase(),
                account_type: 'scrape_only',
            },
        });
    } catch (error) {
        console.error('Error in signup-scrape:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

