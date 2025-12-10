import { apiKeyPool } from './api-key-pool';

export type MailTesterResponse = {
    email: string;
    user: string;
    domain: string;
    mx: string;
    code: 'ok' | 'ko' | 'mb';
    message: string;
    connections: number;
};

const MAX_RETRIES = 2;

export async function enrichLead(email: string, apiKey: string, retries = 0): Promise<MailTesterResponse> {
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

    if (response.status === 429) {
        // Rate limited - attempt to retry with a different key if available
        if (retries < MAX_RETRIES && apiKeyPool.hasKeys()) {
            const nextKey = await apiKeyPool.getAvailableKey();
            // Avoid immediate reuse of the same key; if same, just fail
            if (nextKey && nextKey !== apiKey) {
                return enrichLead(email, nextKey, retries + 1);
            }
        }
        throw new Error('MailTester rate limit exceeded. Please try again later.');
    }

    if (!response.ok) {
        throw new Error(`MailTester API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as MailTesterResponse;
}
