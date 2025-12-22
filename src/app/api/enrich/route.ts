import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verificationQueue } from '@/lib/verification-queue';
import { generatePermutations, extractDomain } from '@/lib/permutation-utils';
import { getCurrentUser, getUserProfile } from '@/lib/supabase-server';
import { handleCors, corsJsonResponse } from '@/lib/cors';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Use service role key to bypass RLS for server-side operations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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

        // Rate limit per user for enrichment requests
        const rateLimit = checkRateLimit(user.id, RATE_LIMITS.ENRICH);
        if (rateLimit.limited) {
            return corsJsonResponse({
                error: 'Rate limit exceeded',
                retryAfter: rateLimit.resetInSeconds
            }, request, {
                status: 429,
                headers: { 'Retry-After': rateLimit.resetInSeconds.toString() }
            });
        }

        // Get user profile to check credits
        const profile = await getUserProfile(user.id);
        if (!profile) {
            return corsJsonResponse({ error: 'User profile not found' }, request, { status: 404 });
        }

        const body = await request.json();

        // Support bulk scrape enrichment, single lead with custom permutations, or single lead auto-generate
        if (body.scrapeId) {
            // Ownership check: scrape must belong to current user or admin
            const { data: scrape } = await supabase
                .from('scrapes')
                .select('user_id')
                .eq('id', body.scrapeId)
                .single();

            if (!scrape) {
                return corsJsonResponse({ error: 'Scrape not found' }, request, { status: 404 });
            }

            const { data: profileRole } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const isAdmin = profileRole?.role === 'admin';

            if (scrape.user_id !== user.id && !isAdmin) {
                return corsJsonResponse({ error: 'Not authorized to enrich this scrape' }, request, { status: 403 });
            }

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
    console.log(`[ENRICH] Starting enrichment for scrape ${scrapeId}, user ${userId}, credits: ${currentCredits}`);

    // Clear any previous cancellation flag for this scrape so enrichment can proceed
    verificationQueue.clearCancellation(scrapeId);

    // Query all leads for this scrape that haven't been enriched yet
    const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .eq('scrape_id', scrapeId)
        .is('email_validity', null);

    if (error) {
        console.error('[ENRICH] Error fetching leads:', error);
        return corsJsonResponse({ error: 'Failed to fetch leads' }, request, { status: 500 });
    }

    console.log(`[ENRICH] Found ${leads?.length || 0} leads to enrich`);

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

        // Add to verification queue with userId for credit deduction and scrapeId for cancellation
        console.log(`[ENRICH] Adding lead ${lead.id} to verification queue with ${permutations.length} permutations`);
        verificationQueue.add({
            type: 'lead',
            leadId: lead.id,
            scrapeId: scrapeId,
            permutations,
            userId
        });

        queuedCount++;
        console.log(`[ENRICH] Queued lead ${lead.id} with ${permutations.length} permutations for user ${userId}`);
    }

    console.log(`[ENRICH] Enrichment complete: ${queuedCount} queued, ${skippedCount} skipped`);
    console.log(`[ENRICH] Verification queue status: ${verificationQueue.getQueueSize()} items in queue`);

    return corsJsonResponse({
        success: true,
        message: `Enrichment started for ${queuedCount} leads`,
        count: queuedCount,
        skipped: skippedCount,
        credits_available: currentCredits,
        queue_size: verificationQueue.getQueueSize()
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

    // Get lead's scrapeId for cancellation tracking
    const { data: lead } = await supabase
        .from('leads')
        .select('scrape_id')
        .eq('id', leadId)
        .single();

    const scrapeId = lead?.scrape_id;

    // Clear any previous cancellation flag for this scrape so enrichment can proceed
    if (scrapeId) {
        verificationQueue.clearCancellation(scrapeId);
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

    // Add to verification queue with userId and scrapeId for cancellation tracking
    // This ensures the serverless function doesn't exit before processing is done
    await verificationQueue.add({
        type: 'lead',
        leadId,
        scrapeId,
        permutations: validPermutations,
        userId
    }, true);

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

    // Clear any previous cancellation flag for this scrape so enrichment can proceed
    if (lead.scrape_id) {
        verificationQueue.clearCancellation(lead.scrape_id);
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

    // Add to queue with userId and scrapeId for cancellation tracking, wait for completion
    await verificationQueue.add({
        type: 'lead',
        leadId,
        scrapeId: lead.scrape_id,
        permutations,
        userId
    }, true);

    console.log(`Queued lead ${leadId} with ${permutations.length} auto-generated permutations for user ${userId}`);

    return corsJsonResponse({
        success: true,
        message: 'Enrichment queued',
        count: permutations.length,
        credits_available: currentCredits
    }, request);
}
