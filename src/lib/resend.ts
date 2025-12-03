import { Resend } from 'resend';

// Initialize Resend client
export const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@example.com';

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
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
            text,
        });

        if (error) {
            console.error('Error sending email:', error);
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send email:', error);
        throw error;
    }
}

