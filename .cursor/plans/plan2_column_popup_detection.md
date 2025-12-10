---
name: Plan 2 - Column Detection & Popup Handling
overview: Detect Apollo table columns to ensure required data is visible, and auto-dismiss/detect popups that interfere with scraping.
todos:
  - id: column-detect
    content: Add detectVisibleColumns() function to scan Apollo table headers
    status: pending
  - id: column-warn
    content: Warn user if required columns (Company Links) are hidden
    status: pending
  - id: popup-dismiss
    content: Add dismissPopups() function to auto-close tooltips/info modals
    status: pending
  - id: popup-detect
    content: Add detectBlockingIssues() for upgrade modals, login, rate limits
    status: pending
  - id: integrate
    content: Call detection functions before extraction, update state with issues
    status: pending
---

# Plan 2: Column Detection & Popup Handling

## Goal
Handle Apollo's variable UI state - detect if required columns are visible and auto-dismiss/detect popups that block scraping.

## Column Detection

### File: [src/lib/scraper-gologin.ts](src/lib/scraper-gologin.ts)

Add column detection function:

```typescript
async function detectVisibleColumns(page: Page): Promise<{
    columns: string[];
    hasRequiredColumns: boolean;
    missingColumns: string[];
}> {
    const columns = await page.evaluate(() => {
        const headers: string[] = [];
        // Apollo uses role="columnheader" for table headers
        const headerCells = document.querySelectorAll('[role="columnheader"]');
        headerCells.forEach(cell => {
            const text = cell.textContent?.trim();
            if (text) headers.push(text);
        });
        return headers;
    });
    
    // Required columns for full extraction
    const requiredColumns = ['Company · Links']; // Contains website domain
    const missingColumns = requiredColumns.filter(col => 
        !columns.some(c => c.includes(col.replace('·', '').trim()) || c.includes(col))
    );
    
    return {
        columns,
        hasRequiredColumns: missingColumns.length === 0,
        missingColumns
    };
}
```

### Usage
Call after table is found, before extraction:

```typescript
const columnInfo = await detectVisibleColumns(page);
if (!columnInfo.hasRequiredColumns) {
    console.warn(`[GOLOGIN-SCRAPER] Missing columns: ${columnInfo.missingColumns.join(', ')}`);
    await updateScrapeState(scrapeId, { 
        last_issue: `Missing columns: ${columnInfo.missingColumns.join(', ')}. Enable "Company · Links" column in Apollo.`
    });
    // Continue anyway - extract what we can
}
```

## Popup Detection & Dismissal

### Add dismissPopups() function:

```typescript
async function dismissPopups(page: Page): Promise<string[]> {
    const dismissed: string[] = [];
    
    // Common close button selectors for Apollo tooltips/modals
    const closeSelectors = [
        '[aria-label="Close"]',
        '[aria-label="close"]',
        'button[aria-label="Close modal"]',
        '.tooltip-close',
        '[data-testid="close-button"]',
        'button:has(svg[data-icon="xmark"])',
        'button:has(svg[data-icon="times"])',
        // Apollo-specific
        '[data-cy="dismiss"]',
        '[data-cy="close"]',
        '.apollo-modal-close',
    ];
    
    for (const selector of closeSelectors) {
        try {
            const buttons = await page.$$(selector);
            for (const btn of buttons) {
                const isVisible = await btn.isVisible();
                if (isVisible) {
                    await btn.click();
                    dismissed.push(selector);
                    await page.waitForTimeout(500); // Let modal animate out
                }
            }
        } catch { continue; }
    }
    
    // Also try clicking outside modals (backdrop click)
    try {
        const backdrop = await page.$('.modal-backdrop, [data-testid="modal-backdrop"]');
        if (backdrop) {
            await backdrop.click();
            dismissed.push('backdrop');
        }
    } catch { }
    
    return dismissed;
}
```

### Add detectBlockingIssues() function:

```typescript
async function detectBlockingIssues(page: Page): Promise<{
    blocked: boolean;
    issue: string | null;
    issueType: 'login' | 'upgrade' | 'rate_limit' | 'captcha' | null;
}> {
    const url = page.url();
    const content = await page.content();
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    
    // Check for login redirect
    if (url.includes('/login') || url.includes('/sign')) {
        return { blocked: true, issue: 'Session expired - please log into Apollo in GoLogin profile', issueType: 'login' };
    }
    
    // Check for upgrade modal
    const upgradeKeywords = ['upgrade', 'pricing', 'subscribe', 'plan limit', 'credit limit'];
    if (upgradeKeywords.some(kw => bodyText.toLowerCase().includes(kw))) {
        const hasUpgradeModal = await page.$('[data-testid="upgrade-modal"], [class*="upgrade"], [class*="pricing"]');
        if (hasUpgradeModal) {
            return { blocked: true, issue: 'Apollo upgrade modal detected - may have hit plan limits', issueType: 'upgrade' };
        }
    }
    
    // Check for rate limiting
    const rateLimitKeywords = ['too many requests', 'slow down', 'rate limit', 'try again later'];
    if (rateLimitKeywords.some(kw => bodyText.toLowerCase().includes(kw))) {
        return { blocked: true, issue: 'Rate limited by Apollo - waiting may help', issueType: 'rate_limit' };
    }
    
    // Check for Cloudflare/CAPTCHA
    if (content.includes('challenge-platform') || content.includes('cf-browser-verification') || 
        bodyText.includes('verify you are human')) {
        return { blocked: true, issue: 'CAPTCHA/verification required', issueType: 'captcha' };
    }
    
    return { blocked: false, issue: null, issueType: null };
}
```

## Integration into Scraper Flow

In `scrapeApollo()` function, after navigation and before extraction:

```typescript
// After page loads, before looking for table
console.log('[GOLOGIN-SCRAPER] Dismissing any popups...');
const dismissedPopups = await dismissPopups(page);
if (dismissedPopups.length > 0) {
    console.log(`[GOLOGIN-SCRAPER] Dismissed popups: ${dismissedPopups.join(', ')}`);
}

// Check for blocking issues
const blockCheck = await detectBlockingIssues(page);
if (blockCheck.blocked) {
    await updateScrapeState(scrapeId, { 
        scraper_status: 'blocked',
        last_issue: blockCheck.issue 
    });
    throw new Error(blockCheck.issue || 'Blocked by Apollo');
}

// After table found, check columns
const columnInfo = await detectVisibleColumns(page);
console.log(`[GOLOGIN-SCRAPER] Detected columns: ${columnInfo.columns.join(', ')}`);
if (!columnInfo.hasRequiredColumns) {
    await updateScrapeState(scrapeId, { 
        last_issue: `Missing columns for full extraction: ${columnInfo.missingColumns.join(', ')}`
    });
}
```

## State Updates for Issues

When issues are detected, the state is updated so the UI (from Plan 1) can display them:
- `scraper_status: 'blocked'` - shows red status
- `last_issue: 'description'` - shows warning/error message with instructions




