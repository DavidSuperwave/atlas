export interface VerificationResult {
    email: string;
    user: string;
    domain: string;
    mx: string;
    code: string;
    message: string;
    connections: number;
    status: 'valid' | 'catchall' | 'invalid' | 'unknown';
}

export async function verifyEmail(email: string): Promise<VerificationResult> {
    try {
        // Add a small delay to avoid rate limits if calling in loop (handled by caller usually, but good practice)
        const response = await fetch(`https://mailtester.ninja/api/?email=${email}`);

        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Map API response to our status
        // Based on user input: "code": "ok", "message": "Accepted"
        let status: VerificationResult['status'] = 'unknown';

        if (data.code === 'ok') {
            status = 'valid';
        } else if (data.message?.toLowerCase().includes('catch') || data.code === 'catch_all') {
            // Assuming API might return catch_all code or message, adjusting based on typical APIs
            status = 'catchall';
        } else {
            status = 'invalid';
        }

        return { ...data, status };
    } catch (error) {
        console.error(`Error verifying ${email}:`, error);
        return {
            email,
            user: '',
            domain: '',
            mx: '',
            code: 'error',
            message: error instanceof Error ? error.message : 'Verification failed',
            connections: 0,
            status: 'unknown'
        };
    }
}
