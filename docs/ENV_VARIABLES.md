# Environment Variables Guide

Complete reference for all environment variables used in the production setup.

## Quick Start

Copy this template to `.env.local` (development) or `.env.production` (production):

```bash
# =============================================================================
# REQUIRED - Supabase
# =============================================================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# =============================================================================
# REQUIRED - Scraper Mode
# =============================================================================
# Options: 'local', 'dolphin', or 'gologin' (recommended)
SCRAPER_MODE=gologin

# =============================================================================
# REQUIRED (when SCRAPER_MODE=gologin) - GoLogin (RECOMMENDED)
# =============================================================================
GOLOGIN_API_TOKEN=your-api-token-from-gologin-dashboard
GOLOGIN_PROFILE_ID=your-profile-id

# =============================================================================
# REQUIRED (when SCRAPER_MODE=dolphin) - Dolphin Anty (Legacy)
# =============================================================================
DOLPHIN_ANTY_API_URL=http://localhost:3001
DOLPHIN_ANTY_PROFILE_ID=your-profile-id-here

# =============================================================================
# OPTIONAL - Hybrid Deployment (Vercel + Railway)
# =============================================================================
# Set this on Vercel to route scrape/enrich requests to Railway
NEXT_PUBLIC_RAILWAY_API_URL=https://your-app.railway.app

# Set these on Railway for CORS
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app

# =============================================================================
# REQUIRED - Email Verification (MailTester Ninja)
# =============================================================================
# Single key (minimum requirement)
MAILTESTER_API_KEY=your-primary-api-key

# Multiple keys for scaling (optional)
MAILTESTER_API_KEY_1=your-first-key
MAILTESTER_API_KEY_2=your-second-key
MAILTESTER_API_KEY_3=your-third-key

# Or as JSON array:
# MAILTESTER_API_KEYS='["key1","key2","key3"]'

# =============================================================================
# REQUIRED - Email Service (Resend) - For Invite Emails
# =============================================================================
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@atlasv2.com
```

---

## All Variables Reference

### Supabase Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |

### Scraper Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCRAPER_MODE` | No | `local` | `local`, `dolphin`, or `gologin` (recommended) |
| `GOLOGIN_API_TOKEN` | When gologin | - | API token from GoLogin dashboard |
| `GOLOGIN_PROFILE_ID` | When gologin | - | Profile ID from GoLogin |
| `DOLPHIN_ANTY_API_URL` | When dolphin | `http://localhost:3001` | Dolphin Anty API URL |
| `DOLPHIN_ANTY_PROFILE_ID` | When dolphin | - | Profile ID from Dolphin Anty |

### Deployment Configuration (Hybrid Architecture)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_RAILWAY_API_URL` | No | - | Railway backend URL for long-running APIs |
| `ALLOWED_ORIGINS` | No | localhost | Comma-separated CORS allowed origins |
| `VERCEL_URL` | Auto | - | Set automatically by Vercel |

### Email Verification API Keys

| Variable | Required | Description |
|----------|----------|-------------|
| `MAILTESTER_API_KEY` | Yes* | Primary API key (backward compatible) |
| `MAILTESTER_API_KEY_1` | No | First additional key for scaling |
| `MAILTESTER_API_KEY_2` | No | Second additional key |
| `MAILTESTER_API_KEY_N` | No | Up to 20 numbered keys |
| `MAILTESTER_API_KEYS` | No | JSON array of keys (alternative format) |

*At least one API key is required.

### Email Service (Resend) - For Invite Emails

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes* | Resend API key from dashboard |
| `RESEND_FROM_EMAIL` | Yes* | Sender email using your verified domain |

*Required if using the invite system to send emails.

**Example:**
```bash
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@atlasv2.com
```

