# Vercel + Railway Hybrid Deployment Guide

Complete setup guide for deploying the frontend on Vercel and backend API on Railway.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│   Vercel        │         │   Railway        │
│                 │         │                  │
│  Next.js App    │────────▶│  Backend API     │
│  (Frontend)     │  HTTP   │                  │
│                 │         │  - /api/scrape  │
│  - UI Pages     │         │  - /api/enrich   │
│  - Auth         │         │  - Queue Worker  │
│  - Quick APIs   │         │  - GoLogin       │
└─────────────────┘         └──────────────────┘
```

**What Runs Where:**
- **Vercel**: All UI pages, authentication, quick database queries
- **Railway**: Scraping API, enrichment API, queue processing, long-running operations

---

## Prerequisites

Before starting, ensure you have:
- [ ] GitHub account and repository
- [ ] Vercel account (free tier available)
- [ ] Railway account (sign up at railway.app)
- [ ] GoLogin account and API credentials
- [ ] Supabase project (already set up)
- [ ] MailTester API keys

---

## Part 1: GoLogin Setup

### Step 1.1: Create GoLogin Account

1. Go to [gologin.com](https://gologin.com)
2. Sign up for an account
3. Choose a plan (Starter plan works, ~$24/month)

### Step 1.2: Get API Token

1. Go to GoLogin dashboard
2. Navigate to **Settings** → **API**
3. Copy your **API Token**
4. Save it securely (you'll need it for Railway)

### Step 1.3: Create Browser Profile

1. In GoLogin dashboard, click **"Create Profile"**
2. Name it: "Apollo Scraper"
3. Configure settings:
   - **OS**: Windows or macOS (your choice)
   - **Browser**: Chrome
   - **Proxy**: Add your residential proxy if you have one
4. Click **"Create"**

### Step 1.4: Login to Apollo

1. Click **"Start"** on your profile
2. A browser window opens (via GoLogin web dashboard)
3. Navigate to `https://app.apollo.io`
4. Login with your Apollo credentials
5. Complete any 2FA verification
6. **Keep the browser open** - this saves the session

### Step 1.5: Get Profile ID

1. In GoLogin dashboard, click on your profile
2. The Profile ID is shown in the URL or profile details
3. Copy this ID (format: `abc123def456`)
4. Save it for Railway configuration

---

## Part 2: Railway Backend Setup

### Step 2.1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Verify your email

### Step 2.2: Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository
4. Railway will auto-detect Next.js

### Step 2.3: Configure Environment Variables

In Railway dashboard, go to **Variables** tab and add:

```bash
# Supabase (same as your Vercel setup)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Supabase Service Role (for server-side operations)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Scraper Mode
SCRAPER_MODE=gologin

# GoLogin
GOLOGIN_API_TOKEN=your-gologin-api-token
GOLOGIN_PROFILE_ID=your-profile-id

# MailTester API Keys
MAILTESTER_API_KEY=your-primary-key
MAILTESTER_API_KEY_1=key1 (optional, for scaling)
MAILTESTER_API_KEY_2=key2 (optional, for scaling)

# App URL (will be set automatically by Railway)
NEXT_PUBLIC_APP_URL=https://your-app.railway.app

# Node Environment
NODE_ENV=production
```

### Step 2.4: Configure Build Settings

Railway should auto-detect Next.js, but verify:

1. Go to **Settings** → **Build**
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start`
4. **Root Directory**: `/` (default)

### Step 2.5: Deploy

1. Railway will automatically deploy on every push to your main branch
2. Wait for build to complete (~2-3 minutes)
3. Railway will provide a URL like: `https://your-app.railway.app`
4. **Copy this URL** - you'll need it for Vercel

### Step 2.6: Get Railway URL

1. In Railway dashboard, go to your service
2. Click on the generated domain
3. Copy the full URL (e.g., `https://web-app-production.up.railway.app`)
4. Save this as `RAILWAY_API_URL`

---

## Part 3: Vercel Frontend Setup

### Step 3.1: Create Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Import your repository

### Step 3.2: Configure Project

