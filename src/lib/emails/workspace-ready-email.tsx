interface WorkspaceReadyEmailProps {
    userName?: string | null;
    loginUrl: string;
}

export function generateWorkspaceReadyEmailHtml({ userName, loginUrl }: WorkspaceReadyEmailProps): string {
    const greeting = userName ? `Hi ${userName},` : 'Hi there,';

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Your Workspace is Ready</title>
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
<td align="center" valign="middle" width="64" height="64" style="background-color: #10b981; border-radius: 8px; font-size: 32px; color: #ffffff;">
&#10003;
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
Your Workspace is Ready!
</td>
</tr>
</table>

<!-- Greeting -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 24px; color: #888888; font-size: 16px; line-height: 24px;">
${greeting}
</td>
</tr>
</table>

<!-- Message -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 32px; color: #888888; font-size: 16px; line-height: 24px;">
Great news! Your Atlas workspace has been set up and approved. You can now log in and start using the platform.
</td>
</tr>
</table>

<!-- What you can do box -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td style="padding: 24px; background-color: #1a1a1a; border-radius: 8px; margin-bottom: 32px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td style="color: #ffffff; font-size: 14px; font-weight: 600; padding-bottom: 12px;">
What you can do:
</td>
</tr>
<tr>
<td style="color: #888888; font-size: 14px; line-height: 24px;">
&#8226; Access proprietary market data<br/>
&#8226; Run intelligent searches<br/>
&#8226; Export and enrich leads<br/>
&#8226; Verify email addresses
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- Spacer -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td style="padding: 16px 0;"></td>
</tr>
</table>

<!-- CTA Button -->
<table border="0" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding-bottom: 32px;">
<table border="0" cellpadding="0" cellspacing="0">
<tr>
<td align="center" bgcolor="#10b981" style="border-radius: 8px;">
<a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 16px 48px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Go to Login</a>
</td>
</tr>
</table>
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
Need help? Contact our support team.
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

export function generateWorkspaceReadyEmailText({ userName, loginUrl }: WorkspaceReadyEmailProps): string {
    const greeting = userName ? `Hi ${userName},` : 'Hi there,';

    return `
Your Workspace is Ready!

${greeting}

Great news! Your Atlas workspace has been set up and approved. You can now log in and start using the platform.

What you can do:
- Access proprietary market data
- Run intelligent searches
- Export and enrich leads
- Verify email addresses

Log in here: ${loginUrl}

Need help? Contact our support team.
    `.trim();
}

