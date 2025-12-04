import { NextResponse } from 'next/server';
import { getCurrentUser, isUserAdmin, createServiceClient } from '@/lib/supabase-server';
import { addCredits } from '@/lib/credits';

// GET: List all credit orders (admin only)
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || 'all';

        const supabase = createServiceClient();

        let query = supabase
            .from('credit_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (status !== 'all') {
            query = query.eq('status', status);
        }

        const { data: orders, error } = await query;

        if (error) {
            console.error('Error fetching credit orders:', error);
            return NextResponse.json(
                { error: 'Failed to fetch credit orders' },
                { status: 500 }
            );
        }

        // Count pending orders
        const { count: pendingCount } = await supabase
            .from('credit_orders')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        return NextResponse.json({ 
            orders,
            pendingCount: pendingCount || 0,
        });
    } catch (error) {
        console.error('Error fetching credit orders:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// PATCH: Update a credit order (approve/cancel)
export async function PATCH(request: Request) {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json(
                { error: 'Forbidden: Admin access required' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { orderId, action } = body;

        if (!orderId || !action) {
            return NextResponse.json(
                { error: 'Order ID and action are required' },
                { status: 400 }
            );
        }

        if (!['approve', 'cancel'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Use "approve" or "cancel"' },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();

        // Get the order
        const { data: order, error: orderError } = await supabase
            .from('credit_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            );
        }

        if (order.status !== 'pending') {
            return NextResponse.json(
                { error: 'Order has already been processed' },
                { status: 400 }
            );
        }

        if (action === 'approve') {
            // Add credits to the user's account
            try {
                await addCredits(
                    order.user_id,
                    order.credits_amount,
                    `Credit purchase: ${order.plan_name} (${order.credits_amount.toLocaleString()} credits)`
                );
            } catch (creditError) {
                console.error('Error adding credits:', creditError);
                return NextResponse.json(
                    { error: 'Failed to add credits to user account' },
                    { status: 500 }
                );
            }

            // Update order status
            const { error: updateError } = await supabase
                .from('credit_orders')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    completed_by: user.id,
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('Error updating order:', updateError);
                return NextResponse.json(
                    { error: 'Credits added but failed to update order status' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: `Approved! Added ${order.credits_amount.toLocaleString()} credits to ${order.email}`,
            });
        } else {
            // Cancel the order
            const { error: updateError } = await supabase
                .from('credit_orders')
                .update({
                    status: 'cancelled',
                    completed_at: new Date().toISOString(),
                    completed_by: user.id,
                })
                .eq('id', orderId);

            if (updateError) {
                console.error('Error cancelling order:', updateError);
                return NextResponse.json(
                    { error: 'Failed to cancel order' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: `Order cancelled for ${order.email}`,
            });
        }
    } catch (error) {
        console.error('Error processing credit order:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

