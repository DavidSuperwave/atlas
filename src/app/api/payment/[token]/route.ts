import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

/**
 * GET /api/payment/[token]
 * 
 * Returns payment link details. Public endpoint.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Get payment link
        const { data: link, error } = await supabase
            .from('payment_links')
            .select('id, credit_amount, plan_name, description, status, expires_at, paid_at, completed_at')
            .eq('token', token)
            .single();

        if (error || !link) {
            return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
        }

        // Check if expired
        const isExpired = new Date(link.expires_at) < new Date();
        if (isExpired && link.status === 'pending') {
            // Update status to expired
            await supabase
                .from('payment_links')
                .update({ status: 'expired' })
                .eq('id', link.id);
            
            return NextResponse.json({ 
                error: 'This payment link has expired' 
            }, { status: 400 });
        }

        return NextResponse.json({ link });
    } catch (error) {
        console.error('Error in payment GET:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}




