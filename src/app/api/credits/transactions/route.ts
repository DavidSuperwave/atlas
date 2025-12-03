import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { getTransactionHistory } from '@/lib/credits';

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const transactions = await getTransactionHistory(user.id, limit, offset);

        return NextResponse.json({
            transactions,
            limit,
            offset,
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch transactions' },
            { status: 500 }
        );
    }
}


