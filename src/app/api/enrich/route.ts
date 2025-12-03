import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verificationQueue } from '@/lib/verification-queue';
import { generatePermutations, extractDomain } from '@/lib/permutation-utils';
import { getCurrentUser, getUserProfile } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Handle CORS preflight requests
export async function OPTIONS(request: Request) {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;
    return new NextResponse(null, { status: 204 });
}

export async function POST(request: Request) {
    // Handle CORS for cross-origin requests
    const corsPreflightResponse = handleCors(request);
    if (corsPreflightResponse) return corsPreflightResponse;
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return corsJsonResponse({ error: 'Unauthorized' }, request, { status: 401 });
        }

        // Get user profile to check credits
        const profile = await getUserProfile(user.id);
        if (!profile) {
            return corsJsonResponse({ error: 'User profile not found' }, request, { status: 404 });
        }

        const body = await request.json();
        
        // Support bulk scrape enrichment, single lead with custom permutations, or single lead auto-generate
        if (body.scrapeId) {
            return await enrichScrape(body.scrapeId, user.id, profile.credits_balance, request);
        } else if (body.leadId && body.permutations) {
            // Custom permutations provided (from edit modal)
            return await enrichWithCustomPermutations(body.leadId, body.permutations, user.id, profile.credits_balance, request);
        } else if (body.leadId) {
            // Auto-generate permutations from lead data
            return await enrichSingleLeadAuto(body.leadId, user.id, profile.credits_balance, request);
        } else {
            return corsJsonResponse({ error: 'Missing scrapeId or leadId' }, request, { status: 400 });
        }
    } catch (error) {
        console.error('Enrichment error:', error);
        return corsJsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, request, { status: 500 });
    }
}

async function enrichScrape(scrapeId: string, userId: string, currentCredits: number, request: Request) {
    // Query all leads for this scrape that haven't been enriched yet
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .eq('scrape_id', scrapeId)
        .is('email_validity', null);

    if (error) {
        console.error('Error fetching leads:', error);
        return corsJsonResponse({ error: 'Failed to fetch leads' }, request, { status: 500 });
    }

    if (!leads || leads.length === 0) {
        return corsJsonResponse({ success: true, message: 'No unprocessed leads found', count: 0 }, request);
    }

    // Check if user has enough credits for at least one lead
    // Credits are deducted on successful enrichment, so we just need at least 1 credit
    if (currentCredits < 1) {
        return corsJsonResponse({ 
            error: 'Insufficient credits. Please top up your account.',
            credits_required: leads.length,
            credits_available: currentCredits
        }, request, { status: 402 });
    }

    let queuedCount = 0;
    let skippedCount = 0;

    for (const lead of leads) {
        // Check for required fields
        if (!lead.first_name || !lead.last_name) {
            console.log(`Skipping lead ${lead.id}: Missing first or last name`);
            await supabase
                .from('leads')
                .update({ verification_status: 'invalid' })
                .eq('id', lead.id);
            skippedCount++;
            continue;
        }

        // Extract domain from website
        const domain = extractDomain(lead.website);
        if (!domain) {
            console.log(`Skipping lead ${lead.id}: No valid domain found`);
            await supabase
                .from('leads')
                .update({ verification_status: 'invalid' })
                .eq('id', lead.id);
            skippedCount++;
            continue;
        }

        // Generate permutations
        const permutations = generatePermutations(
            lead.first_name,
            lead.last_name,
            lead.middle_name || null,
            domain
        );

        if (permutations.length === 0) {
            console.log(`Skipping lead ${lead.id}: Could not generate permutations`);
            await supabase
                .from('leads')
                .update({ verification_status: 'invalid' })
                .eq('id', lead.id);
            skippedCount++;
            continue;
        }

        // Set status to processing and associate with user
        await supabase
            .from('leads')
            .update({ 
                verification_status: 'processing',
                user_id: userId
            })
            .eq('id', lead.id);

        // Add to verification queue with userId for credit deduction
        verificationQueue.add({
            type: 'lead',
            leadId: lead.id,
            permutations,
            userId
        });

        queuedCount++;
        console.log(`Queued lead ${lead.id} with ${permutations.length} permutations for user ${userId}`);
    }

    return corsJsonResponse({
        success: true,
        message: `Enrichment started for ${queuedCount} leads`,
        count: queuedCount,
        skipped: skippedCount,
        credits_available: currentCredits
    }, request);
}

