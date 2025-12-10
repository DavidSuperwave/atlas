import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// Smartlead API - https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation
const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';

interface SmartleadLead {
    email: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    company_name?: string;
    website?: string;
    location?: string;
    custom_fields?: Record<string, string>;
    linkedin_profile?: string;
    company_url?: string;
}

interface RequestBody {
    apiKey: string;
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

        const { apiKey, campaignId, leads } = body as RequestBody;

        // Map leads to Smartlead format and send individually
        // Smartlead API adds leads one at a time to campaigns
        const results: { success: number; failed: number; errors: string[] } = {
            success: 0,
            failed: 0,
            errors: [],
        };

        // Process leads in batches to respect rate limit (10 req/2 sec)
        const BATCH_SIZE = 10;
        const BATCH_DELAY = 2100; // 2.1 seconds between batches

        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
            const batch = leads.slice(i, i + BATCH_SIZE);
            
            // Process batch concurrently
            const batchPromises = batch.map(async (lead) => {
                const smartleadLead: SmartleadLead = {
                    email: lead.email,
                    first_name: lead.first_name || undefined,
                    last_name: lead.last_name || undefined,
                    phone_number: lead.phone_numbers?.[0] || undefined,
                    company_name: lead.company_name || undefined,
                    website: lead.website || undefined,
                    linkedin_profile: lead.linkedin_url || undefined,
                    company_url: lead.website || undefined,
                };

                try {
                    const response = await fetch(
                        `${SMARTLEAD_API_BASE}/campaigns/${campaignId}/leads?api_key=${apiKey}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(smartleadLead),
                        }
                    );

                    if (response.ok) {
                        return { success: true, email: lead.email };
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        return { 
                            success: false, 
                            email: lead.email, 
                            error: errorData.error || `HTTP ${response.status}` 
                        };
                    }
                } catch (error) {
                    return { 
                        success: false, 
                        email: lead.email, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            for (const result of batchResults) {
                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                    results.errors.push(`${result.email}: ${result.error}`);
                }
            }

            // Wait before next batch if there are more leads
            if (i + BATCH_SIZE < leads.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        if (results.failed === leads.length) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: 'Failed to send all leads to Smartlead',
                    details: results.errors.slice(0, 10) // First 10 errors
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Successfully sent ${results.success} leads to Smartlead${results.failed > 0 ? ` (${results.failed} failed)` : ''}`,
            data: {
                total: leads.length,
                success: results.success,
                failed: results.failed,
                errors: results.errors.slice(0, 10),
            },
        });

    } catch (error) {
        console.error('Error sending leads to Smartlead:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

