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
2. Apollo.io account (active subscription recommended)
3. Residential proxy (recommended for anti-detection)

## Setup Steps

### Step 1: Create GoLogin Account

1. Go to [gologin.com](https://gologin.com)
2. Sign up for **Professional or higher plan** (API access required)
3. Complete email verification
4. Log in to the dashboard

### Step 2: Create Browser Profile

1. Log in to GoLogin dashboard at [app.gologin.com](https://app.gologin.com)
2. Click **"+ New Profile"** button
3. Configure the profile:
   - **Name**: "Apollo Scraper" (or your preference)
   - **OS**: Windows 10/11 (recommended for best compatibility)
   - **Browser**: Chrome (latest version)
   - **Resolution**: 1920x1080 or similar desktop resolution
4. Click **"Create"**

### Step 3: Configure Proxy (Highly Recommended)

Apollo.io has strong anti-bot detection. A residential proxy is highly recommended.

1. Edit the profile you just created
2. Go to the **Proxy** section
3. Add your residential proxy:
   - **Type**: HTTP or SOCKS5
   - **Host**: your-proxy-host.com
   - **Port**: 12345
   - **Username**: (if required)
   - **Password**: (if required)
4. Click **"Check Proxy"** to verify the connection
5. **Save** the profile

> **Important**: Datacenter proxies are more likely to be detected and blocked. Use residential proxies for best results.

### Step 4: Log in to Apollo (CRITICAL STEP)

This is the most important step. The automation uses the saved session cookies.

1. In GoLogin dashboard, click **"Run"** on your Apollo profile
2. A browser window will open with GoLogin's anti-detect fingerprinting
3. Navigate to [app.apollo.io](https://app.apollo.io)
4. Log in with your Apollo credentials
5. If prompted for 2FA, complete it
6. **Verify you can access search pages** - navigate to People search and ensure results load
7. **CRITICAL: Close the browser window** (don't just minimize - close it!)
   - Closing saves the session cookies to the profile
   - These cookies will be used by the automation

> **Note**: If you log out of Apollo in the profile or cookies expire, you'll need to repeat this step.

### Step 5: Get API Token

1. In GoLogin dashboard, click your profile picture (top right)
2. Go to **Settings** → **API**
3. Click **"Generate Token"** (or copy existing token)
4. Copy the **API Token** - you'll need this for configuration

### Step 6: Get Profile ID

1. Go to **Profiles** list in GoLogin dashboard
2. Click on your Apollo profile
3. Look at the URL in your browser - it will be:
   ```
   https://app.gologin.com/profiles/XXXXXXXXXXXXXXXXXXXXXXXX
   ```
4. Copy the **Profile ID** (the long alphanumeric string after `/profiles/`)

Alternative method:
- In the profile list, hover over a profile
- Click the three dots menu (⋮)
- Click "Copy Profile ID"

### Step 7: Configure Environment Variables

Add these to your `.env.local` (development) or `.env.production` (production):

```bash
# Required: Set scraper mode to gologin
SCRAPER_MODE=gologin

# Required: Your GoLogin API token from Settings → API
GOLOGIN_API_TOKEN=your-api-token-here

# Required: Your profile ID from the dashboard
GOLOGIN_PROFILE_ID=your-profile-id-here

# Optional: Enable verbose API logging for debugging
GOLOGIN_DEBUG=true
```

### Step 8: Test Configuration

Start your app and test the GoLogin status endpoint:

```bash
# Start the dev server
npm run dev

# In another terminal, test the status
curl http://localhost:3000/api/scrape/gologin-status
```

Expected successful response:
```json
{
  "success": true,
  "scraper": {
    "mode": "gologin",
    "isGoLoginConfigured": true
  },
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

### Step 9: Test a Scrape

1. Navigate to the dashboard in your browser
2. Enter an Apollo search URL
3. Click **"Start Scrape"**
4. Watch the server logs for GoLogin connection messages

You should see logs like:
```
[GOLOGIN-CLIENT] ========================================
[GOLOGIN-CLIENT] Starting profile: your-profile-id
[GOLOGIN-CLIENT] ✓ Profile found: Apollo Scraper
[GOLOGIN-CLIENT] ✓ Profile started successfully!
[GOLOGIN-CLIENT] ✓ WebSocket endpoint: wss://...
[GOLOGIN-BROWSER] ✓ Successfully connected to GoLogin browser!
```

## Troubleshooting

### "GOLOGIN_API_TOKEN is not set"

**Cause**: Environment variable not configured.

**Solution**:
1. Get your API token from GoLogin Settings → API
2. Add to `.env.local`: `GOLOGIN_API_TOKEN=your-token-here`
3. Restart your application

### "GoLogin API is not available"

**Cause**: API token is invalid or subscription doesn't include API access.

**Solutions**:
1. Verify your token is correct (no extra spaces)
2. Check your GoLogin subscription is Professional or higher
3. Generate a new API token if the current one is expired
4. Test the API directly:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://api.gologin.com/browser/v2
   ```

### "Profile not found"

**Cause**: The profile ID is incorrect or doesn't exist.

**Solutions**:
1. Verify the Profile ID is correct (check URL in dashboard)
2. Ensure the profile hasn't been deleted
3. Check you're using the profile ID, not the profile name
4. List available profiles:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://api.gologin.com/browser/v2
   ```

### "Failed to get WebSocket endpoint"

**Cause**: Profile couldn't start or is already running elsewhere.

**Solutions**:
1. Check if the profile is open in GoLogin dashboard or another session
2. Stop the profile from GoLogin dashboard
3. Wait 30 seconds and try again
4. Check GoLogin service status at [status.gologin.com](https://status.gologin.com)

### "Connection refused" / "ECONNREFUSED"

**Cause**: The browser didn't start properly or WebSocket connection failed.

**Solutions**:
1. Stop any running instances of the profile
2. Delete and recreate the profile if issues persist
3. Check your firewall isn't blocking WebSocket connections
4. Try with a different proxy

### "Not logged into Apollo"

**Cause**: Session cookies have expired or weren't saved.

**Solutions**:
1. Open the profile manually in GoLogin dashboard
2. Navigate to [app.apollo.io](https://app.apollo.io)
3. Log in with your Apollo credentials
4. **Close the browser completely** (this saves cookies)
5. Wait 10 seconds, then try scraping again

### "Cloudflare challenge detected"

**Cause**: Apollo's anti-bot detection triggered.

**Solutions**:
1. Use a residential proxy (not datacenter)
2. Increase delays between page loads
3. Reduce the number of pages per scrape
4. Rotate between multiple profiles

### Rate Limiting / Blocks

If Apollo starts blocking requests:

1. **Immediate fixes**:
   - Pause scraping for 1-2 hours
   - Switch to a different profile/proxy
   
2. **Prevention**:
   - Use residential proxies
   - Limit to 2-3 pages per scrape
   - Add 10-20 second delays between pages
   - Rotate between multiple profiles

## Team Access

One of GoLogin's major advantages is easy team collaboration:

1. Go to **Team** in GoLogin dashboard
2. Click **Invite** to add team members
3. Share profiles with specific users
4. Team members can:
   - View shared profiles
   - Run profiles manually for login
   - Monitor profile status

No VNC or remote desktop setup required!

## Multi-Profile Setup (Scaling)

For multiple parallel scrapes or team usage:

### Option 1: Multiple Profiles via Admin Panel

1. Create additional profiles in GoLogin (one per user or task)
2. Add each profile to the database via Admin → GoLogin Profiles
3. Assign profiles to users in Admin → Users

### Option 2: Environment Variable (Single Profile)

For simpler setups with one shared profile:
```bash
GOLOGIN_PROFILE_ID=shared-profile-id
```

### Best Practices for Scaling

- Each profile should have a unique proxy
- Consider separate Apollo accounts for heavy usage
- Stagger scrape jobs to avoid concurrent profile access
- Monitor for rate limiting across all profiles

## Cost

GoLogin pricing (as of 2024):

| Plan | Price | Profiles | Notes |
|------|-------|----------|-------|
| Professional | $49/month | 100 | API access included |
| Business | $99/month | 300 | Team features |
| Enterprise | $199/month | 1000 | Priority support |

All plans include API access.

## API Reference

For debugging or custom integrations:

### List Profiles
```bash
GET https://api.gologin.com/browser/v2
Authorization: Bearer {token}
```

Response:
```json
{
  "profiles": [
    {
      "id": "profile-id",
      "name": "Apollo Scraper",
      "browserType": "chrome",
      "os": "win"
    }
  ]
}
```

### Start Profile
```bash
POST https://api.gologin.com/browser/{profileId}/start
Authorization: Bearer {token}
Content-Type: application/json

{}
```

Response:
```json
{
  "wsEndpoint": "wss://cloud-browser.gologin.com/..."
}
```

### Stop Profile
```bash
POST https://api.gologin.com/browser/{profileId}/stop
Authorization: Bearer {token}
```

### Get Profile Status
```bash
GET https://api.gologin.com/browser/{profileId}/status
Authorization: Bearer {token}
```

## Debug Mode

For troubleshooting API issues, enable debug logging:

```bash
GOLOGIN_DEBUG=true
```

This will log:
- Full API request/response details
- WebSocket endpoint information
- Profile start attempts and results

## Migration from Dolphin Anty

If migrating from Dolphin Anty:

1. Create a new GoLogin profile
2. Log into Apollo manually via GoLogin
3. Update environment variables:
   ```bash
   # Old (Dolphin)
   SCRAPER_MODE=dolphin
   DOLPHIN_ANTY_API_URL=http://localhost:3001
   DOLPHIN_ANTY_PROFILE_ID=old-id
   
   # New (GoLogin)
   SCRAPER_MODE=gologin
   GOLOGIN_API_TOKEN=your-token
   GOLOGIN_PROFILE_ID=new-id
   ```
4. Restart your application

The scraper code is fully compatible - just update the environment variables!

## Additional Resources

- [GoLogin Documentation](https://gologin.com/docs)
- [GoLogin API Reference](https://gologin.com/docs/api-reference/introduction/quickstart)
- [GoLogin Status Page](https://status.gologin.com)
