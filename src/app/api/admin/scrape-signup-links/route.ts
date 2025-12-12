import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import crypto from 'crypto';

/**
 * GET /api/admin/scrape-signup-links
 * 
 * Returns all scrape signup links with usage stats.
 * Admin only endpoint.
 */
export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const supabase = createServiceClient();

        // Get all scrape signup links with user info
        const { data: links, error } = await supabase
            .from('scrape_signup_links')
            .select(`
                *,
                creator:created_by(id, email, name),
                used_by_user:used_by(id, email, name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching scrape signup links:', error);
            return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
        }

        // Calculate stats
        const now = new Date();
        const stats = {
            total: links?.length || 0,
            used: links?.filter(l => l.used_at).length || 0,
            unused: links?.filter(l => !l.used_at).length || 0,
            expired: links?.filter(l => !l.used_at && new Date(l.expires_at) < now).length || 0,
            active: links?.filter(l => !l.used_at && new Date(l.expires_at) >= now).length || 0,
        };

        return NextResponse.json({ 
            links: links || [],
            stats,
        });
    } catch (error) {
        console.error('Error in scrape signup links GET:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/admin/scrape-signup-links
 * 
 * Generates a new scrape signup link.
 * Admin only endpoint.
 */
export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { expiresInDays = 7 } = body;

        // Validate expiresInDays
        if (expiresInDays < 1 || expiresInDays > 30) {
            return NextResponse.json({ error: 'expiresInDays must be between 1 and 30' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Generate unique token
        const token = crypto.randomBytes(32).toString('hex');

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        // Create the signup link record
        const { data: link, error } = await supabase
            .from('scrape_signup_links')
            .insert({
                token,
                created_by: user.id,
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating scrape signup link:', error);
            return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
        }

        // Generate the full signup URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const signupUrl = `${baseUrl}/signup-scrape?token=${token}`;

        return NextResponse.json({
            success: true,
            link: {
                id: link.id,
                token: link.token,
                signupUrl,
                expiresAt: link.expires_at,
                createdAt: link.created_at,
            },
        });
    } catch (error) {
        console.error('Error in scrape signup links POST:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/scrape-signup-links
 * 
 * Deletes a scrape signup link.
 * Admin only endpoint.
 */
export async function DELETE(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const linkId = searchParams.get('id');

        if (!linkId) {
            return NextResponse.json({ error: 'Link ID is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Check if link exists and is not used
        const { data: existingLink, error: checkError } = await supabase
            .from('scrape_signup_links')
            .select('id, used_at')
            .eq('id', linkId)
            .single();

        if (checkError || !existingLink) {
            return NextResponse.json({ error: 'Link not found' }, { status: 404 });
        }

        if (existingLink.used_at) {
            return NextResponse.json({ error: 'Cannot delete a used link' }, { status: 400 });
        }

        // Delete the link
        const { error: deleteError } = await supabase
            .from('scrape_signup_links')
            .delete()
            .eq('id', linkId);

        if (deleteError) {
            console.error('Error deleting scrape signup link:', deleteError);
            return NextResponse.json({ error: 'Failed to delete link' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in scrape signup links DELETE:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}









