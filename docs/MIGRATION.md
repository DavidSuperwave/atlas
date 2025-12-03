# Migration Guide

This guide covers switching between scraper modes and transferring the setup to new environments.

## Table of Contents

1. [Switching Scraper Modes](#switching-scraper-modes)
2. [Environment Variable Reference](#environment-variable-reference)
3. [Database Schema Notes](#database-schema-notes)
4. [API Endpoint Documentation](#api-endpoint-documentation)
5. [Transferring to New Environment](#transferring-to-new-environment)
6. [Troubleshooting Migration Issues](#troubleshooting-migration-issues)

---

## Switching Scraper Modes

### From Local to Dolphin

1. **Install and configure Dolphin Anty**
   - Follow the [Dolphin Anty Setup Guide](./DOLPHIN_ANTY_SETUP.md)

2. **Get your profile ID**
   - Open Dolphin Anty
   - Create a profile and note the ID

3. **Update environment variables**
   ```bash
   # In .env.local
   SCRAPER_MODE=dolphin
   DOLPHIN_ANTY_API_URL=http://localhost:3001
   DOLPHIN_ANTY_PROFILE_ID=your-profile-id
   ```

4. **Stop local Chrome** (if running with debugging)
   - Close Chrome completely
   - Prevents conflicts

5. **Start Dolphin Anty**
   - Ensure Dolphin Anty is running
   - Profile should be logged into Apollo

6. **Restart your app**
   ```bash
   npm run dev
   ```

7. **Verify the switch**
   ```bash
   curl http://localhost:3000/api/scrape/dolphin-status
   ```

### From Dolphin to Local

1. **Update environment variables**
   ```bash
   # In .env.local
   SCRAPER_MODE=local
   # Or remove SCRAPER_MODE entirely (defaults to local)
   ```

2. **Start Chrome with debugging**
   ```bash
   # macOS
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 \
     --user-data-dir="$HOME/.chrome-apollo-profile"
   
   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
     --remote-debugging-port=9222 ^
     --user-data-dir="%TEMP%\chrome-apollo-profile"
   ```

3. **Log into Apollo in Chrome**

4. **Restart your app**
   ```bash
   npm run dev
   ```

5. **Verify the switch**
   - Check logs for `[SCRAPER-FACTORY] Using scraper mode: local`

### Quick Mode Toggle

For rapid testing, you can override the mode temporarily:

```bash
# Run with local mode
SCRAPER_MODE=local npm run dev

# Run with dolphin mode
SCRAPER_MODE=dolphin npm run dev
```

---

## Environment Variable Reference

### Core Variables

| Variable | Description | Default | Modes |
|----------|-------------|---------|-------|
| `SCRAPER_MODE` | Active scraper (`local` or `dolphin`) | `local` | All |

### Dolphin Anty Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DOLPHIN_ANTY_API_URL` | Dolphin Anty API URL | `http://localhost:3001` | No |
| `DOLPHIN_ANTY_PROFILE_ID` | Profile ID to use | - | Yes |

### Supabase Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |

### Complete Example

```bash
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Scraper Mode
SCRAPER_MODE=dolphin

# Dolphin Anty (when SCRAPER_MODE=dolphin)
DOLPHIN_ANTY_API_URL=http://localhost:3001
DOLPHIN_ANTY_PROFILE_ID=abc123def456
```

---

## Database Schema Notes

### Scrapes Table

The `scrapes` table stores scrape job records.

```sql
-- Relevant columns for scraper integration
CREATE TABLE scrapes (
  id UUID PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  user_id UUID,
  name TEXT,
  tags TEXT[],
  scraper_mode TEXT,  -- Tracks which scraper was used
  total_leads INTEGER,
  error_details JSONB,
  created_at TIMESTAMPTZ
);
```

**Note**: The `scraper_mode` column may need to be added if migrating from an older version:

```sql
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS scraper_mode TEXT;
```

### Leads Table

The `leads` table stores scraped lead data. All scraper implementations produce data compatible with this schema:

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  scrape_id UUID REFERENCES scrapes(id),
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  title TEXT,
  company_name TEXT,
  company_linkedin TEXT,
  location TEXT,
  company_size TEXT,
  industry TEXT,
  website TEXT,
  keywords TEXT[],
  phone_numbers TEXT[],
  linkedin_url TEXT,
  verification_status TEXT,
  verification_data JSONB,
  created_at TIMESTAMPTZ
);
```

### No Migration Needed

Both scraper modes:
- Use the same database schema
- Store leads in the same format
- Track scraper mode in the `scrapes` table

Data created by either scraper is fully compatible with the other.

---

## API Endpoint Documentation

### POST /api/scrape

Start a new scrape job.

**Request:**
```json
{
  "url": "https://app.apollo.io/#/people?...",
  "pages": 3,
  "name": "My Scrape Job",
  "tags": ["tech", "startup"]
}
```

**Response:**
```json
{
  "success": true,
  "count": 75,
  "scrapeId": "uuid-here",
  "skipped": 2,
  "errors": 0,
  "scraperMode": "dolphin"
}
```

### GET /api/scrape/dolphin-status

Get Dolphin Anty status and configuration.

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:00Z",
  "scraper": {
    "mode": "dolphin",
    "modeSource": "environment",
    "isDolphinConfigured": true
  },
  "configuration": {
    "valid": true,
    "warnings": [],
    "errors": []
  },
  "dolphin": {
    "available": true,
    "apiUrl": "http://localhost:3001",
    "profileId": "abc123",
    "profileStatus": {
      "id": "abc123",
      "found": true,
      "isRunning": true,
      "name": "Apollo Scraper"
    },
    "browserStatus": {
      "browserConnected": true
    }
  },
  "environment": {
    "SCRAPER_MODE": "dolphin",
    "DOLPHIN_ANTY_API_URL": "http://localhost:3001",
    "DOLPHIN_ANTY_PROFILE_ID": "(configured)"
  }
}
```

### POST /api/scrape/dolphin-status

Control Dolphin Anty profiles.

**Start Profile:**
```json
{
  "action": "start",
  "profileId": "abc123"  // Optional, uses env var if not provided
}
```

**Stop Profile:**
```json
{
  "action": "stop"
}
```

**Restart Profile:**
```json
{
  "action": "restart"
}
```

**List Profiles:**
```json
{
  "action": "list"
}
```

**Check Status:**
```json
{
  "action": "status"
}
```

---

## Transferring to New Environment

### Step-by-Step Transfer

#### 1. Export Configuration

Document your current settings:

```bash
# Check current mode
echo $SCRAPER_MODE

# For Dolphin Anty
echo $DOLPHIN_ANTY_PROFILE_ID
```

#### 2. Set Up New Environment

**Clone the repository:**
```bash
git clone your-repo
cd your-repo
npm install
```

**Copy environment variables:**
- Create `.env.local` with your settings
- Update any environment-specific values

#### 3. For Local Mode

1. Install Chrome if needed
2. Start Chrome with debugging:
   ```bash
   --remote-debugging-port=9222
   ```
3. Log into Apollo

#### 4. For Dolphin Anty Mode

1. Install Dolphin Anty
2. Import or recreate your profile
3. Get the new profile ID
4. Update `DOLPHIN_ANTY_PROFILE_ID`
5. Log into Apollo in the profile

#### 5. Set Up Database

```bash
# Run any pending migrations
npm run db:migrate

# Or apply schema manually
psql -f supabase/schema.sql
```

#### 6. Verify Setup

```bash
# Start the app
npm run dev

# Check status
curl http://localhost:3000/api/scrape/dolphin-status
```

### Deployment Considerations

#### Vercel Deployment

**Important**: The scraper requires a running browser, which Vercel's serverless functions cannot support directly.

Options:
1. **Hybrid Architecture**: 
   - Deploy Next.js app to Vercel
   - Run scraper service on a VPS
   - API calls to VPS for scraping

2. **Full VPS Deployment**:
   - Deploy entire app to VPS
   - Run Dolphin Anty on same server

#### VPS Deployment

1. **Set up server**:
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install Dolphin Anty** (Linux):
   - Download from dolphin-anty.com
   - Run in headless mode if needed

3. **Configure environment**:
   ```bash
   export SCRAPER_MODE=dolphin
   export DOLPHIN_ANTY_PROFILE_ID=your-id
   ```

4. **Run with PM2**:
   ```bash
   npm install -g pm2
   pm2 start npm --name "scraper" -- start
   ```

---

## Troubleshooting Migration Issues

### Mode Not Switching

**Symptom**: App still uses old scraper mode

**Solutions**:
1. Check environment variable is set correctly
2. Restart the app completely
3. Check for typos in `SCRAPER_MODE`
4. Verify `.env.local` is being read

### Dolphin Anty Connection Fails

**Symptom**: Cannot connect to Dolphin Anty

**Solutions**:
1. Ensure Dolphin Anty is running
2. Check API URL is correct
3. Verify profile ID exists
4. Check firewall settings

### Profile Not Starting

**Symptom**: Profile won't start via API

**Solutions**:
1. Try starting manually in Dolphin Anty
2. Check profile isn't already running
3. Verify profile exists in Dolphin Anty
4. Check Dolphin Anty logs

### Local Chrome Not Connecting

**Symptom**: Cannot connect to Chrome

**Solutions**:
1. Verify Chrome is running with debugging port
2. Check no other app is using port 9222
3. Kill all Chrome processes and restart
4. Try a fresh Chrome profile

### Database Schema Mismatch

**Symptom**: Errors when saving leads

**Solutions**:
1. Apply latest schema migrations
2. Check `scraper_mode` column exists
3. Verify all required columns exist
4. Check for any schema differences

### Permission Issues

**Symptom**: File/network permission errors

**Solutions**:
1. Check file permissions on config files
2. Verify network access to Supabase
3. Check Chrome/Dolphin Anty has required permissions

---

## Quick Reference

### Switch to Local Mode
```bash
# .env.local
SCRAPER_MODE=local
```

### Switch to Dolphin Mode
```bash
# .env.local
SCRAPER_MODE=dolphin
DOLPHIN_ANTY_PROFILE_ID=your-profile-id
```

### Test Configuration
```bash
curl http://localhost:3000/api/scrape/dolphin-status
```

### View Logs
```bash
# Look for these log prefixes
[SCRAPER-FACTORY]  # Mode selection
[LOCAL-SCRAPER]    # Local Chrome scraper
[DOLPHIN-SCRAPER]  # Dolphin Anty scraper
[DOLPHIN-CLIENT]   # Dolphin Anty API client
[DOLPHIN-BROWSER]  # Dolphin browser manager
[DOLPHIN-MONITOR]  # Account monitoring
```

---

## Related Documentation

- [Architecture Documentation](./ARCHITECTURE.md)
- [Dolphin Anty Setup Guide](./DOLPHIN_ANTY_SETUP.md)


