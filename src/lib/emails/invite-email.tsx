interface InviteEmailProps {
    inviteUrl: string;
    expiresAt: Date;
}

export function generateInviteEmailHtml({ inviteUrl, expiresAt }: InviteEmailProps): string {
    const formattedExpiry = expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're Invited</title>
</head>
<body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" style="max-width: 600px; background-color: #0a0a0a; border-radius: 16px; border: 1px solid #222;">
                    <tr>
                        <td style="padding: 48px 40px;">
                            <!-- Logo/Icon -->
                            <div style="text-align: center; margin-bottom: 32px;">
                                <div style="display: inline-block; width: 64px; height: 64px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); border-radius: 16px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="padding: 16px;">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M2 12h20"/>
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                                    </svg>
                                </div>
                            </div>
                            
                            <!-- Heading -->
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; text-align: center; margin: 0 0 16px 0; letter-spacing: -0.5px;">
                                You're Invited
                            </h1>
                            
                            <!-- Subheading -->
                            <p style="color: #888888; font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 32px 0;">
                                You've been invited to join our private market intelligence platform. Click the button below to create your account.
                            </p>
                            
                            <!-- CTA Button -->
                            <div style="text-align: center; margin-bottom: 32px;">
                                <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 48px; border-radius: 12px; letter-spacing: 0.5px;">
                                    Accept Invitation
                                </a>
                            </div>
                            
                            <!-- Expiry Notice -->
                            <p style="color: #666666; font-size: 14px; text-align: center; margin: 0 0 24px 0;">
                                This invitation expires on <strong style="color: #888888;">${formattedExpiry}</strong>
                            </p>
                            
                            <!-- Divider -->
                            <div style="border-top: 1px solid #222; margin: 24px 0;"></div>
                            
                            <!-- Footer -->
                            <p style="color: #555555; font-size: 12px; text-align: center; margin: 0;">
                                If you didn't expect this invitation, you can safely ignore this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

export function generateInviteEmailText({ inviteUrl, expiresAt }: InviteEmailProps): string {
    const formattedExpiry = expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `
You're Invited!

You've been invited to join our private market intelligence platform.

Click the link below to create your account:
${inviteUrl}

This invitation expires on ${formattedExpiry}.

If you didn't expect this invitation, you can safely ignore this email.
    `.trim();
}

