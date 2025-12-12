import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import crypto from 'crypto';

/**
 * POST /api/admin/users/[id]/send-payment-link
 * 
 * Generates and optionally sends a payment link to a user.
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
        const { creditAmount, planName, description, expiresInDays = 7 } = body;

        // Validate inputs
        if (!creditAmount || creditAmount < 1) {
            return NextResponse.json({ error: 'creditAmount must be at least 1' }, { status: 400 });
        }

        if (expiresInDays < 1 || expiresInDays > 30) {
            return NextResponse.json({ error: 'expiresInDays must be between 1 and 30' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Verify user exists
        const { data: targetUser, error: userError } = await supabase
            .from('user_profiles')
            .select('id, email, name')
            .eq('id', userId)
            .single();

        if (userError || !targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Generate unique token
        const token = crypto.randomBytes(32).toString('hex');

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        // Create payment link
        const { data: link, error: createError } = await supabase
            .from('payment_links')
            .insert({
                token,
                user_id: userId,
                credit_amount: creditAmount,
                plan_name: planName || null,
                description: description || null,
                status: 'pending',
                created_by: user.id,
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (createError) {
            console.error('Error creating payment link:', createError);
            return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
        }

        // Generate the full URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const paymentUrl = `${baseUrl}/payment/${token}`;

        return NextResponse.json({
            success: true,
            link: {
                id: link.id,
                token: link.token,
                paymentUrl,
                userId,
                userEmail: targetUser.email,
                userName: targetUser.name,
                creditAmount,
                planName,
                expiresAt: link.expires_at,
                createdAt: link.created_at,
            },
        });
    } catch (error) {
        console.error('Error in send-payment-link:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}




