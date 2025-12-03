interface WelcomeEmailProps {
    userName?: string;
    loginUrl: string;
}

export function generateWelcomeEmailHtml({ userName, loginUrl }: WelcomeEmailProps): string {
    const greeting = userName ? `Welcome, ${userName}!` : 'Welcome!';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome</title>
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
                                <div style="display: inline-block; width: 64px; height: 64px; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); border-radius: 16px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="padding: 16px;">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </div>
                            </div>
                            
                            <!-- Heading -->
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; text-align: center; margin: 0 0 16px 0; letter-spacing: -0.5px;">
                                ${greeting}
                            </h1>
                            
                            <!-- Subheading -->
                            <p style="color: #888888; font-size: 16px; line-height: 24px; text-align: center; margin: 0 0 24px 0;">
                                Your account has been created successfully. You now have access to our private market intelligence platform.
                            </p>
                            
                            <!-- Features List -->
                            <div style="background-color: #111; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                                <p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 0 0 16px 0;">
                                    What you can do:
                                </p>
                                <ul style="color: #888888; font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
                                    <li style="margin-bottom: 8px;">Access proprietary market data</li>
                                    <li style="margin-bottom: 8px;">Run intelligent searches</li>
                                    <li style="margin-bottom: 8px;">Export and enrich leads</li>
                                    <li>Verify email addresses</li>
                                </ul>
                            </div>
                            
                            <!-- CTA Button -->
                            <div style="text-align: center; margin-bottom: 32px;">
                                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 48px; border-radius: 12px; letter-spacing: 0.5px;">
                                    Go to Dashboard
                                </a>
                            </div>
                            
                            <!-- Divider -->
                            <div style="border-top: 1px solid #222; margin: 24px 0;"></div>
                            
                            <!-- Footer -->
                            <p style="color: #555555; font-size: 12px; text-align: center; margin: 0;">
                                Need help? Contact our support team.
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

export function generateWelcomeEmailText({ userName, loginUrl }: WelcomeEmailProps): string {
    const greeting = userName ? `Welcome, ${userName}!` : 'Welcome!';

    return `
${greeting}

Your account has been created successfully. You now have access to our private market intelligence platform.

What you can do:
- Access proprietary market data
- Run intelligent searches
- Export and enrich leads
- Verify email addresses

Go to your dashboard: ${loginUrl}

Need help? Contact our support team.
    `.trim();
}