// Enrich with custom permutations (from edit modal)
async function enrichWithCustomPermutations(
    leadId: string, 
    permutations: { email: string; pattern: string }[],
    userId: string,
    currentCredits: number,
    request: Request
) {
    if (!leadId || !permutations || permutations.length === 0) {
        return corsJsonResponse({ error: 'Missing leadId or permutations' }, request, { status: 400 });
    }

    // Check credits - need at least 1 for potential success
    if (currentCredits < 1) {
        return corsJsonResponse({ 
            error: 'Insufficient credits. Please top up your account.',
            credits_required: 1,
            credits_available: currentCredits
        }, request, { status: 402 });
    }

    // Validate permutations
    const validPermutations = permutations.filter(p => p.email && p.email.includes('@'));
    if (validPermutations.length === 0) {
        return corsJsonResponse({ error: 'No valid permutations provided' }, request, { status: 400 });
    }

    // Clear previous verification data and set status to processing
    await supabase
        .from('leads')
        .update({ 
            verification_status: 'processing',
            user_id: userId,
            email: null,
            email_validity: null,
            mx_record: null,
            inbox_type: null,
            provider: null,
            verification_data: null
        })
        .eq('id', leadId);

    // Add to verification queue with userId
    verificationQueue.add({
        type: 'lead',
        leadId,
        permutations: validPermutations,
        userId
    });

    console.log(`Queued lead ${leadId} with ${validPermutations.length} custom permutations for user ${userId}`);

    return corsJsonResponse({ 
        success: true, 
        message: 'Enrichment queued with custom permutations', 
        count: validPermutations.length,
        credits_available: currentCredits
    }, request);
}

// Auto-generate permutations from lead data in database
async function enrichSingleLeadAuto(leadId: string, userId: string, currentCredits: number, request: Request) {
    // Check credits first
    if (currentCredits < 1) {
        return corsJsonResponse({ 
            error: 'Insufficient credits. Please top up your account.',
            credits_required: 1,
            credits_available: currentCredits
        }, request, { status: 402 });
    }

    // Fetch lead data
    const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

    if (error || !lead) {
        return corsJsonResponse({ error: 'Lead not found' }, request, { status: 404 });
    }

    if (!lead.first_name || !lead.last_name) {
        return corsJsonResponse({ error: 'Missing first or last name' }, request, { status: 400 });
    }

    const domain = extractDomain(lead.website);
    if (!domain) {
        return corsJsonResponse({ error: 'Invalid or missing website/domain' }, request, { status: 400 });
    }

    const permutations = generatePermutations(
        lead.first_name,
        lead.last_name,
        lead.middle_name || null,
        domain
    );

    if (permutations.length === 0) {
        return corsJsonResponse({ error: 'Could not generate permutations' }, request, { status: 400 });
    }

    // Clear previous verification data and set status to processing
    await supabase
        .from('leads')
        .update({ 
            verification_status: 'processing',
            user_id: userId,
            email: null,
            email_validity: null,
            mx_record: null,
            inbox_type: null,
            provider: null,
            verification_data: null
        })
        .eq('id', leadId);

    // Add to queue with userId
    verificationQueue.add({
        type: 'lead',
        leadId,
        permutations,
        userId
    });

    console.log(`Queued lead ${leadId} with ${permutations.length} auto-generated permutations for user ${userId}`);

    return corsJsonResponse({ 
        success: true, 
        message: 'Enrichment queued', 
        count: permutations.length,
        credits_available: currentCredits
    }, request);
}
