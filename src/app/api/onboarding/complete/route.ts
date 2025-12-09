import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { token, name, password, hasApolloAccount, campaignPlatform, campaignApiKey, campaignWorkspaceId, campaignId, creditsPlan } = body;

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Password validation: minimum 8 characters with at least one letter and one number
        if (!password || password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
        }
        
        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        if (!hasLetter || !hasNumber) {
            return NextResponse.json({ error: 'Password must contain at least one letter and one number' }, { status: 400 });
        }

        if (hasApolloAccount === null || hasApolloAccount === undefined) {
            return NextResponse.json({ error: 'Apollo account status is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Validate invite token
        const { data: invite, error: inviteError } = await supabase
            .from('invites')
            .select('*')
            .eq('token', token)
            .single();

        if (inviteError || !invite) {
            return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
        }

        if (invite.used_at) {
            return NextResponse.json({ error: 'This invite has already been used' }, { status: 400 });
        }

        if (new Date(invite.expires_at) < new Date()) {
            return NextResponse.json({ error: 'This invite has expired' }, { status: 400 });
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
            email: invite.email,
            password: password,
            email_confirm: true, // Auto-confirm the email since they have a valid invite
            user_metadata: {
                name: name.trim(),
                has_apollo_account: hasApolloAccount,
            },
        });

        if (authError) {
            console.error('Error creating user:', authError);
            
            // Check for specific error types
            if (authError.message.includes('already registered')) {
                return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
            }
            
            return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
        }

        if (!authData.user) {
            return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
        }

        // Update user profile with additional info
        // Note: The trigger should have already created the profile, but we'll update it
        // Set is_approved = false - admin must approve before user can access
        const { error: profileError } = await supabase
            .from('user_profiles')
            .update({
                name: name.trim(),
                has_apollo_account: hasApolloAccount,
                credits_balance: 1000, // Give 1000 free credits
                onboarding_completed: true,
                onboarding_completed_at: new Date().toISOString(),
                requested_credits_plan: creditsPlan || null,
                is_approved: false, // Requires admin approval
            })
            .eq('id', authData.user.id);

        if (profileError) {
            console.error('Error updating user profile:', profileError);
            // Don't fail - the account was created successfully
        }

        // Mark invite as used
        const { error: updateInviteError } = await supabase
            .from('invites')
            .update({ 
                used_at: new Date().toISOString(),
            })
            .eq('id', invite.id);

        if (updateInviteError) {
            console.error('Error marking invite as used:', updateInviteError);
            // Don't fail - the account was created successfully
        }

        // Update access request status if linked
        const { error: accessRequestError } = await supabase
            .from('access_requests')
            .update({
                status: 'approved',
                reviewed_at: new Date().toISOString(),
            })
            .eq('invite_id', invite.id);

        if (accessRequestError) {
            console.error('Error updating access request:', accessRequestError);
            // Don't fail - the account was created successfully
        }

        // Return campaign account data if provided (will be saved to localStorage client-side)
        const campaignAccountData = campaignPlatform && campaignApiKey && campaignId ? {
            platform: campaignPlatform,
            apiKey: campaignApiKey,
            workspaceId: campaignWorkspaceId || undefined,
            campaignId: campaignId,
        } : null;

        // Create credit transaction record for the initial 1000 credits (always given)
        await supabase
            .from('credit_transactions')
            .insert({
                user_id: authData.user.id,
                amount: 1000,
                type: 'topup',
                description: 'Welcome bonus - Onboarding',
            });

        // Create credit order if a plan was selected
        if (creditsPlan) {
            // Map plan IDs to plan names and credit amounts
            const planMapping: Record<string, { name: string; credits: number }> = {
                starter: { name: 'Starter', credits: 5000 },
                pro: { name: 'Pro', credits: 25000 },
                enterprise: { name: 'Enterprise', credits: 100000 },
            };

            const plan = planMapping[creditsPlan];
            if (plan) {
                // Create a credit order for admin review
                await supabase
                    .from('credit_orders')
                    .insert({
                        user_id: authData.user.id,
                        email: invite.email,
                        credits_amount: plan.credits,
                        plan_name: plan.name,
                        status: 'pending',
                    });
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: authData.user.id,
                email: authData.user.email,
            },
            campaignAccount: campaignAccountData,
        });
    } catch (error) {
        console.error('Error completing onboarding:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

