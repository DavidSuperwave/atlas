import { NextResponse } from 'next/server';

// Instantly API V2 - https://developer.instantly.ai/
const INSTANTLY_API_URL = 'https://api.instantly.ai/api/v2/leads';

interface InstantlyLead {
    email: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    website?: string;
    linkedin_url?: string;
    phone?: string;
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

        // Map leads to Instantly format
        const instantlyLeads: InstantlyLead[] = leads.map(lead => ({
            email: lead.email,
            first_name: lead.first_name || undefined,
            last_name: lead.last_name || undefined,
            company_name: lead.company_name || undefined,
            website: lead.website || undefined,
            linkedin_url: lead.linkedin_url || undefined,
            phone: lead.phone_numbers?.[0] || undefined,
        }));

        // Send to Instantly API V2
        // Using the lead import endpoint
        const response = await fetch(INSTANTLY_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                campaign_id: campaignId,
                skip_if_in_workspace: false,
                leads: instantlyLeads,
            }),
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error('Instantly API error:', responseData);
            return NextResponse.json(
                { 
                    success: false, 
                    error: responseData.message || responseData.error || 'Failed to send leads to Instantly',
                    details: responseData 
                },
                { status: response.status }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Successfully sent ${instantlyLeads.length} leads to Instantly`,
            data: responseData,
        });

    } catch (error) {
        console.error('Error sending leads to Instantly:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

