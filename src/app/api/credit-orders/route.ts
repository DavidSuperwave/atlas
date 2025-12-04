import { NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';

// POST: Create a new credit order request
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
        const { planName, creditsAmount } = body;

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

        // Check for existing pending order
        const { data: existingOrder } = await supabase
            .from('credit_orders')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .single();

        if (existingOrder) {
            return NextResponse.json(
                { error: 'You already have a pending credit order. Please wait for it to be processed.' },
                { status: 400 }
            );
        }

        // Create the credit order
        const { data, error } = await supabase
            .from('credit_orders')
            .insert({
                user_id: user.id,
                email: profile.email,
                credits_amount: creditsAmount,
                plan_name: planName,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating credit order:', error);
            return NextResponse.json(
                { error: 'Failed to create credit order' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Credit order submitted successfully',
            order: data,
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

