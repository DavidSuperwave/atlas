import { Resend } from 'resend';

// Lazy initialization of Resend client
let resendClient: Resend | null = null;

function getResendClient(): Resend {
    if (!resendClient) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            throw new Error('RESEND_API_KEY environment variable is not set');
        }
        resendClient = new Resend(apiKey);
    }
    return resendClient;
}

// Get sender email from environment - required, no fallback
function getFromEmail(): string {
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
        throw new Error(
            'RESEND_FROM_EMAIL environment variable is required. ' +
            'Set it to an email address using your verified domain (e.g., noreply@atlasv2.com). ' +
            'Verify your domain at https://resend.com/domains'
        );
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail)) {
        throw new Error(
            `RESEND_FROM_EMAIL "${fromEmail}" is not a valid email format. ` +
            'Use format: noreply@yourdomain.com'
        );
    }
    
    return fromEmail;
}

// Export for use in email sending
export const FROM_EMAIL = getFromEmail();

// Helper to send emails
export async function sendEmail({
    to,
    subject,
    html,
    text,
}: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}) {
    try {
        const resend = getResendClient();
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
            text,
        });

        if (error) {
            console.error('Error sending email:', error);
            
            // Provide more helpful error messages for common issues
            if (error.message.includes('domain')) {
                throw new Error(
                    `Domain verification required: ${error.message}. ` +
                    'Verify your domain at https://resend.com/domains'
                );
            }
            if (error.message.includes('rate limit')) {
                throw new Error(
                    `Rate limit exceeded: ${error.message}. ` +
                    'Try again in a few minutes.'
                );
            }
            if (error.message.includes('invalid')) {
                throw new Error(
                    `Invalid email configuration: ${error.message}. ` +
                    'Check your RESEND_FROM_EMAIL setting.'
                );
            }
            
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send email:', error);
        throw error;
    }
}

// Check if email is configured (useful for checking before operations)
export function isEmailConfigured(): boolean {
    try {
        const apiKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL;
        return !!(apiKey && fromEmail);
    } catch {
        return false;
    }
}
