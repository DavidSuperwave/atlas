import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, email, intent, telegramUsername, wantsImmediateStart } = body;

        // Validate required fields
        if (!name || !email) {
            return NextResponse.json(
                { error: 'Name and email are required' },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        const supabase = createServiceClient();

        // Check if email already submitted a request
        const { data: existingRequest } = await supabase
            .from('access_requests')
            .select('id, status')
            .eq('email', email.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                return NextResponse.json(
                    { error: 'You have already submitted an access request. We\'ll be in touch soon!' },
                    { status: 400 }
                );
            }
            if (existingRequest.status === 'approved') {
                return NextResponse.json(
                    { error: 'Your request has been approved. Please check your email for the invite link.' },
                    { status: 400 }
                );
            }
        }

        // Insert new access request
        const { data, error } = await supabase
            .from('access_requests')
            .insert({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                intent: intent?.trim() || null,
                telegram_username: telegramUsername?.trim() || null,
                wants_immediate_start: wantsImmediateStart || false,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating access request:', error);
            return NextResponse.json(
                { error: 'Failed to submit request. Please try again.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Access request submitted successfully',
            id: data.id,
        });
    } catch (error) {
        console.error('Error processing access request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// GET endpoint for admin to list access requests
export async function GET(request: Request) {
    try {
        const supabase = createServiceClient();

        // Get status filter from query params
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let query = supabase
            .from('access_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching access requests:', error);
            return NextResponse.json(
                { error: 'Failed to fetch requests' },
                { status: 500 }
            );
        }

        return NextResponse.json({ requests: data });
    } catch (error) {
        console.error('Error fetching access requests:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

