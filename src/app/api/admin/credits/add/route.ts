import { NextResponse } from 'next/server';
import { getCurrentUser, isUserAdmin, getUserProfile } from '@/lib/supabase-server';
import { addCredits, getAllUsersWithCredits } from '@/lib/credits';

// GET: List all users with their credit balances (admin only)
export async function GET() {
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

        const users = await getAllUsersWithCredits();

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json(
            { error: 'Failed to fetch users' },
            { status: 500 }
        );
    }
}

// POST: Add credits to a user (admin only)
export async function POST(request: Request) {
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
        const { userId, amount, description } = body;

        if (!userId || !amount) {
            return NextResponse.json(
                { error: 'Missing required fields: userId and amount' },
                { status: 400 }
            );
        }

        if (typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json(
                { error: 'Amount must be a positive number' },
                { status: 400 }
            );
        }

        // Verify target user exists
        const targetProfile = await getUserProfile(userId);
        if (!targetProfile) {
            return NextResponse.json(
                { error: 'Target user not found' },
                { status: 404 }
            );
        }

        const newBalance = await addCredits(
            userId,
            amount,
            description || `Admin top-up by ${user.email}`
        );

        return NextResponse.json({
            success: true,
            userId,
            amount,
            newBalance,
            message: `Added ${amount} credits to ${targetProfile.email}`,
        });
    } catch (error) {
        console.error('Error adding credits:', error);
        return NextResponse.json(
            { error: 'Failed to add credits' },
            { status: 500 }
        );
    }
}


