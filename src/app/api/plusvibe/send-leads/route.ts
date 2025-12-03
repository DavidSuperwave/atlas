import { NextResponse } from 'next/server';

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

export async function POST(request: Request) {
    try {
        const body: RequestBody = await request.json();
        const { apiKey, workspaceId, campaignId, leads } = body;

        // Validate required fields
        if (!apiKey || !workspaceId || !campaignId) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: apiKey, workspaceId, or campaignId' },
                { status: 400 }
            );
        }

        if (!leads || leads.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No leads provided' },
                { status: 400 }
            );
        }

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


