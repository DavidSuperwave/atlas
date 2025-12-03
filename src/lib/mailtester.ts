export type MailTesterResponse = {
    email: string;
    user: string;
    domain: string;
    mx: string;
    code: 'ok' | 'ko' | 'mb';
    message: string;
    connections: number;
};

export async function enrichLead(email: string, apiKey: string): Promise<MailTesterResponse> {
    if (!email || !apiKey) {
        throw new Error('Email and API Key are required');
    }

    const params = new URLSearchParams({
        email,
        key: apiKey,
    });

    const response = await fetch(`https://happy.mailtester.ninja/ninja?${params.toString()}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`MailTester API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data as MailTesterResponse;
}
