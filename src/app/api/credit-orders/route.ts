import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Premium plan names that require Telegram contact
const PREMIUM_PLANS = ['Enterprise', 'Ultimate'];

/**
 * Credit Orders API
 * 
 * Note: Standard plans now redirect directly to Whop checkout from the frontend.
 * This API is used for:
 * - Premium plans (manual Telegram contact flow)
 * - Fetching order history
 * - Legacy manual order flow
 */

// POST: Create a new credit order request (for Premium plans or manual flow)
export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { planName, creditsAmount, isSubscription } = body;

        // Validate required fields
        if (!planName || !creditsAmount) {
            return NextResponse.json(
                { error: 'Plan name and credits amount are required' },
                { status: 400 }
            );
        }

        // Validate credits amount is positive
        if (creditsAmount <= 0) {
            return NextResponse.json(
                { error: 'Credits amount must be positive' },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();

        // Get user's email from profile
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json(
                { error: 'User profile not found' },
                { status: 404 }
            );
        }

        // Check if this is a Premium plan
        const isPremiumPlan = PREMIUM_PLANS.includes(planName);

        // Check for existing pending order
        const { data: existingOrder } = await supabase
            .from('credit_orders')
            .select('id, status')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .single();

        if (existingOrder) {
            return NextResponse.json(
                { error: 'You already have a pending credit order. Please wait for it to be processed.' },
                { status: 400 }
            );
        }

        // Create the order
        const { data: order, error: orderError } = await supabase
            .from('credit_orders')
            .insert({
                user_id: user.id,
                email: profile.email,
                credits_amount: creditsAmount,
                plan_name: planName,
                status: 'pending',
                payment_method: isPremiumPlan ? 'telegram' : 'manual',
            })
            .select()
            .single();

        if (orderError) {
            console.error('Error creating credit order:', orderError);
            return NextResponse.json(
                { error: 'Failed to create credit order' },
                { status: 500 }
            );
        }

        // Return appropriate response based on plan type
        if (isPremiumPlan) {
            return NextResponse.json({
                success: true,
                message: 'Premium plan order created. Please contact us via Telegram to complete setup.',
                order: order,
                requiresTelegramContact: true,
                isPremium: true,
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Order submitted. An admin will review and process your order.',
            order: order,
            isSubscription: isSubscription || false,
        });
    } catch (error) {
        console.error('Error processing credit order:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET: Get current user's credit orders
export async function GET() {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabase = createServiceClient();

        const { data: orders, error } = await supabase
            .from('credit_orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching credit orders:', error);
            return NextResponse.json(
                { error: 'Failed to fetch credit orders' },
                { status: 500 }
            );
        }

        return NextResponse.json({ orders });
    } catch (error) {
        console.error('Error fetching credit orders:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
