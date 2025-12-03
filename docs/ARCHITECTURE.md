# Scraper Architecture Documentation

This document describes the dual-scraper architecture that supports both local Chrome and Dolphin Anty browser automation.

## Table of Contents

1. [Overview](#overview)
2. [System Design](#system-design)
3. [File Structure](#file-structure)
4. [Scraper Selection Flow](#scraper-selection-flow)
5. [Module Responsibilities](#module-responsibilities)
6. [Conflict Prevention](#conflict-prevention)
7. [Compatibility Guarantees](#compatibility-guarantees)
8. [Environment Variables](#environment-variables)
9. [Data Flow](#data-flow)
10. [Extending the System](#extending-the-system)

---

## Overview

The scraper system supports two browser automation backends:

1. **Local Chrome** (`SCRAPER_MODE=local`)
   - Uses Chrome with remote debugging on port 9222
   - Best for: Local development, personal use
   - Requires: Chrome running locally with debugging enabled

2. **Dolphin Anty** (`SCRAPER_MODE=dolphin`)
   - Uses Dolphin Anty anti-detect browser profiles
   - Best for: Production, team use, avoiding Cloudflare
   - Requires: Dolphin Anty running with configured profile

Both scrapers:
- Return the same `ScrapedLead[]` data structure
- Use the same database schema
- Are accessible through the same API endpoint
- Can be switched via environment variable

---

## System Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer                                    │
│                                                                      │
│   POST /api/scrape ──────────────────────────────────────┐          │
│                                                          │          │
└──────────────────────────────────────────────────────────│──────────┘
                                                           │
                                                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Scraper Factory                                 │
│                                                                      │
│   scraper.ts                                                         │
│   ├── getScraperMode() ─── reads SCRAPER_MODE env var               │
│   ├── getScraper() ─────── returns appropriate scraper function     │
│   └── scrapeApollo() ───── main entry point, delegates to scraper   │
│                                                                      │
│                    ┌─────────────────┐                              │
│                    │  SCRAPER_MODE   │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│              ┌──────────────┼──────────────┐                        │
│              │              │              │                        │
│              ▼              │              ▼                        │
│        ┌─────────┐          │        ┌─────────┐                    │
│        │  local  │          │        │ dolphin │                    │
│        └────┬────┘          │        └────┬────┘                    │
│             │               │             │                          │
└─────────────│───────────────│─────────────│──────────────────────────┘
              │               │             │
              ▼               │             ▼
┌─────────────────────────┐   │   ┌─────────────────────────┐
│    Local Scraper        │   │   │    Dolphin Scraper      │
│                         │   │   │                         │
│  scraper-local.ts       │   │   │  scraper-dolphin.ts     │
│  browser-manager-       │   │   │  browser-manager-       │
│    local.ts             │   │   │    dolphin.ts           │
│                         │   │   │  dolphin-anty-client.ts │
└───────────┬─────────────┘   │   └───────────┬─────────────┘
            │                 │               │
            ▼                 │               ▼
     ┌─────────────┐          │        ┌─────────────┐
     │   Chrome    │          │        │Dolphin Anty │
     │  (port 9222)│          │        │ (port 3001) │
     └─────────────┘          │        └─────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   ScrapedLead[]  │
                    │  (same format)   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │     Database     │
                    │    (Supabase)    │
                    └──────────────────┘
```

---

## File Structure

```
src/lib/
├── scraper.ts              # Factory - main entry point
│                           # Exports: scrapeApollo, getScraperMode
│
├── scraper-types.ts        # Shared type definitions
│                           # Exports: ScrapedLead, ScrapeError, ScraperMode
│
├── scraper-local.ts        # Local Chrome scraper implementation
│                           # Exports: scrapeApollo
│
├── scraper-dolphin.ts      # Dolphin Anty scraper implementation
│                           # Exports: scrapeApollo
│
├── browser-manager.ts      # Original browser manager (deprecated)
│
├── browser-manager-local.ts   # Local Chrome connection manager
│                              # Exports: browserManagerLocal, BrowserManagerLocal
│
├── browser-manager-dolphin.ts # Dolphin Anty connection manager
│                              # Exports: browserManagerDolphin, BrowserManagerDolphin
│
├── dolphin-anty-client.ts  # Dolphin Anty API client
│                           # Exports: dolphinAntyClient, DolphinAntyClient
│
└── dolphin-monitor.ts      # Account health monitoring utilities
                            # Exports: checkApolloStatus, getAccountHealth

src/app/api/scrape/
├── route.ts                # Main scrape endpoint
│                           # POST /api/scrape
│
└── dolphin-status/
    └── route.ts            # Dolphin Anty status & control
                            # GET/POST /api/scrape/dolphin-status

docs/
├── ARCHITECTURE.md         # This file
├── DOLPHIN_ANTY_SETUP.md   # Dolphin Anty setup guide
└── MIGRATION.md            # Migration and transfer guide
```

---

## Scraper Selection Flow

```
1. Request arrives at /api/scrape
        │
        ▼
2. route.ts imports from scraper.ts
        │
        ▼
3. scrapeApollo() is called
        │
        ▼
4. getScraperMode() reads SCRAPER_MODE env var
        │
        ├── undefined/empty ──▶ returns 'local'
        ├── 'local' ──────────▶ returns 'local'
        └── 'dolphin' ────────▶ returns 'dolphin'
        │
        ▼
5. getScraper() returns the appropriate scraper function
        │
        ├── 'local' ──▶ scrapeApolloLocal from scraper-local.ts
        │              └── Uses browserManagerLocal
        │                  └── Connects to Chrome on port 9222
        │
        └── 'dolphin' ─▶ scrapeApolloDolphin from scraper-dolphin.ts
                        └── Uses browserManagerDolphin
                            └── Connects via Dolphin Anty API
        │
        ▼
6. Scraper executes and returns ScrapedLead[]
        │
        ▼
7. route.ts saves leads to database
```

---

## Module Responsibilities

### scraper.ts (Factory)

**Purpose**: Central entry point and mode selection

**Responsibilities**:
- Determine active scraper mode from environment
- Provide conflict prevention checks
- Export unified `scrapeApollo()` function
- Validate configuration

**Key Functions**:
- `getScraperMode()`: Returns current mode ('local' or 'dolphin')
- `getScraper()`: Returns appropriate scraper function
- `scrapeApollo()`: Main entry point, delegates to selected scraper
- `validateScraperConfig()`: Validates configuration

### scraper-types.ts

**Purpose**: Shared type definitions

**Types**:
- `ScrapedLead`: Lead data structure
- `ScrapeError`: Error tracking
- `ScraperMode`: 'local' | 'dolphin'
- `ScraperFunction`: Function signature for scrapers

### scraper-local.ts / scraper-dolphin.ts

**Purpose**: Scraper implementations

**Responsibilities**:
- Connect to browser (local Chrome or Dolphin Anty)
- Navigate to Apollo URLs
- Extract lead data from pages
- Handle pagination
- Return `ScrapedLead[]`

**Contract**: Both must export:
```typescript
export async function scrapeApollo(
  url: string, 
  pages?: number
): Promise<ScrapedLead[]>
```

### browser-manager-local.ts / browser-manager-dolphin.ts

**Purpose**: Browser connection management

**Responsibilities**:
- Establish browser connections
- Handle reconnection and retries
- Manage browser lifecycle
- Detect conflicts

### dolphin-anty-client.ts

**Purpose**: Dolphin Anty API client

**Responsibilities**:
- Communicate with Dolphin Anty local API
- Start/stop browser profiles
- Get WebSocket endpoints
- Check profile status

### dolphin-monitor.ts

**Purpose**: Account health monitoring

**Responsibilities**:
- Check Apollo login status
- Detect Cloudflare challenges
- Monitor rate limiting
- Provide health checks

---

## Conflict Prevention

### Why Conflicts Occur

Running both scrapers simultaneously can cause:
- Port conflicts (both trying to use Chrome)
- Session conflicts (both accessing Apollo)
- Resource exhaustion
- Unpredictable behavior

### Prevention Mechanisms

1. **Environment Variable Control**
   - Only one mode is active at a time
   - Set via `SCRAPER_MODE`

2. **Startup Validation**
   - Factory checks for conflicts at startup
   - Warns if local Chrome is running in Dolphin mode

3. **Singleton Pattern**
   - Both browser managers use singleton pattern
   - Ensures only one connection per mode

4. **Mode Tracking**
   - API response includes `scraperMode`
   - Database records include `scraper_mode` field

### Validation Code

```typescript
// In scraper.ts
async function checkForConflicts(mode: ScraperMode) {
    if (mode === 'dolphin') {
        const localManager = BrowserManagerLocal.getInstance();
        const chromeRunning = await localManager.isChromeRunning();
        
        if (chromeRunning) {
            return {
                hasConflict: true,
                warning: 'Local Chrome is running while using Dolphin mode'
            };
        }
    }
    return { hasConflict: false };
}
```

---

## Compatibility Guarantees

### Type Safety

Both scrapers use shared types from `scraper-types.ts`:

```typescript
// All scrapers must return this exact type
export type ScrapedLead = {
    first_name: string;
    last_name: string;
    title: string;
    company_name: string;
    company_linkedin: string;
    location: string;
    company_size: string;
    industry: string;
    website: string;
    keywords: string[];
    email?: string;
    phone_numbers?: string[];
    linkedin_url?: string;
};
```

### Function Signature

All scrapers export the same function signature:

```typescript
(url: string, pages?: number) => Promise<ScrapedLead[]>
```

### Database Schema

All fields map directly to the `leads` table:

| ScrapedLead Field | Database Column |
|-------------------|-----------------|
| first_name | first_name |
| last_name | last_name |
| title | title |
| company_name | company_name |
| company_linkedin | company_linkedin |
| location | location |
| company_size | company_size |
| industry | industry |
| website | website |
| keywords | keywords |
| email | email |
| phone_numbers | phone_numbers |
| linkedin_url | linkedin_url |

### Downstream Compatibility

No changes needed in:
- **Enrichment system**: Reads from database
- **PlusVibe integration**: Reads from database
- **UI components**: Reads from database
- **Export functionality**: Reads from database

---

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SCRAPER_MODE` | Scraper to use | `local` | No |
| `DOLPHIN_ANTY_API_URL` | Dolphin Anty API URL | `http://localhost:3001` | For dolphin |
| `DOLPHIN_ANTY_PROFILE_ID` | Dolphin Anty profile ID | - | For dolphin |

### Mode-Specific Requirements

**Local Mode** (`SCRAPER_MODE=local` or unset):
- Chrome running with `--remote-debugging-port=9222`
- Logged into Apollo in Chrome

**Dolphin Mode** (`SCRAPER_MODE=dolphin`):
- Dolphin Anty running
- `DOLPHIN_ANTY_PROFILE_ID` set
- Profile configured with Apollo logged in

---

## Data Flow

```
1. User triggers scrape via UI
        │
        ▼
2. POST /api/scrape with URL and options
        │
        ▼
3. Auth check (user must be logged in)
        │
        ▼
4. Create scrape record in database (status: 'running')
        │
        ▼
5. Call scrapeApollo(url, pages)
        │
        ▼
6. Browser connects and navigates to URL
        │
        ▼
7. Extract lead data from each row
        │
        ▼
8. Return ScrapedLead[] array
        │
        ▼
9. Validate and filter leads
        │
        ▼
10. Batch insert leads into database
        │
        ▼
11. Update scrape record (status: 'completed')
        │
        ▼
12. Return success response with count
```

---

## Extending the System

### Adding a New Scraper

1. Create `scraper-{name}.ts`:
   ```typescript
   import { ScrapedLead } from './scraper-types';
   
   export async function scrapeApollo(
     url: string, 
     pages: number = 1
   ): Promise<ScrapedLead[]> {
     // Implementation
   }
   ```

2. Create `browser-manager-{name}.ts`:
   ```typescript
   export class BrowserManager{Name} {
     async getBrowser(): Promise<Browser> {
       // Implementation
     }
   }
   ```

3. Update `scraper.ts`:
   ```typescript
   import { scrapeApollo as scrapeApollo{Name} } from './scraper-{name}';
   
   // Add to ScraperMode type
   export type ScraperMode = 'local' | 'dolphin' | '{name}';
   
   // Add to getScraper()
   case '{name}':
     return scrapeApollo{Name};
   ```

4. Add environment variables to documentation

### Adding New Data Fields

1. Update `ScrapedLead` type in `scraper-types.ts`
2. Update database schema (add column)
3. Update extraction logic in both scrapers
4. Update `batchSaveLeads` in route.ts

---

## Related Documentation

- [Dolphin Anty Setup Guide](./DOLPHIN_ANTY_SETUP.md)
- [Migration Guide](./MIGRATION.md)


