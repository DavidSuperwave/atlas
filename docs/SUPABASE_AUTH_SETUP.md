# Supabase Auth Configuration for Production

## Required Configuration Steps

### 1. Configure Redirect URLs in Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication** → **URL Configuration**
4. Set the following:

**Site URL:**
```
https://atlasv2.com
```

**Redirect URLs** (add all of these):
```
https://atlasv2.com/auth/callback
https://atlasv2.com/**
http://localhost:3000/auth/callback
http://localhost:3000/**
```

### 2. Disable Email Confirmation (Recommended for Invite-Only Flow)

Since you're using an invite-only system with Resend for emails:

1. Go to **Authentication** → **Settings**
2. Under **Email Auth**, disable **"Confirm email"**
3. This allows users to sign in immediately after account creation via invite

**Alternative:** If you want to keep email confirmation, configure Resend SMTP:
1. Go to **Authentication** → **Email Templates** → **SMTP Settings**
2. Configure:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (TLS)
   - Username: `resend`
   - Password: Your Resend API key
   - From: Your verified Resend email (e.g., `noreply@atlasv2.com`)

### 3. Environment Variables

Make sure you have these set in your production environment:

```env
NEXT_PUBLIC_APP_URL=https://atlasv2.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=your-resend-key
RESEND_FROM_EMAIL=noreply@atlasv2.com
```

### 4. Resend Domain Verification

1. Go to [Resend Dashboard](https://resend.com/domains)
2. Add your domain `atlasv2.com`
3. Add the required DNS records (MX, TXT, DKIM)
4. Wait for verification (usually 5-10 minutes)
5. Use an email from your verified domain for `RESEND_FROM_EMAIL`

## Testing

After configuration:
1. Test invite flow: Send an invite and verify the email link works
2. Test onboarding: Complete onboarding and verify account creation
3. Test login: Verify users can log in immediately after onboarding

## Troubleshooting

**Issue:** "Redirect URL not allowed"
- **Solution:** Add the exact URL to Supabase redirect URLs list

**Issue:** "Email confirmation required"
- **Solution:** Disable email confirmation in Supabase Auth settings OR configure Resend SMTP

**Issue:** "Invalid invite token"
- **Solution:** Check that `NEXT_PUBLIC_APP_URL` is set correctly in production

