import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

/**
 * POST /api/payment/[token]/mark-paid
 * 
 * Marks a payment link as paid (user has sent payment).
 * Public endpoint - users can mark their own payments.
 */
export async function POST(
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
        const { data: link, error: fetchError } = await supabase
            .from('payment_links')
            .select('*')
            .eq('token', token)
            .single();

        if (fetchError || !link) {
            return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
        }

        // Check if already processed
        if (link.status === 'completed') {
            return NextResponse.json({ 
                error: 'This payment has already been completed',
                link: {
                    id: link.id,
                    status: link.status,
                    credit_amount: link.credit_amount,
                    plan_name: link.plan_name,
                    description: link.description,
                    expires_at: link.expires_at,
                    paid_at: link.paid_at,
                    completed_at: link.completed_at,
                }
            }, { status: 400 });
        }

        if (link.status === 'expired') {
            return NextResponse.json({ error: 'This payment link has expired' }, { status: 400 });
        }

        if (link.status === 'cancelled') {
            return NextResponse.json({ error: 'This payment link has been cancelled' }, { status: 400 });
        }

        // Check if expired
        if (new Date(link.expires_at) < new Date()) {
            await supabase
                .from('payment_links')
                .update({ status: 'expired' })
                .eq('id', link.id);
            
            return NextResponse.json({ error: 'This payment link has expired' }, { status: 400 });
        }

        // Mark as paid
        const { error: updateError } = await supabase
            .from('payment_links')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
            })
            .eq('id', link.id);

        if (updateError) {
            console.error('Error updating payment link:', updateError);
            return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Payment marked as sent. Admin will confirm and add credits.',
            link: {
                id: link.id,
                status: 'paid',
                credit_amount: link.credit_amount,
                plan_name: link.plan_name,
                description: link.description,
                expires_at: link.expires_at,
                paid_at: new Date().toISOString(),
                completed_at: null,
            }
        });
    } catch (error) {
        console.error('Error in mark-paid:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}