**Setup Steps:**
1. Create account at [resend.com](https://resend.com)
2. Go to [Domains](https://resend.com/domains) and add your domain
3. Add the required DNS records (MX, TXT, DKIM)
4. Wait for domain verification (usually 5-10 minutes)
5. Get API key from [API Keys](https://resend.com/api-keys)
6. Set `RESEND_FROM_EMAIL` to an address using your verified domain

### Application Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` or `production` |
| `NEXT_PUBLIC_APP_URL` | No | - | Public URL of your app |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

### Redis Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |

### Security

| Variable | Required | Description |
|----------|----------|-------------|
| `SCRAPER_API_KEY` | No | API key for authenticating service-to-service requests |

---

## Scaling Guide

### API Key Capacity

Each MailTester API key provides:
- **170 emails per 30 seconds**
- **500,000 emails per day**

Total capacity with multiple keys:

| Keys | Emails/minute | Emails/hour | Emails/day |
|------|---------------|-------------|------------|
| 1 | 340 | 20,400 | 500,000 |
| 2 | 680 | 40,800 | 1,000,000 |
| 3 | 1,020 | 61,200 | 1,500,000 |
| 5 | 1,700 | 102,000 | 2,500,000 |
| 10 | 3,400 | 204,000 | 5,000,000 |

### Adding Keys

**Method 1: Numbered keys**
```bash
MAILTESTER_API_KEY_1=xxx
MAILTESTER_API_KEY_2=yyy
MAILTESTER_API_KEY_3=zzz
```

**Method 2: JSON array**
```bash
MAILTESTER_API_KEYS='["xxx","yyy","zzz"]'
```

**Method 3: JSON with names (for tracking)**
```bash
MAILTESTER_API_KEYS='[{"key":"xxx","name":"primary"},{"key":"yyy","name":"secondary"}]'
```

---

## Scraper Modes

### GoLogin Mode (`SCRAPER_MODE=gologin`) - RECOMMENDED

Uses GoLogin cloud-based anti-detect browser:
- No local installation required
- Cloud-based - works with Vercel/Railway
- Web dashboard for team access
- API-first design for automation
- Easy proxy management

```bash
SCRAPER_MODE=gologin
GOLOGIN_API_TOKEN=your-token-from-dashboard
GOLOGIN_PROFILE_ID=your-profile-id
```

**Setup Steps:**
1. Create account at [gologin.com](https://gologin.com)
2. Create a browser profile with Apollo logged in
3. Get API token from Settings → API
4. Copy Profile ID from your profile
5. Set environment variables

### Local Mode (`SCRAPER_MODE=local`)

Uses Chrome browser on the same machine:
- Requires Chrome with remote debugging enabled
- Default port: 9222
- Good for development only

```bash
SCRAPER_MODE=local
```

### Dolphin Mode (`SCRAPER_MODE=dolphin`) - Legacy

Uses Dolphin Anty anti-detect browser:
- Requires local Dolphin Anty installation
- Requires VNC setup on VPS
- Complex team access
- Better fingerprint management

```bash
SCRAPER_MODE=dolphin
DOLPHIN_ANTY_API_URL=http://localhost:3001
DOLPHIN_ANTY_PROFILE_ID=abc123
```

**Note:** GoLogin is recommended over Dolphin Anty for easier setup and team collaboration.

---

## Development vs Production

### Development (.env.local)

```bash
NODE_ENV=development
SCRAPER_MODE=local
MAILTESTER_API_KEY=your-test-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Production - Single Platform (Railway/Render)

```bash
NODE_ENV=production
SCRAPER_MODE=gologin
GOLOGIN_API_TOKEN=your-api-token
GOLOGIN_PROFILE_ID=your-profile-id

# Multiple keys for scaling
MAILTESTER_API_KEY_1=key1
MAILTESTER_API_KEY_2=key2
MAILTESTER_API_KEY_3=key3

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Production - Hybrid (Vercel + Railway)

**On Vercel (Frontend):**
```bash
NODE_ENV=production
NEXT_PUBLIC_RAILWAY_API_URL=https://your-app.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**On Railway (Backend):**
```bash
NODE_ENV=production
SCRAPER_MODE=gologin
GOLOGIN_API_TOKEN=your-api-token
GOLOGIN_PROFILE_ID=your-profile-id
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app

# Multiple keys for scaling
MAILTESTER_API_KEY_1=key1
MAILTESTER_API_KEY_2=key2
MAILTESTER_API_KEY_3=key3

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Security Best Practices

1. **Never commit `.env` files** to git
2. **Use strong API keys** - generate with `openssl rand -hex 32`
3. **Rotate keys regularly** if compromised
4. **Limit access** to production environment variables
5. **Use Vercel/server secrets** for production deployments

---

## Troubleshooting

### "No API keys configured"

Ensure at least one of these is set:
- `MAILTESTER_API_KEY`
- `MAILTESTER_API_KEY_1`
- `MAILTESTER_API_KEYS`

### "GoLogin API is not available"

1. Check your API token is valid
2. Verify `GOLOGIN_API_TOKEN` is set correctly
3. Test: `curl -H "Authorization: Bearer YOUR_TOKEN" https://api.gologin.com/browser/v2`
4. Check your GoLogin subscription is active

### "GoLogin Profile not found"

1. Log in to GoLogin dashboard
2. Copy the correct Profile ID
3. Ensure the profile exists and is not deleted
4. Update `GOLOGIN_PROFILE_ID`

### "Dolphin Anty not available" (Legacy)

1. Check Dolphin Anty is running
2. Verify `DOLPHIN_ANTY_API_URL` is correct
3. Test: `curl http://localhost:3001/browser_profiles`

### "CORS error when calling Railway"

1. Verify `ALLOWED_ORIGINS` on Railway includes your Vercel URL
2. Check NEXT_PUBLIC_RAILWAY_API_URL is set correctly on Vercel
3. Ensure the Railway app is running

### Environment variables not loading

1. Restart the application after changes
2. Verify file is named correctly (`.env.local` or `.env.production`)
3. Check for syntax errors in the file
4. For Vercel/Railway, redeploy after updating environment variables

### "The domain is not verified" (Resend)

This error occurs when `RESEND_FROM_EMAIL` uses a domain that isn't verified in Resend:

1. Go to [Resend Domains](https://resend.com/domains)
2. Add your domain if not already added
3. Add the required DNS records (MX, TXT, DKIM) to your domain
4. Wait for verification (usually 5-10 minutes)
5. Ensure `RESEND_FROM_EMAIL` uses an email address with your verified domain
   - Example: `noreply@atlasv2.com` (not `noreply@example.com`)

### "RESEND_FROM_EMAIL environment variable is required"

1. Add `RESEND_FROM_EMAIL` to your environment variables
2. Use your verified domain: `RESEND_FROM_EMAIL=noreply@yourdomain.com`
3. For Vercel: Add it in Project Settings → Environment Variables
4. For local dev: Add to `.env.local`
5. Redeploy after adding the variable


