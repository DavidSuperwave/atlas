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

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>You're Invited</title>
</head>
<body style="margin: 0; padding: 0; background-color: #000000; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #000000;">
<tr>
<td align="center" style="padding: 40px 20px;">
<!--[if mso]>
<table border="0" cellpadding="0" cellspacing="0" width="600">
<tr>
<td>
<![endif]-->
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #111111; border-radius: 8px;">
<tr>
<td style="padding: 48px 40px;">

<!-- Logo -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 32px;">
<table border="0" cellpadding="0" cellspacing="0">
<tr>
<td align="center" valign="middle" width="64" height="64" style="background-color: #3b82f6; border-radius: 8px; font-size: 32px; color: #ffffff; font-weight: bold;">
A
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Heading -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 16px; color: #ffffff; font-size: 28px; font-weight: bold; line-height: 1.2;">
You've been accepted to Atlas!
</td>
</tr>
</table>

<!-- Subheading -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 32px; color: #888888; font-size: 16px; line-height: 24px;">
You've been accepted to join Atlas. Please complete the onboarding so we can setup your workspace.
</td>
</tr>
</table>

<!-- CTA Button -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 32px;">
<table border="0" cellpadding="0" cellspacing="0">
<tr>
<td align="center" bgcolor="#3b82f6" style="border-radius: 8px;">
<a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 16px 48px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Complete Onboarding</a>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Expiry Notice -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 24px; color: #666666; font-size: 14px;">
This invitation expires on <span style="color: #888888; font-weight: bold;">${formattedExpiry}</span>
</td>
</tr>
</table>

<!-- Divider -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td style="padding: 24px 0; border-top: 1px solid #333333;"></td>
</tr>
</table>

<!-- Footer -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="color: #555555; font-size: 12px;">
If you didn't expect this invitation, you can safely ignore this email.
</td>
</tr>
</table>

</td>
</tr>
</table>
<!--[if mso]>
</td>
</tr>
</table>
<![endif]-->
</td>
</tr>
</table>
</body>
</html>`;
}

export function generateInviteEmailText({ inviteUrl, expiresAt }: InviteEmailProps): string {
    const formattedExpiry = expiresAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `
You're Invited to Atlas!

You've been invited to join Atlas, our private market intelligence platform.

Click the link below to complete your onboarding and set up your account:
${inviteUrl}

This invitation expires on ${formattedExpiry}.

If you didn't expect this invitation, you can safely ignore this email.
    `.trim();
}

