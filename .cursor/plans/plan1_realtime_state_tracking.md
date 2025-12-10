---
name: Plan 1 - Real-time Scraper State Tracking
overview: Add real-time state tracking so users can see scraper progress, current page, queue position, and lead count in the UI.
todos:
  - id: db-schema
    content: Add scraper state fields to scrapes table (current_page, status, rows_extracted)
    status: completed
  - id: state-function
    content: Create updateScrapeState() helper function in scraper-gologin.ts
    status: completed
  - id: state-calls
    content: Add state update calls throughout scraper flow (nav, extract, paginate, complete)
    status: completed
  - id: api-enhance
    content: Update /api/scrape/[id]/status to return detailed state and queue position
    status: completed
  - id: ui-progress
    content: Update frontend scrape status to show real-time progress
    status: completed
---

# Plan 1: Real-time Scraper State Tracking

## Goal
Let users see live progress of their scrape: which page, how many extracted, queue position.

## Database Schema Changes

Add fields to `scrapes` table:

```sql
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS current_page integer DEFAULT 0;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS total_pages integer DEFAULT 1;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS scraper_status text DEFAULT 'queued';
-- scraper_status: 'queued' | 'navigating' | 'extracting' | 'paginating' | 'completed' | 'failed'
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS rows_extracted integer DEFAULT 0;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS state_updated_at timestamptz;
```

## Backend Changes

### File: [src/lib/scraper-gologin.ts](src/lib/scraper-gologin.ts)

Add helper function at top of file (after imports):

```typescript
async function updateScrapeState(scrapeId: string | undefined, state: {
    scraper_status?: string;
    current_page?: number;
    total_pages?: number;
    rows_extracted?: number;
}) {
    if (!scrapeId) return;
    await supabaseCancel.from('scrapes').update({
        ...state,
        state_updated_at: new Date().toISOString()
    }).eq('id', scrapeId);
}
```

Add state update calls at these locations in `scrapeApollo()`:

1. **Before navigation** (around line 488):
```typescript
await updateScrapeState(scrapeId, { scraper_status: 'navigating' });
console.log(`[GOLOGIN-SCRAPER] Navigating (attempt ${attempt})...`);
```

2. **Before extraction loop** (around line 520):
```typescript
await updateScrapeState(scrapeId, { 
    scraper_status: 'extracting', 
    current_page: currentPage, 
    total_pages: pages 
});
console.log(`[GOLOGIN-SCRAPER] Page ${currentPage}/${pages}...`);
```

3. **After extraction** (after extractAllLeadsFromPage call):
```typescript
await updateScrapeState(scrapeId, { rows_extracted: allLeads.length });
```

4. **Before pagination** (around line 650):
```typescript
await updateScrapeState(scrapeId, { scraper_status: 'paginating' });
```

5. **On completion** (around line 665):
```typescript
await updateScrapeState(scrapeId, { scraper_status: 'completed', rows_extracted: allLeads.length });
```

6. **On error** (in catch block):
```typescript
await updateScrapeState(scrapeId, { scraper_status: 'failed' });
```

### File: [src/app/api/scrape/[id]/status/route.ts](src/app/api/scrape/[id]/status/route.ts)

Update the response to include new state fields:

```typescript
// In the GET handler, after fetching scrape
return corsJsonResponse({
    id: scrape.id,
    status: scrape.status,
    scraper_status: scrape.scraper_status || 'queued',
    current_page: scrape.current_page || 0,
    total_pages: scrape.total_pages || 1,
    rows_extracted: scrape.rows_extracted || 0,
    total_leads: scrape.total_leads,
    name: scrape.name,
    url: scrape.url,
    created_at: scrape.created_at,
    queue_position: queuePosition // see below
}, request);
```

Add queue position calculation:

```typescript
// Get queue position if status is 'queued'
let queuePosition = null;
if (scrape.status === 'queued') {
    const { data: queueItem } = await supabase
        .from('scrape_queue')
        .select('created_at')
        .eq('scrape_id', scrapeId)
        .single();
    
    if (queueItem) {
        const { count } = await supabase
            .from('scrape_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
            .lte('created_at', queueItem.created_at);
        queuePosition = count || 1;
    }
}
```

## Frontend Changes

Find the scrape status polling component and update to display:

1. **Progress indicator**:
   - If `scraper_status === 'queued'`: "Position {queue_position} in queue"
   - If `scraper_status === 'navigating'`: "Navigating to Apollo..."
   - If `scraper_status === 'extracting'`: "Extracting page {current_page} of {total_pages}"
   - If `scraper_status === 'paginating'`: "Moving to next page..."

2. **Lead count**: "{rows_extracted} leads found"

3. **Progress bar**: `(current_page / total_pages) * 100`%

## Files to Modify Summary

1. `src/lib/scraper-gologin.ts` - Add updateScrapeState() and calls
2. `src/app/api/scrape/[id]/status/route.ts` - Return enhanced state
3. Frontend scrape status component - Display progress
4. Database migration - Add new columns
