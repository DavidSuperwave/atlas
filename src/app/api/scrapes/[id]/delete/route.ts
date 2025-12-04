import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, createServiceClient } from '@/lib/supabase-server';

const supabase = createServiceClient();

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { keepLeads } = await request.json().catch(() => ({ keepLeads: false }));

        if (!id) {
            return NextResponse.json({ error: 'Scrape ID is required' }, { status: 400 });
        }

        // Verify ownership of the scrape
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .select('id, user_id')
            .eq('id', id)
            .single();

        if (scrapeError || !scrape) {
            return NextResponse.json({ error: 'Scrape not found' }, { status: 404 });
        }

        if (scrape.user_id !== user.id) {
            return NextResponse.json({ error: 'Not authorized to delete this scrape' }, { status: 403 });
        }

        // If keepLeads is false, delete associated leads first
        if (!keepLeads) {
            const { error: leadsDeleteError } = await supabase
                .from('leads')
                .delete()
                .eq('scrape_id', id);

            if (leadsDeleteError) {
                console.error('Error deleting leads:', leadsDeleteError);
                return NextResponse.json(
                    { error: 'Failed to delete associated leads', details: leadsDeleteError.message },
                    { status: 500 }
                );
            }
        } else {
            // If keeping leads, just unlink them from the scrape
            const { error: unlinkError } = await supabase
                .from('leads')
                .update({ scrape_id: null })
                .eq('scrape_id', id);

            if (unlinkError) {
                console.error('Error unlinking leads:', unlinkError);
                return NextResponse.json(
                    { error: 'Failed to unlink leads', details: unlinkError.message },
                    { status: 500 }
                );
            }
        }

        // Delete the scrape record
        const { error: scrapeDeleteError } = await supabase
            .from('scrapes')
            .delete()
            .eq('id', id);

        if (scrapeDeleteError) {
            console.error('Error deleting scrape:', scrapeDeleteError);
            return NextResponse.json(
                { error: 'Failed to delete scrape', details: scrapeDeleteError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: keepLeads ? 'Scrape deleted, leads preserved' : 'Scrape and leads deleted'
        });
    } catch (error) {
        console.error('Delete scrape API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

