import { NextResponse } from 'next/server';
import { getCurrentUser, getUserProfile } from '@/lib/supabase-server';
import { getTotalCreditsPurchased } from '@/lib/credits';

export async function GET() {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const profile = await getUserProfile(user.id);
        
        if (!profile) {
            return NextResponse.json(
                { error: 'User profile not found' },
                { status: 404 }
            );
        }

        const totalPurchased = await getTotalCreditsPurchased(user.id);

        return NextResponse.json({
            balance: profile.credits_balance,
            totalPurchased,
            email: profile.email,
            is_admin: profile.is_admin,
        });
    } catch (error) {
        console.error('Error fetching credit balance:', error);
        return NextResponse.json(
            { error: 'Failed to fetch credit balance' },
            { status: 500 }
        );
    }
}


