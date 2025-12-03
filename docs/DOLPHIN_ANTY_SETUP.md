# Dolphin Anty Setup Guide

This guide covers setting up Dolphin Anty for Apollo lead scraping with enhanced anti-detection capabilities.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Profile Creation](#profile-creation)
4. [Proxy Configuration](#proxy-configuration)
5. [Fingerprint Settings](#fingerprint-settings)
6. [Apollo Account Setup](#apollo-account-setup)
7. [Environment Configuration](#environment-configuration)
8. [Testing Your Setup](#testing-your-setup)
9. [Account Monitoring](#account-monitoring)
10. [Troubleshooting](#troubleshooting)
11. [Best Practices](#best-practices)

---

## Prerequisites

Before setting up Dolphin Anty, ensure you have:

- [ ] Apollo.io account (free or paid)
- [ ] Residential proxy service (recommended)
- [ ] Dolphin Anty license (free tier available)
- [ ] Node.js 18+ installed
- [ ] This project cloned and dependencies installed

---

## Installation

### 1. Download Dolphin Anty

1. Visit [dolphin-anty.com](https://dolphin-anty.com/)
2. Create an account
3. Download the version for your OS (Windows, macOS, Linux)
4. Install and launch Dolphin Anty

### 2. Verify API Access

Dolphin Anty runs a local API server on port 3001 by default. Verify it's running:

```bash
curl http://localhost:3001/browser_profiles
```

You should receive a JSON response with your profiles.

---

## Profile Creation

### 1. Create a New Profile

1. Open Dolphin Anty
2. Click **"Create Profile"** or **"+"** button
3. Enter a descriptive name (e.g., "Apollo Scraper - Main")

### 2. Operating System Selection

Choose the OS that matches your setup:
- **Windows** - Most common, good compatibility
- **macOS** - If running on Mac
- **Linux** - For server deployments

> **Tip**: Match the OS to avoid font and system inconsistencies that can trigger detection.

### 3. Profile Type

Select a profile type based on your needs:
- **None** - General purpose (recommended for Apollo)
- **Facebook**, **Google**, etc. - For platform-specific optimizations

### 4. Get Your Profile ID

After creating the profile:
1. Click on the profile in the list
2. The profile ID is shown in the URL or profile details
3. Copy this ID - you'll need it for configuration

---

## Proxy Configuration

### Why Proxies Matter

Apollo and Cloudflare track IP addresses. Using your real IP will:
- Get flagged quickly
- Result in Cloudflare challenges
- Risk account suspension

### Recommended Proxy Types

| Type | Quality | Price | Recommendation |
|------|---------|-------|----------------|
| **Residential** | Best | $$ | Highly recommended |
| **ISP Proxies** | Excellent | $$$ | Premium option |
| **Mobile** | Good | $$ | Alternative |
| **Datacenter** | Poor | $ | Not recommended |

### Proxy Providers

Recommended providers for Apollo scraping:

1. **Bright Data** (formerly Luminati)
   - Best quality residential proxies
   - Rotating and sticky sessions
   - Good for high-volume scraping

2. **Oxylabs**
   - Excellent residential network
   - Good support

3. **Smartproxy**
   - Budget-friendly
   - Good for starting out

4. **IPRoyal**
   - Most affordable
   - Decent quality

### Setting Up Proxy in Dolphin Anty

1. Open your profile settings
2. Navigate to **Proxy** section
3. Enter proxy details:

```
Type: HTTP or SOCKS5
Host: your-proxy-host.com
Port: 12345
Username: your-username
Password: your-password
```

4. Click **"Check Proxy"** to verify connection
5. Save the profile

### Proxy Rotation Strategy

For best results:
- Use **sticky sessions** (same IP for session duration)
- Rotate IP between scraping sessions
- Target proxies from the same country as your Apollo account

---

## Fingerprint Settings

### What is Browser Fingerprinting?

Websites collect browser characteristics to identify users:
- User agent string
- Screen resolution
- Installed fonts
- WebGL renderer
- Canvas fingerprint
- And many more...

### Recommended Settings

#### User Agent
- **Leave default** - Dolphin Anty generates realistic user agents
- Update periodically to match current Chrome versions

#### Screen Resolution
- Common resolutions: 1920x1080, 1366x768, 1440x900
- Match to your proxy location's common resolutions

#### Timezone
- **Auto-detect** based on proxy IP (recommended)
- Or manually set to match proxy location

#### WebGL
- **Noise mode** - Adds slight variations (recommended)
- Prevents fingerprint tracking

#### Canvas
- **Noise mode** - Adds random noise (recommended)

#### Audio
- **Noise mode** - Slight variations

#### Fonts
- Leave default unless issues occur

### Don't Over-Configure

> **Important**: The default Dolphin Anty fingerprints are well-optimized. 
> Over-customization can make your profile stand out as suspicious.
> Only change settings if you're experiencing issues.

---

## Apollo Account Setup

### Initial Login

1. Start the Dolphin Anty profile:
   - Click **"Start"** next to your profile
   - A browser window will open

2. Navigate to Apollo:
   ```
   https://app.apollo.io
   ```

3. Log in with your Apollo credentials

4. **Important**: Complete any 2FA or verification steps

5. Keep the browser open for a few minutes to establish the session

### Session Persistence

Dolphin Anty saves cookies and session data automatically:
- Sessions persist across profile restarts
- You shouldn't need to log in again

### Verify Session

1. Close and restart the profile
2. Navigate to Apollo
3. Verify you're still logged in

---

## Environment Configuration

### Required Environment Variables

Add these to your `.env.local` file:

```bash
# Enable Dolphin Anty mode
SCRAPER_MODE=dolphin

# Dolphin Anty API URL (default is localhost:3001)
DOLPHIN_ANTY_API_URL=http://localhost:3001

# Your Dolphin Anty profile ID
DOLPHIN_ANTY_PROFILE_ID=your-profile-id-here
```

### Finding Your Profile ID

1. Open Dolphin Anty
2. Right-click on your profile
3. Select "Copy ID" or look in profile settings
4. The ID is a string like: `abc123def456`

---

## Testing Your Setup

### 1. Verify Dolphin Anty is Running

```bash
curl http://localhost:3001/browser_profiles
```

### 2. Check Status Endpoint

Start your Next.js app and call:

```bash
curl http://localhost:3000/api/scrape/dolphin-status
```

Expected response:
```json
{
  "success": true,
  "scraper": {
    "mode": "dolphin",
    "isDolphinConfigured": true
  },
  "dolphin": {
    "available": true,
    "profileStatus": {
      "isRunning": true
    }
  }
}
```

### 3. Test Scrape

Try a small scrape:

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://app.apollo.io/#/people?...", "pages": 1}'
```

---

## Account Monitoring

### Health Check Endpoint

Monitor your account status:

```bash
GET /api/scrape/dolphin-status
```

### What to Monitor

1. **Login Status**: Is Apollo session valid?
2. **Cloudflare Challenges**: Are you being blocked?
3. **Rate Limiting**: Are requests being throttled?

### Warning Signs

| Issue | Symptom | Action |
|-------|---------|--------|
| Session expired | Redirect to login | Re-login in profile |
| Cloudflare challenge | Challenge page shown | Wait, try different proxy |
| Rate limited | Slow responses, 429 errors | Reduce scraping speed |
| Account flagged | Unusual verification requests | Cool down, change proxy |

### Automated Monitoring

The app monitors these automatically during scrapes. Check logs for:

```
[DOLPHIN-SCRAPER] WARNING: Cloudflare challenge detected
[DOLPHIN-MONITOR] Rate limit indicator found
```

---

## Troubleshooting

### Dolphin Anty Not Starting

**Symptoms**: Profile won't start, API unavailable

**Solutions**:
1. Restart Dolphin Anty application
2. Check if port 3001 is in use
3. Verify Dolphin Anty license is active

### Can't Connect to Profile

**Symptoms**: WebSocket connection fails

**Solutions**:
1. Ensure profile is started in Dolphin Anty
2. Check firewall settings
3. Verify `DOLPHIN_ANTY_PROFILE_ID` is correct

### Cloudflare Blocking

**Symptoms**: Cloudflare challenge page, can't access Apollo

**Solutions**:
1. Try a different residential proxy
2. Clear profile cookies and re-login
3. Wait 24 hours before trying again
4. Consider a fresh profile

### Apollo Login Fails

**Symptoms**: Can't log into Apollo in the profile

**Solutions**:
1. Verify Apollo credentials
2. Check if proxy is working
3. Try incognito/fresh profile
4. Complete any verification steps manually

### Slow Scraping

**Symptoms**: Scraping takes very long

**Solutions**:
1. Check proxy speed (should be <200ms latency)
2. Reduce concurrent operations
3. Use a faster proxy location

---

## Best Practices

### 1. Scraping Speed

- **Don't rush**: Add delays between actions
- **Mimic humans**: Random delays, scrolling, pauses
- **Page limits**: Don't scrape more than 10-20 pages at once

### 2. Session Management

- **Warm up sessions**: Browse Apollo normally before scraping
- **Regular breaks**: Don't scrape continuously
- **Rotate carefully**: Don't change IPs mid-session

### 3. Account Safety

- **Use separate accounts**: Don't use your main Apollo account
- **Monitor usage**: Stay within Apollo's fair use limits
- **Have backups**: Maintain multiple profiles/accounts

### 4. Proxy Best Practices

- **Sticky sessions**: Use same IP for entire scrape session
- **Geographic consistency**: Match proxy location to account
- **Quality over quantity**: Pay for good residential proxies

### 5. Profile Hygiene

- **Regular updates**: Keep Dolphin Anty updated
- **Clean profiles**: Periodically clear unused data
- **Backup profiles**: Export profile settings regularly

---

## Quick Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SCRAPER_MODE` | Scraper to use (`local` or `dolphin`) | `local` |
| `DOLPHIN_ANTY_API_URL` | Dolphin Anty API URL | `http://localhost:3001` |
| `DOLPHIN_ANTY_PROFILE_ID` | Profile ID to use | (required) |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scrape` | POST | Start a scrape |
| `/api/scrape/dolphin-status` | GET | Check Dolphin Anty status |
| `/api/scrape/dolphin-status` | POST | Control profiles |

### Useful Commands

```bash
# Check Dolphin Anty status
curl http://localhost:3001/browser_profiles

# Start a profile
curl "http://localhost:3001/browser_profiles/{id}/start?automation=1"

# Stop a profile
curl "http://localhost:3001/browser_profiles/{id}/stop"
```

---

## Need Help?

- Check the [Architecture Documentation](./ARCHITECTURE.md)
- Review the [Migration Guide](./MIGRATION.md)
- Check application logs for error details
- Review Dolphin Anty's official documentation


