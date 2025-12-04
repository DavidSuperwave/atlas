import { NextResponse } from 'next/server';

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

export async function POST(request: Request) {
    try {
        const body: RequestBody = await request.json();
        const { apiKey, campaignId, leads } = body;

        // Validate required fields
        if (!apiKey || !campaignId) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: apiKey or campaignId' },
                { status: 400 }
            );
        }

        if (!leads || leads.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No leads provided' },
                { status: 400 }
            );
        }

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