1. Vercel will auto-detect Next.js
2. Click **"Deploy"** (don't worry about env vars yet)

### Step 3.3: Add Environment Variables

After initial deploy, go to **Settings** → **Environment Variables**:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Railway API URL (for backend API calls)
NEXT_PUBLIC_RAILWAY_API_URL=https://your-app.railway.app

# App URL (Vercel will set this automatically)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Step 3.4: Redeploy

1. Go to **Deployments** tab
2. Click **"Redeploy"** to apply environment variables
3. Wait for deployment (~1-2 minutes)

---

## Part 4: Code Changes Required

### Change 1: Create API Client Utility

Create `src/lib/api-client.ts`:

```typescript
/**
 * API Client - Routes requests to appropriate backend
 * 
 * - Quick APIs (auth, DB queries) → Vercel (same origin)
 * - Long-running APIs (scrape, enrich) → Railway
 */

const RAILWAY_API_URL = process.env.NEXT_PUBLIC_RAILWAY_API_URL;

// APIs that should go to Railway (long-running)
const RAILWAY_APIS = [
  '/api/scrape',
  '/api/enrich',
  '/api/scrape/gologin-status',
  '/api/scrape/dolphin-status',
];

/**
 * Get the base URL for an API endpoint
 */
export function getApiUrl(endpoint: string): string {
  // If Railway URL is not set, use same origin (fallback)
  if (!RAILWAY_API_URL) {
    return endpoint;
  }

  // Check if this endpoint should go to Railway
  const shouldUseRailway = RAILWAY_APIS.some(api => endpoint.startsWith(api));

  if (shouldUseRailway) {
    return `${RAILWAY_API_URL}${endpoint}`;
  }

  // Use same origin for quick APIs
  return endpoint;
}

/**
 * Fetch wrapper that routes to correct backend
 */
export async function apiFetch(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const url = getApiUrl(endpoint);
  return fetch(url, options);
}
```

### Change 2: Update Frontend API Calls

Update all scraping/enrichment API calls to use the new client:

**File: `src/app/page.tsx`**
```typescript
// Replace:
const res = await fetch('/api/scrape', { ... });

// With:
import { apiFetch } from '@/lib/api-client';
const res = await apiFetch('/api/scrape', { ... });
```

**File: `src/app/scrapes/[id]/page.tsx`**
```typescript
// Replace:
const res = await fetch('/api/enrich', { ... });

// With:
import { apiFetch } from '@/lib/api-client';
const res = await apiFetch('/api/enrich', { ... });
```

### Change 3: Add CORS to Railway (if needed)

If you get CORS errors, add to Railway API routes:

**File: `src/app/api/scrape/route.ts`** (add at top of POST function):
```typescript
// Add CORS headers
const headers = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle preflight
if (request.method === 'OPTIONS') {
  return new NextResponse(null, { status: 200, headers });
}
```

Do the same for `/api/enrich/route.ts`.

### Change 4: Update Environment Variable Documentation

Update `docs/ENV_VARIABLES.md` with new variables.

---

## Part 5: Testing

### Step 5.1: Test Frontend

1. Visit your Vercel URL
2. Login
3. Verify UI loads correctly

### Step 5.2: Test Scraping

1. Go to home page
2. Enter an Apollo URL
3. Click "Start Scrape"
4. Check Railway logs to see scraping progress
5. Verify leads appear in database

### Step 5.3: Test Enrichment

1. Go to a scrape details page
2. Click "Enrich All"
3. Check Railway logs for queue processing
4. Verify emails are being verified

### Step 5.4: Check Logs

**Vercel Logs:**
- Go to Vercel dashboard → Deployments → Click deployment → Logs

**Railway Logs:**
- Go to Railway dashboard → Your service → Logs tab

---

## Part 6: Monitoring & Maintenance

### Railway Monitoring

1. **Logs**: Real-time logs in Railway dashboard
2. **Metrics**: CPU, Memory usage
3. **Deployments**: Auto-deploys on Git push

### Vercel Monitoring

1. **Analytics**: Built-in (Pro plan)
2. **Logs**: Function logs in dashboard
3. **Deployments**: Auto-deploys on Git push

### Updating Code

1. Push to GitHub main branch
2. Both Vercel and Railway auto-deploy
3. No manual deployment needed!

---

## Troubleshooting

### CORS Errors

**Symptom**: `Access-Control-Allow-Origin` errors

**Solution**: 
1. Add CORS headers to Railway API routes (see Change 3)
2. Verify `NEXT_PUBLIC_RAILWAY_API_URL` is set in Vercel
3. Check Railway URL is correct

### Scraping Not Working

**Symptom**: Scrapes fail or timeout

**Solution**:
1. Check Railway logs for errors
2. Verify GoLogin credentials are correct
3. Check GoLogin profile is running
4. Verify `SCRAPER_MODE=gologin` is set

### Enrichment Queue Not Processing

**Symptom**: Items stuck in queue

**Solution**:
1. Check Railway logs for queue worker
2. Verify MailTester API keys are valid
3. Check Railway service is running (not sleeping)
4. Verify Supabase connection

### Railway Service Sleeping

**Symptom**: First request is slow

**Solution**:
- Railway free tier sleeps after inactivity
- Upgrade to paid plan for always-on service
- Or use Railway's "Always On" feature

---

## Cost Breakdown

**Vercel:**
- Hobby (Free): Unlimited personal projects
- Pro ($20/month): Team features, analytics

**Railway:**
- Hobby ($5/month): $5 credit included
- Pro ($20/month): $20 credit, always-on
- Usage-based: Pay for what you use beyond credits

**Total Estimated:**
- **Starting**: ~$20-25/month (Vercel Pro + Railway Pro)
- **Scaling**: ~$50-100/month (with usage)

---

## Next Steps

1. ✅ Deploy to Railway
2. ✅ Deploy to Vercel
3. ✅ Test scraping
4. ✅ Test enrichment
5. ✅ Monitor logs
6. 🔄 Add Redis queue when scaling (Phase 2)
7. 🔄 Add separate worker service if needed (Phase 3)

---

## Quick Reference

### Railway URLs
- Dashboard: https://railway.app
- Your service: Check Railway dashboard

### Vercel URLs
- Dashboard: https://vercel.com
- Your app: Check Vercel dashboard

### Environment Variables Checklist

**Railway:**
- [ ] `SCRAPER_MODE=gologin`
- [ ] `GOLOGIN_API_TOKEN`
- [ ] `GOLOGIN_PROFILE_ID`
- [ ] `MAILTESTER_API_KEY`
- [ ] Supabase credentials

**Vercel:**
- [ ] `NEXT_PUBLIC_RAILWAY_API_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Support

- Railway Docs: https://docs.railway.app
- Vercel Docs: https://vercel.com/docs
- GoLogin Docs: https://docs.gologin.com

