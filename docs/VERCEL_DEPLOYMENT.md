# Vercel Deployment Guide

This document outlines the recommended architecture for deploying the scraper system using Vercel + Railway hybrid architecture.

## Table of Contents

1. [The Challenge](#the-challenge)
2. [Recommended Architecture](#recommended-architecture)
3. [Quick Setup (10-15 minutes)](#quick-setup-10-15-minutes)
4. [Detailed Setup Guide](#detailed-setup-guide)
5. [Alternative Platforms](#alternative-platforms)

---

## The Challenge

**Vercel is a serverless platform** - functions run in isolated, ephemeral containers that:
- Cannot maintain persistent browser processes
- Have execution time limits (10s for Hobby, 60s for Pro)
- Cannot run long-running background queues

**Our scrapers require**:
- Running browser instances (via GoLogin cloud API)
- Long-running processes (scrapes can take minutes)
- Persistent email verification queue

---

## Recommended Architecture

### Hybrid: Vercel (Frontend) + Railway (Backend)

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRODUCTION                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────┐                ┌──────────────────┐      │
│   │     Vercel      │                │     Railway      │      │
│   │                 │                │                   │      │
│   │  Frontend +     │  HTTP/CORS     │  Long-running    │      │
│   │  Quick APIs     │───────────────▶│  APIs:           │      │
│   │                 │                │                   │      │
│   │  - UI/Auth      │                │  - /api/scrape   │      │
│   │  - DB queries   │                │  - /api/enrich   │      │
│   │  - Credits API  │                │  - Verification  │      │
│   └─────────────────┘                │    Queue         │      │
│           │                          └────────┬─────────┘      │
│           │                                   │                │
│           └───────────────┬───────────────────┘                │
│                           │                                    │
│                           ▼                                    │
│                    ┌──────────────┐                           │
│                    │  Supabase    │                           │
│                    │  (Database)  │                           │
│                    └──────────────┘                           │
│                           │                                    │
│                           │                                    │
│                    ┌──────▼──────┐                            │
│                    │  GoLogin    │                            │
│                    │  Cloud API  │                            │
│                    └─────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

| Component | Platform | Reason |
|-----------|----------|--------|
| Frontend | Vercel | Best CDN, instant global deployment |
| Quick APIs | Vercel | Auth, DB queries are fast |
| Scraper | Railway | Long-running, needs browser access |
| Enrichment | Railway | Background queue, persistent |
| Database | Supabase | Already using, scales well |
| Browser | GoLogin Cloud | API-based, no VPS browser needed |

---

## Quick Setup (10-15 minutes)

### Prerequisites
- GoLogin account with API access
- Supabase project
- GitHub repo with the app

### Step 1: Deploy to Railway (5 min)

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** → **"Deploy from GitHub"**
3. Select your repository
4. Add environment variables:

```bash
# Required
NODE_ENV=production
SCRAPER_MODE=gologin
GOLOGIN_API_TOKEN=your-token
GOLOGIN_PROFILE_ID=your-profile-id
MAILTESTER_API_KEY=your-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# CORS (will update after Vercel deploy)
ALLOWED_ORIGINS=http://localhost:3000
```

5. Deploy and note your Railway URL: `https://your-app.railway.app`

### Step 2: Deploy to Vercel (5 min)

1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"** → Import your repository
3. Add environment variables:

```bash
# Required
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Railway backend
NEXT_PUBLIC_RAILWAY_API_URL=https://your-app.railway.app
```

4. Deploy and note your Vercel URL: `https://your-app.vercel.app`

### Step 3: Update Railway CORS (1 min)

1. Go back to Railway dashboard
2. Update environment variable:

```bash
ALLOWED_ORIGINS=https://your-app.vercel.app
```

3. Redeploy Railway

### Step 4: Test

1. Open `https://your-app.vercel.app`
2. Log in
3. Try a scrape!

---

## Detailed Setup Guide

### GoLogin Setup (if not done)

See [GOLOGIN_SETUP.md](./GOLOGIN_SETUP.md) for detailed instructions.

Quick summary:
1. Create GoLogin account (Professional plan)
2. Create browser profile
3. Log in to Apollo in the profile
4. Get API token and Profile ID

### Railway Configuration

**Build Settings:**
- Build Command: `npm run build`
- Start Command: `npm start`
- Watch Paths: `src/**`, `package.json`

**Environment Variables:**

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Yes |
| `SCRAPER_MODE` | `gologin` | Yes |
| `GOLOGIN_API_TOKEN` | Your token | Yes |
| `GOLOGIN_PROFILE_ID` | Your profile ID | Yes |
| `MAILTESTER_API_KEY` | Your key | Yes |
| `MAILTESTER_API_KEY_1` | Additional key | Optional |
| `MAILTESTER_API_KEY_2` | Additional key | Optional |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase key | Yes |
| `ALLOWED_ORIGINS` | Vercel URL | Yes |

### Vercel Configuration

**Build Settings:**
- Framework Preset: Next.js (auto-detected)
- Build Command: `npm run build` (default)
- Output Directory: `.next` (default)

**Environment Variables:**

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase key | Yes |
| `NEXT_PUBLIC_RAILWAY_API_URL` | Railway URL | Yes |

### API Routing

The app automatically routes API calls:

| API | Platform | Reason |
|-----|----------|--------|
| `/api/scrape` | Railway | Long-running |
| `/api/enrich` | Railway | Background queue |
| `/api/scrape/gologin-status` | Railway | Browser control |
| `/api/verify-emails/*` | Railway | Long-running |
| `/api/credits/*` | Vercel | Quick DB query |
| `/api/admin/*` | Vercel | Quick DB query |
| `/api/leads/*` | Vercel | Quick DB query |

This is configured in `src/lib/api-client.ts`.

---

## Alternative Platforms

### Option 1: Railway Only (Simplest)

Deploy entire app to Railway (no Vercel):

**Pros:**
- Single deployment
- No CORS setup needed
- Simpler configuration

**Cons:**
- No global CDN
- Slightly slower frontend
- ~$20/month

### Option 2: Render

Similar to Railway:

```bash
# render.yaml
services:
  - type: web
    name: lead-scraper
    env: node
    buildCommand: npm run build
    startCommand: npm start
    envVars:
      - key: SCRAPER_MODE
        value: gologin
      # ... other vars
```

### Option 3: DigitalOcean App Platform

```bash
# Deploy via CLI
doctl apps create --spec spec.yaml
```

### Option 4: Full VPS (Most Control)

Deploy to Ubuntu VPS with PM2:

```bash
# On VPS
git clone your-repo
cd your-repo
npm install
npm run build
pm2 start npm --name "scraper" -- start
pm2 startup
pm2 save
```

See [DIGITALOCEAN_SETUP.md](./DIGITALOCEAN_SETUP.md) for full VPS setup.

---

## Scaling

### Current Capacity (Tier 2)

- **Scraping:** Limited by GoLogin plan (100-1000 profiles)
- **Enrichment:** ~1,700 emails/minute (5 API keys)
- **Database:** Supabase free tier (500MB)

### Upgrade Path

1. **Add Redis** (Railway addon, $10/month)
   - Persistent queue
   - Survives restarts
   - Faster processing

2. **Add Workers** (separate Railway service)
   - Parallel processing
   - Auto-scale based on queue

3. **Enterprise** (AWS/GCP)
   - Unlimited scaling
   - Global distribution
   - ~$100+/month

See the scaling plan for details on upgrading when needed.

---

## Troubleshooting

### "CORS error" on Vercel

1. Check `ALLOWED_ORIGINS` on Railway includes your Vercel URL
2. Verify `NEXT_PUBLIC_RAILWAY_API_URL` is set on Vercel
3. Check Railway logs for errors

### "GoLogin not available" on Railway

1. Verify `GOLOGIN_API_TOKEN` is correct
2. Check GoLogin subscription is active
3. Test API directly:
   ```bash
   curl -H "Authorization: Bearer TOKEN" https://api.gologin.com/browser/v2
   ```

### Scrapes timing out

1. Check Railway logs for errors
2. Verify GoLogin profile is working
3. Try running a shorter scrape (1 page)

### Enrichment not working

1. Check `MAILTESTER_API_KEY` is set
2. Verify queue is running (check Railway logs)
3. Check Supabase for queue status

---

## Cost Breakdown

### Hybrid (Vercel + Railway)

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel | $0 (Hobby) | $20/month (Pro) |
| Railway | $5 credit/month | ~$20/month |
| GoLogin | - | $49/month |
| Supabase | $0 (Free) | $25/month (Pro) |

**Total:** $49-114/month

### Railway Only

| Service | Cost |
|---------|------|
| Railway | ~$25/month |
| GoLogin | $49/month |
| Supabase | $0-25/month |

**Total:** $74-99/month

---

## Next Steps

1. ✅ Complete GoLogin setup
2. ✅ Deploy to Railway
3. ✅ Deploy to Vercel
4. ✅ Configure CORS
5. ✅ Test end-to-end

Need help? Check:
- [GoLogin Setup](./GOLOGIN_SETUP.md)
- [Environment Variables](./ENV_VARIABLES.md)
- [Architecture Overview](./ARCHITECTURE.md)
