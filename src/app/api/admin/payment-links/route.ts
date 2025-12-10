import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import crypto from 'crypto';

const supabase = createServiceClient();

/**
 * GET /api/admin/payment-links
 * 
 * Returns all payment links.
 * Admin only endpoint.
 */
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: links, error } = await supabase
            .from('payment_links')
            .select(`
                *,
                user:user_id(id, email, name),
                creator:created_by(id, email, name),
                completer:completed_by(id, email, name)
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error fetching payment links:', error);
            return NextResponse.json({ error: 'Failed to fetch payment links' }, { status: 500 });
        }

        // Calculate stats
        const stats = {
            total: links?.length || 0,
            pending: links?.filter(l => l.status === 'pending').length || 0,
            paid: links?.filter(l => l.status === 'paid').length || 0,
            completed: links?.filter(l => l.status === 'completed').length || 0,
            expired: links?.filter(l => l.status === 'expired').length || 0,
        };

        return NextResponse.json({ links: links || [], stats });
    } catch (error) {
        console.error('Error in payment-links GET:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/payment-links
 * 
 * Creates a new payment link for a user.
 * Admin only endpoint.
 */
export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { userId, creditAmount, planName, description, expiresInDays = 7 } = body;

        // Validate inputs
        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        if (!creditAmount || creditAmount < 1) {
            return NextResponse.json({ error: 'creditAmount must be at least 1' }, { status: 400 });
        }

        if (expiresInDays < 1 || expiresInDays > 30) {
            return NextResponse.json({ error: 'expiresInDays must be between 1 and 30' }, { status: 400 });
        }

        // Verify user exists
        const { data: targetUser, error: userError } = await supabase
            .from('user_profiles')
            .select('id, email')
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
                creditAmount,
                planName,
                expiresAt: link.expires_at,
                createdAt: link.created_at,
            },
        });
    } catch (error) {
        console.error('Error in payment-links POST:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

