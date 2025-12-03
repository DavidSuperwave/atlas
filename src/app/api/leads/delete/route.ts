import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getUserProfile, createServiceClient } from '@/lib/supabase-server';

const supabase = createServiceClient();

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leadIds } = await request.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: 'leadIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Check if user is admin
    const profile = await getUserProfile(user.id);
    const isAdmin = profile?.is_admin ?? false;

    // Build query - only delete leads the user owns (unless admin)
    let query = supabase
      .from('leads')
      .delete()
      .in('id', leadIds);

    // If not admin, only allow deleting own leads
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { error, count } = await query;

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json(
        { error: 'Failed to delete leads', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: count ?? leadIds.length
    });
  } catch (error) {
    console.error('Delete API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
