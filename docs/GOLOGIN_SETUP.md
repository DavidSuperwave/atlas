# GoLogin Setup Guide

This guide covers setting up GoLogin as the anti-detect browser for Apollo scraping.

## Why GoLogin Over Dolphin Anty?

| Feature | GoLogin | Dolphin Anty |
|---------|---------|--------------|
| Setup | Cloud-based, no local install | Requires local installation |
| VNC Required | No | Yes (complex on VPS) |
| Team Access | Web dashboard | VNC sharing required |
| API Design | API-first | API available |
| Proxy Management | Built-in dashboard | Built-in |
| Setup Time | ~10 minutes | ~1-2 hours |

## Prerequisites

1. GoLogin account with API access (Professional plan or higher)
2. Apollo.io account (logged in)
3. Residential proxy (recommended for anti-detection)

## Setup Steps

### Step 1: Create GoLogin Account

1. Go to [gologin.com](https://gologin.com)
2. Sign up for Professional or higher plan
3. Complete verification

### Step 2: Create Browser Profile

1. Log in to GoLogin dashboard
2. Click **"+ New Profile"**
3. Configure the profile:
   - **Name**: "Apollo Scraper" (or your preference)
   - **OS**: Match your target (Windows recommended)
   - **Browser**: Chrome (latest)
4. Click **"Create"**

### Step 3: Configure Proxy (Recommended)

1. Edit the profile
2. Go to **Proxy** section
3. Add your residential proxy:
   - Type: HTTP/SOCKS5
   - Host: your-proxy-host.com
   - Port: 12345
   - Username: (if required)
   - Password: (if required)
4. Click **"Check Proxy"** to verify
5. Save the profile

### Step 4: Log in to Apollo

1. Click **"Run"** on your profile to launch the browser
2. Navigate to [app.apollo.io](https://app.apollo.io)
3. Log in with your Apollo credentials
4. Complete any 2FA if required
5. Verify you can access search pages
6. **Close** the browser (important: saves cookies)

### Step 5: Get API Credentials

1. In GoLogin dashboard, click your profile picture (top right)
2. Go to **Settings** → **API**
3. Click **"Generate Token"** or copy existing token
4. Copy your **API Token**

Get your Profile ID:
1. Go to **Profiles** list
2. Click on your Apollo profile
3. The URL will be: `https://app.gologin.com/profiles/PROFILE_ID`
4. Copy the **PROFILE_ID** from the URL

### Step 6: Configure Environment Variables

Add to your `.env.local` or `.env.production`:

```bash
SCRAPER_MODE=gologin
GOLOGIN_API_TOKEN=your-api-token-here
GOLOGIN_PROFILE_ID=your-profile-id-here
```

### Step 7: Test Configuration

Run the status check API:

```bash
curl http://localhost:3000/api/scrape/gologin-status
```

Expected response:
```json
{
  "success": true,
  "gologin": {
    "available": true,
    "configured": true,
    "profileId": "your-profile-id",
    "profileStatus": {
      "found": true,
      "isRunning": false
    }
  }
}
```

## Testing the Scraper

1. Start your Next.js app:
   ```bash
   npm run dev
   ```

2. Navigate to the scrape page
3. Enter an Apollo search URL
4. Click **"Start Scrape"**
5. Monitor the logs for GoLogin connection

## Troubleshooting

### "GoLogin API is not available"

1. Check your API token is correct
2. Verify your GoLogin subscription is active
3. Test API directly:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://api.gologin.com/browser/v2
   ```

### "Profile not found"

1. Verify the Profile ID is correct
2. Check the profile exists in GoLogin dashboard
3. Ensure you're using the ID, not the profile name

### "Failed to get WebSocket endpoint"

1. Make sure no other process is using the profile
2. Try restarting the profile from GoLogin dashboard
3. Check GoLogin service status

### "Not logged into Apollo"

1. Run the profile manually from GoLogin dashboard
2. Log in to Apollo
3. Close the browser to save cookies
4. Try scraping again

### Rate Limiting

If Apollo blocks requests:
1. Increase delays in scraper settings
2. Use residential proxy (not datacenter)
3. Rotate profiles or proxies
4. Reduce pages per scrape

## Team Access

One of GoLogin's advantages is easy team collaboration:

1. Go to **Team** in GoLogin dashboard
2. **Invite** team members
3. Share profiles with specific users
4. Team can access profiles via web dashboard

No VNC or remote desktop needed!

## Scaling

For multiple parallel scrapes:

1. Create additional profiles in GoLogin
2. Each profile should have:
   - Separate Apollo account (or rotation)
   - Unique proxy
3. Use profile IDs in rotation

## Cost

GoLogin pricing (as of 2024):
- Professional: $49/month (100 profiles)
- Business: $99/month (300 profiles)
- Enterprise: $199/month (1000 profiles)

All plans include API access.

## API Reference

### Start Profile
```bash
POST https://api.gologin.com/browser/{profileId}/start
Headers: Authorization: Bearer {token}
Body: { "isRemote": true }
```

### Stop Profile
```bash
POST https://api.gologin.com/browser/{profileId}/stop
Headers: Authorization: Bearer {token}
```

### Get Profile Status
```bash
GET https://api.gologin.com/browser/{profileId}/status
Headers: Authorization: Bearer {token}
```

### List Profiles
```bash
GET https://api.gologin.com/browser/v2
Headers: Authorization: Bearer {token}
```

## Migration from Dolphin Anty

If you're migrating from Dolphin Anty:

1. Export Apollo cookies from Dolphin profile (optional)
2. Create GoLogin profile
3. Import cookies or log in fresh
4. Update environment variables:
   ```bash
   # Old
   SCRAPER_MODE=dolphin
   DOLPHIN_ANTY_API_URL=http://localhost:3001
   DOLPHIN_ANTY_PROFILE_ID=old-id
   
   # New
   SCRAPER_MODE=gologin
   GOLOGIN_API_TOKEN=your-token
   GOLOGIN_PROFILE_ID=new-id
   ```
5. Restart your application

The scraper code is compatible - just change the environment variables!

