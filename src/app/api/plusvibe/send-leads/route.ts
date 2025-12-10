import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const PLUSVIBE_API_URL = 'https://api.plusvibe.ai/api/v1/lead/add';

interface PlusVibeLead {
    email: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    company_website?: string;
    linkedin_person_url?: string;
    linkedin_company_url?: string;
    phone_number?: string;
}

interface RequestBody {
    apiKey: string;
    workspaceId: string;
    campaignId: string;
    leads: {
        email: string;
        first_name?: string;
        last_name?: string;
        company_name?: string;
        website?: string;
        linkedin_url?: string;
        company_linkedin?: string;
        phone_numbers?: string[];
    }[];
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLead(lead: RequestBody['leads'][number]): string[] {
    const errors: string[] = [];

    if (!lead.email || !emailRegex.test(lead.email) || lead.email.length > 255) {
        errors.push(`Invalid email: ${lead.email ?? 'missing'}`);
    }
    if (lead.first_name && lead.first_name.length > 100) errors.push('first_name too long');
    if (lead.last_name && lead.last_name.length > 100) errors.push('last_name too long');
    if (lead.company_name && lead.company_name.length > 200) errors.push('company_name too long');
    if (lead.website && lead.website.length > 500) errors.push('website too long');
    if (lead.linkedin_url && lead.linkedin_url.length > 500) errors.push('linkedin_url too long');
    if (lead.company_linkedin && lead.company_linkedin.length > 500) errors.push('company_linkedin too long');
    if (lead.phone_numbers && lead.phone_numbers.some(num => num.length > 20)) {
        errors.push('phone_numbers entries must be <= 20 chars');
    }
    if (lead.phone_numbers && lead.phone_numbers.length > 5) {
        errors.push('too many phone_numbers (max 5)');
    }
    return errors;
}

function validateRequest(body: Partial<RequestBody>): { valid: boolean; errors: string[]; leads: RequestBody['leads'] } {
    const errors: string[] = [];

    if (!body.apiKey || body.apiKey.length < 10 || body.apiKey.length > 200) {
        errors.push('apiKey is required and must be 10-200 chars');
    }
    if (!body.workspaceId || body.workspaceId.length < 1 || body.workspaceId.length > 200) {
        errors.push('workspaceId is required and must be <= 200 chars');
    }
    if (!body.campaignId || body.campaignId.length < 1 || body.campaignId.length > 200) {
        errors.push('campaignId is required and must be <= 200 chars');
    }
    if (!body.leads || !Array.isArray(body.leads) || body.leads.length === 0) {
        errors.push('leads must be a non-empty array');
    } else if (body.leads.length > 1000) {
        errors.push('leads array too large (max 1000)');
    }

    if (body.leads) {
        body.leads.forEach((lead, idx) => {
            const leadErrors = validateLead(lead);
            leadErrors.forEach(err => errors.push(`lead[${idx}]: ${err}`));
        });
    }

    return { valid: errors.length === 0, errors, leads: (body.leads as RequestBody['leads']) || [] };
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimit = checkRateLimit(user.id, RATE_LIMITS.EXPORT_LEADS);
        if (rateLimit.limited) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Rate limit exceeded',
                    retryAfter: rateLimit.resetInSeconds,
                },
                {
                    status: 429,
                    headers: { 'Retry-After': rateLimit.resetInSeconds.toString() },
                }
            );
        }

        const body: Partial<RequestBody> = await request.json();
        const validation = validateRequest(body);
        if (!validation.valid) {
            return NextResponse.json(
                { success: false, error: 'Invalid request data', details: validation.errors },
                { status: 400 }
            );
        }

        const { apiKey, workspaceId, campaignId, leads } = body as RequestBody;

        // Map leads to PlusVibe format
        const plusVibeLeads: PlusVibeLead[] = leads.map(lead => ({
            email: lead.email,
            first_name: lead.first_name || undefined,
            last_name: lead.last_name || undefined,
            company_name: lead.company_name || undefined,
            company_website: lead.website || undefined,
            linkedin_person_url: lead.linkedin_url || undefined,
            linkedin_company_url: lead.company_linkedin || undefined,
            phone_number: lead.phone_numbers?.[0] || undefined,
        }));

        // Send to PlusVibe API
        const response = await fetch(PLUSVIBE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify({
                workspace_id: workspaceId,
                campaign_id: campaignId,
                skip_if_in_workspace: false,
                resume_camp_if_completed: false,
                leads: plusVibeLeads,
                is_overwrite: false,
            }),
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error('PlusVibe API error:', responseData);
            return NextResponse.json(
                { 
                    success: false, 
                    error: responseData.message || responseData.error || 'Failed to send leads to PlusVibe',
                    details: responseData 
                },
                { status: response.status }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Successfully sent ${plusVibeLeads.length} leads to PlusVibe`,
            data: responseData,
        });

    } catch (error) {
        console.error('Error sending leads to PlusVibe:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}


