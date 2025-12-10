import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import { addCredits } from '@/lib/credits';

/**
 * POST /api/admin/users/[id]/add-credits
 * 
 * Adds credits directly to a user's account.
 * Admin only endpoint.
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: userId } = await params;
        
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { amount, description, paymentLinkId } = body;

        // Validate amount
        if (!amount || amount < 1) {
            return NextResponse.json({ error: 'Amount must be at least 1' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Verify user exists
        const { data: targetUser, error: userError } = await supabase
            .from('user_profiles')
            .select('id, email, credits_balance')
            .eq('id', userId)
            .single();

        if (userError || !targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Add credits
        const creditDescription = description || `Admin credit addition by ${user.email}`;
        const newBalance = await addCredits(userId, amount, creditDescription);

        // If this is completing a payment link, update the link status
        if (paymentLinkId) {
            await supabase
                .from('payment_links')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    completed_by: user.id,
                })
                .eq('id', paymentLinkId);
        }

        return NextResponse.json({
            success: true,
            message: `Added ${amount} credits to ${targetUser.email}`,
            userId,
            userEmail: targetUser.email,
            creditsAdded: amount,
            newBalance,
        });
    } catch (error) {
        console.error('Error in add-credits:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

