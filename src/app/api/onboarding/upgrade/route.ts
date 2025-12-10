import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser } from '@/lib/supabase-server';

/**
 * POST /api/onboarding/upgrade
 * 
 * Upgrades a scrape-only user to a full app user.
 * Requires the user to be authenticated.
 */
export async function POST(request: Request) {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, hasApolloAccount, campaignPlatform, campaignApiKey, campaignWorkspaceId, campaignId, creditsPlan } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        if (hasApolloAccount === null || hasApolloAccount === undefined) {
            return NextResponse.json({ error: 'Apollo account status is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Get current user profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        // Verify user is scrape_only
        if (profile.account_type !== 'scrape_only') {
            return NextResponse.json({ 
                error: 'User is not a scrape-only account',
                accountType: profile.account_type
            }, { status: 400 });
        }

        // Get current credits balance to preserve it
        const currentCredits = profile.credits_balance || 0;

        // Update user profile to full account
        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
                name: name.trim(),
                has_apollo_account: hasApolloAccount,
                account_type: 'full',
                credits_balance: currentCredits + 1000, // Add 1000 bonus credits for upgrade
                onboarding_completed: true,
                onboarding_completed_at: new Date().toISOString(),
                requested_credits_plan: creditsPlan || null,
                is_approved: false, // Requires admin approval for full app
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Error updating user profile:', updateError);
            return NextResponse.json({ error: 'Failed to upgrade account' }, { status: 500 });
        }

        // Create credit transaction record for the upgrade bonus
        await supabase
            .from('credit_transactions')
            .insert({
                user_id: user.id,
                amount: 1000,
                type: 'topup',
                description: 'Upgrade bonus - Scrape to Full App',
            });

        // Create credit order if a plan was selected
        if (creditsPlan) {
            const planMapping: Record<string, { name: string; credits: number }> = {
                starter: { name: 'Starter', credits: 5000 },
                pro: { name: 'Pro', credits: 25000 },
                enterprise: { name: 'Enterprise', credits: 100000 },
            };

            const plan = planMapping[creditsPlan];
            if (plan) {
                await supabase
                    .from('credit_orders')
                    .insert({
                        user_id: user.id,
                        email: profile.email,
                        credits_amount: plan.credits,
                        plan_name: plan.name,
                        status: 'pending',
                    });
            }
        }

        // Return campaign account data if provided
        const campaignAccountData = campaignPlatform && campaignApiKey && campaignId ? {
            platform: campaignPlatform,
            apiKey: campaignApiKey,
            workspaceId: campaignWorkspaceId || undefined,
            campaignId: campaignId,
        } : null;

        return NextResponse.json({
            success: true,
            message: 'Account upgraded successfully',
            user: {
                id: user.id,
                email: profile.email,
            },
            campaignAccount: campaignAccountData,
            newCreditsBalance: currentCredits + 1000,
        });
    } catch (error) {
        console.error('Error upgrading account:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/onboarding/upgrade
 * 
 * Checks if the current user can upgrade.
 */
export async function GET() {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createServiceClient();

        // Get current user profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, email, name, account_type, credits_balance')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }

        const canUpgrade = profile.account_type === 'scrape_only';

        return NextResponse.json({
            canUpgrade,
            accountType: profile.account_type,
            email: profile.email,
            name: profile.name,
            creditsBalance: profile.credits_balance,
        });
    } catch (error) {
        console.error('Error checking upgrade status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

