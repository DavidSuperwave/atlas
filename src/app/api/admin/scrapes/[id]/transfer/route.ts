import { NextResponse } from 'next/server';
import { createServiceClient, getCurrentUser, isUserAdmin } from '@/lib/supabase-server';
import { deductCredits } from '@/lib/credits';

/**
 * POST /api/admin/scrapes/[id]/transfer
 * 
 * Transfers leads from an admin's completed scrape to a user's scrape request.
 * Only transfers leads with verification_status = 'valid' or 'catchall'.
 * Credits are charged only for 'valid' leads (catchall is free).
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: targetScrapeId } = await params;
        
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { sourceScrapeId } = body;

        if (!sourceScrapeId) {
            return NextResponse.json({ error: 'sourceScrapeId is required' }, { status: 400 });
        }

        const supabase = createServiceClient();

        // Get the target scrape (user's pending request)
        const { data: targetScrape, error: targetError } = await supabase
            .from('scrapes')
            .select('*, user:user_id(id, email, credits_balance)')
            .eq('id', targetScrapeId)
            .single();

        if (targetError || !targetScrape) {
            return NextResponse.json({ error: 'Target scrape not found' }, { status: 404 });
        }

        // Verify target scrape is pending approval
        if (targetScrape.status !== 'pending_approval') {
            return NextResponse.json({ 
                error: 'Target scrape is not pending approval',
                currentStatus: targetScrape.status
            }, { status: 400 });
        }

        if (!targetScrape.requires_admin_approval) {
            return NextResponse.json({ error: 'Target scrape does not require admin approval' }, { status: 400 });
        }

        // Get the source scrape (admin's completed scrape)
        const { data: sourceScrape, error: sourceError } = await supabase
            .from('scrapes')
            .select('*')
            .eq('id', sourceScrapeId)
            .single();

        if (sourceError || !sourceScrape) {
            return NextResponse.json({ error: 'Source scrape not found' }, { status: 404 });
        }

        if (sourceScrape.status !== 'completed') {
            return NextResponse.json({ 
                error: 'Source scrape is not completed',
                currentStatus: sourceScrape.status
            }, { status: 400 });
        }

        // Get leads from source scrape that are valid or catchall
        const { data: sourceLeads, error: leadsError } = await supabase
            .from('leads')
            .select('*')
            .eq('scrape_id', sourceScrapeId)
            .in('verification_status', ['valid', 'catchall']);

        if (leadsError) {
            console.error('Error fetching source leads:', leadsError);
            return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
        }

        if (!sourceLeads || sourceLeads.length === 0) {
            return NextResponse.json({ 
                error: 'No valid or catchall leads found in source scrape',
                sourceScrapeId
            }, { status: 400 });
        }

        // Count valid and catchall leads
        const validLeads = sourceLeads.filter(l => l.verification_status === 'valid');
        const catchallLeads = sourceLeads.filter(l => l.verification_status === 'catchall');
        const creditsRequired = validLeads.length; // Only charge for valid leads

        // Check if user has enough credits
        const targetUserId = targetScrape.user_id;
        const userCredits = targetScrape.user?.credits_balance || 0;

        if (userCredits < creditsRequired) {
            return NextResponse.json({ 
                error: 'Insufficient credits',
                creditsRequired,
                creditsAvailable: userCredits,
                validLeadsCount: validLeads.length,
                catchallLeadsCount: catchallLeads.length,
            }, { status: 400 });
        }

        // Create new lead records for the target scrape
        const newLeads = sourceLeads.map(lead => ({
            scrape_id: targetScrapeId,
            user_id: targetUserId,
            first_name: lead.first_name,
            last_name: lead.last_name,
            middle_name: lead.middle_name,
            email: lead.email,
            title: lead.title,
            company_name: lead.company_name,
            company_linkedin: lead.company_linkedin,
            location: lead.location,
            company_size: lead.company_size,
            industry: lead.industry,
            website: lead.website,
            keywords: lead.keywords,
            phone_numbers: lead.phone_numbers,
            linkedin_url: lead.linkedin_url,
            verification_status: lead.verification_status,
            verification_data: lead.verification_data,
            provider: lead.provider,
            email_validity: lead.email_validity,
            mx_record: lead.mx_record,
            inbox_type: lead.inbox_type,
            credits_used: lead.verification_status === 'valid' ? 1 : 0,
            api_key_used: lead.api_key_used,
            is_duplicate: false,
            original_lead_id: lead.id, // Track where the lead came from
        }));

        // Insert new leads
        const { data: insertedLeads, error: insertError } = await supabase
            .from('leads')
            .insert(newLeads)
            .select('id');

        if (insertError) {
            console.error('Error inserting leads:', insertError);
            return NextResponse.json({ error: 'Failed to transfer leads' }, { status: 500 });
        }

        // Deduct credits for valid leads
        if (creditsRequired > 0) {
            try {
                await deductCredits(
                    targetUserId, 
                    creditsRequired, 
                    undefined, 
                    `Scrape transfer: ${creditsRequired} verified leads from scrape ${sourceScrapeId}`
                );
            } catch (creditError) {
                console.error('Error deducting credits:', creditError);
                // Don't fail the transfer - leads are already inserted
                // The admin can manually adjust credits if needed
            }
        }

        // Update target scrape status
        const { error: updateError } = await supabase
            .from('scrapes')
            .update({
                status: 'completed',
                requires_admin_approval: false,
                approved_by: user.id,
                approved_at: new Date().toISOString(),
                transferred_from_scrape_id: sourceScrapeId,
                transferred_at: new Date().toISOString(),
                transferred_leads_count: sourceLeads.length,
                total_leads: sourceLeads.length,
            })
            .eq('id', targetScrapeId);

        if (updateError) {
            console.error('Error updating target scrape:', updateError);
            // Don't fail - leads are transferred, just log the error
        }

        return NextResponse.json({
            success: true,
            message: 'Leads transferred successfully',
            targetScrapeId,
            sourceScrapeId,
            validLeadsCount: validLeads.length,
            catchallLeadsCount: catchallLeads.length,
            totalTransferred: sourceLeads.length,
            creditsCharged: creditsRequired,
            leadsInserted: insertedLeads?.length || 0,
        });

    } catch (error) {
        console.error('Error in transfer:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}

/**
 * GET /api/admin/scrapes/[id]/transfer
 * 
 * Gets information about a scrape for transfer (preview).
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: scrapeId } = await params;
        
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = await isUserAdmin(user.id);
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const supabase = createServiceClient();

        // Get the scrape
        const { data: scrape, error: scrapeError } = await supabase
            .from('scrapes')
            .select('*, user:user_id(id, email, name, credits_balance)')
            .eq('id', scrapeId)
            .single();

        if (scrapeError || !scrape) {
            return NextResponse.json({ error: 'Scrape not found' }, { status: 404 });
        }

        // Get lead counts by verification status
        const { data: leadCounts, error: countError } = await supabase
            .from('leads')
            .select('verification_status')
            .eq('scrape_id', scrapeId);

        if (countError) {
            console.error('Error fetching lead counts:', countError);
        }

        const counts = {
            total: leadCounts?.length || 0,
            valid: leadCounts?.filter(l => l.verification_status === 'valid').length || 0,
            catchall: leadCounts?.filter(l => l.verification_status === 'catchall').length || 0,
            invalid: leadCounts?.filter(l => l.verification_status === 'invalid').length || 0,
            pending: leadCounts?.filter(l => l.verification_status === 'pending').length || 0,
        };

        return NextResponse.json({
            scrape: {
                id: scrape.id,
                url: scrape.url,
                name: scrape.name,
                status: scrape.status,
                created_at: scrape.created_at,
                requires_admin_approval: scrape.requires_admin_approval,
                user: scrape.user,
            },
            leadCounts: counts,
            transferableLeads: counts.valid + counts.catchall,
            creditsRequired: counts.valid, // Only valid leads cost credits
        });

    } catch (error) {
        console.error('Error in transfer GET:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}




