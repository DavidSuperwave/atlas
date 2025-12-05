/**
 * Local Scraper - Apollo scraping using local Chrome browser
 * 
 * This module handles scraping Apollo.io using a local Chrome browser
 * with remote debugging enabled. It's the original implementation
 * preserved for local development and personal use.
 * 
 * USAGE:
 * 1. Start Chrome with: --remote-debugging-port=9222
 * 2. Login to Apollo in the browser
 * 3. Call scrapeApollo() with an Apollo search URL
 * 
 * ENVIRONMENT:
 * - Used when SCRAPER_MODE is 'local' or not set (default)
 * 
 * FUNCTION SIGNATURE (must match all scrapers):
 * scrapeApollo(url: string, pages?: number): Promise<ScrapedLead[]>
 * 
 * @see docs/ARCHITECTURE.md for system design documentation
 */

import { browserManagerLocal } from './browser-manager-local';
import { Page, ElementHandle } from 'puppeteer';
import type { ScrapedLead, ScrapeError } from './scraper-types';

// Re-export types for backward compatibility
export type { ScrapedLead, ScrapeError };

/** Timeout for scrape operations in milliseconds */
const SCRAPE_TIMEOUT = 120000; // 2 minutes per page/action safety

/**
 * Human-like delay between actions
 * Adds randomness to avoid detection
 */
const humanDelay = (min: number, max: number) =>
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

/**
 * Helper to split full name into first and last name
 * Handles prefixes, suffixes, and multipart last names
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
    if (!fullName) return { firstName: '', lastName: '' };

    let name = fullName.trim();

    // Remove common prefixes
    const prefixes = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Rev.', 'Capt.', 'Lt.', 'Cmdr.', 'Col.', 'Gen.'];
    for (const prefix of prefixes) {
        if (name.startsWith(prefix + ' ')) {
            name = name.substring(prefix.length + 1).trim();
        }
    }

    // Remove common suffixes
    const suffixes = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'Ph.D.', 'MD', 'Esq.'];
    for (const suffix of suffixes) {
        if (name.endsWith(' ' + suffix)) {
            name = name.substring(0, name.length - suffix.length - 1).trim();
        }
    }

    const parts = name.split(/\s+/);
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '' };
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');

    return { firstName, lastName };
}

/**
 * Extract text content from an element, with fallback
 */
async function getTextContent(page: Page, element: ElementHandle | null): Promise<string> {
    if (!element) return '';
    try {
        return await page.evaluate(el => el.textContent?.trim() || '', element);
    } catch {
        return '';
    }
}

/**
 * Extract href attribute from an element
 */
async function getHref(page: Page, element: ElementHandle | null): Promise<string> {
    if (!element) return '';
    try {
        return await page.evaluate(el => el.getAttribute('href') || '', element);
    } catch {
        return '';
    }
}

/**
 * Find element by multiple selectors (tries each in order)
 * Useful for handling Apollo's changing class names
 */
async function findBySelectors(parent: ElementHandle, selectors: string[]): Promise<ElementHandle | null> {
    for (const selector of selectors) {
        try {
            const el = await parent.$(selector);
            if (el) return el;
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Extract person data from a row using semantic selectors
 */
async function extractPersonData(page: Page, row: ElementHandle): Promise<{ name: string; linkedinUrl: string } | null> {
    // Try multiple selectors for person name/link
    const personSelectors = [
        'a[href*="/people/"]',
        'a[data-link-type="person"]',
        '[data-cy="person-name"] a',
        'a[class*="person"]'
    ];

    const nameEl = await findBySelectors(row, personSelectors);
    if (!nameEl) return null;

    const name = await getTextContent(page, nameEl);
    const linkedinUrl = await getHref(page, nameEl);

    if (!name) return null;

    return { name, linkedinUrl };
}

/**
 * Extract company data from a row using semantic selectors
 */
async function extractCompanyData(page: Page, row: ElementHandle): Promise<{ name: string; linkedin: string; website: string }> {
    // Try multiple selectors for company name/link
    const companySelectors = [
        'a[href*="/organizations/"]',
        'a[href*="/accounts/"]',
        'a[data-link-type="company"]',
        '[data-cy="company-name"] a',
        'a[class*="company"]'
    ];

    const companyEl = await findBySelectors(row, companySelectors);
    const name = await getTextContent(page, companyEl);

    // Try to find company LinkedIn
    const linkedinSelectors = [
        'a[href*="linkedin.com/company"]',
        'a[aria-label="linkedin link"][href*="linkedin.com/company"]',
        'a[aria-label*="LinkedIn"][href*="company"]'
    ];
    const linkedinEl = await findBySelectors(row, linkedinSelectors);
    const linkedin = await getHref(page, linkedinEl);

    // Try to find company website
    // In recent Apollo versions, this is often in a "Links" cell at the end (index 13/14)
    // We look for aria-label="website link" globally in the row to be safe
    const websiteSelectors = [
        'a[aria-label="website link"]',
        'a[aria-label*="website"]',
        'a[href^="http"]:not([href*="apollo.io"]):not([href*="linkedin.com"]):not([href*="twitter.com"]):not([href*="facebook.com"]):not([href*="google.com"])'
    ];
    const websiteEl = await findBySelectors(row, websiteSelectors);
    const website = await getHref(page, websiteEl);

    return { name, linkedin, website };
}

/**
 * Extract phone numbers from a row
 */
/**
 * Extract phone numbers from a row
 * @deprecated Phone number extraction removed per user request
 */
async function extractPhoneNumbers(page: Page, row: ElementHandle): Promise<string[]> {
    return [];
}

/**
 * Extract data from cells by index with validation
 */
async function extractCellData(page: Page, cells: ElementHandle[], index: number): Promise<string> {
    if (index >= cells.length) return '';
    return await getTextContent(page, cells[index]);
}

/**
 * Scrape leads from Apollo.io
 * 
 * This function scrapes lead data from an Apollo search results page.
 * It uses the local Chrome browser with remote debugging.
 * 
 * FUNCTION SIGNATURE (must match all scrapers):
 * @param url - Apollo search URL to scrape
 * @param pages - Number of pages to scrape (default: 1)
 * @returns Promise<ScrapedLead[]> - Array of scraped leads
 * 
 * @example
 * const leads = await scrapeApollo('https://app.apollo.io/#/people?...', 3);
 */
export async function scrapeApollo(url: string, pages: number = 1): Promise<ScrapedLead[]> {
    console.log('[LOCAL-SCRAPER] === Starting Apollo Scrape (Local Chrome Mode) ===');
    console.log(`[LOCAL-SCRAPER] Target URL: ${url}`);
    console.log(`[LOCAL-SCRAPER] Pages to scrape: ${pages}`);

    let page: Page | null = null;
    const allLeads: ScrapedLead[] = [];
    const errors: ScrapeError[] = [];

    try {
        console.log('[LOCAL-SCRAPER] Getting browser connection...');
        const browser = await browserManagerLocal.getBrowser();

        console.log('[LOCAL-SCRAPER] Creating new page...');
        page = await browser.newPage();
        page.setDefaultTimeout(SCRAPE_TIMEOUT);

        // Set a realistic viewport
        await page.setViewport({ width: 1366, height: 768 });

        console.log(`[LOCAL-SCRAPER] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: SCRAPE_TIMEOUT });

        // Initial human pause
        await humanDelay(2000, 4000);

        for (let currentPage = 1; currentPage <= pages; currentPage++) {
            console.log(`[LOCAL-SCRAPER] Processing page ${currentPage}/${pages}...`);

            // Wait for table - try multiple selectors
            const tableSelectors = [
                'div[role="treegrid"]',
                'table[role="grid"]',
                '[data-cy="people-table"]',
                '.zp_tZMWg' // Apollo-specific class (may change)
            ];

            let tableFound = false;
            for (const selector of tableSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 10000 });
                    console.log(`[LOCAL-SCRAPER] Table found with selector: ${selector}`);
                    tableFound = true;
                    break;
                } catch {
                    continue;
                }
            }

            if (!tableFound) {
                throw new Error('Apollo table not found. Ensure you are logged in and on a valid search page.');
            }

            // Random scroll to simulate reading
            await page.evaluate(() => {
                window.scrollBy(0, 300);
            });
            await humanDelay(500, 1500);

            // Get rows - try multiple selectors
            let rows: ElementHandle[] = [];
            const rowSelectors = [
                'div[role="treegrid"] div[role="row"]',
                'table[role="grid"] tr',
                '[data-cy="people-table-row"]'
            ];

            for (const selector of rowSelectors) {
                rows = await page.$$(selector);
                if (rows.length > 0) {
                    console.log(`[LOCAL-SCRAPER] Found ${rows.length} rows with selector: ${selector}`);
                    break;
                }
            }

            let rowIndex = 0;
            for (const row of rows) {
                rowIndex++;
                try {
                    // Check for checkbox to ensure it's a data row (not header)
                    const hasCheckbox = await row.$('input[type="checkbox"]');
                    if (!hasCheckbox) continue;

                    // Get all cells in the row
                    const cells = await row.$$('div[role="cell"], td');

                    // Validate minimum cells
                    if (cells.length < 3) {
                        console.log(`[LOCAL-SCRAPER] Row ${rowIndex}: Insufficient cells (${cells.length}), skipping`);
                        continue;
                    }

                    // --- Extract using semantic selectors first, fall back to cell indices ---

                    // Person data (name, LinkedIn)
                    const personData = await extractPersonData(page, row);
                    if (!personData || !personData.name) {
                        console.log(`[LOCAL-SCRAPER] Row ${rowIndex}: No person name found, skipping`);
                        continue;
                    }

                    // Robust name splitting
                    const { firstName, lastName } = splitName(personData.name);

                    // Company data
                    const companyData = await extractCompanyData(page, row);

                    // Phone numbers
                    const phoneNumbers = await extractPhoneNumbers(page, row);

                    // For cell-based extraction, we need to handle variable column layouts
                    // These are fallback extractions if semantic selectors didn't find data
                    let title = '';
                    let location = '';
                    let companySize = '';
                    let industry = '';
                    let keywords: string[] = [];

                    // Try to extract from cells by position (with bounds checking)
                    // Common Apollo layout (2024/2025): 
                    // 0:Checkbox, 1:Name, 2:Title, 3:Company, ... 7:Person LinkedIn, ... 13:Company Links (Website/LinkedIn)

                    if (cells.length >= 3) {
                        title = await extractCellData(page, cells, 2);
                    }

                    // If company name wasn't found semantically, try cell 3
                    let companyName = companyData.name;
                    if (!companyName && cells.length >= 4) {
                        companyName = await extractCellData(page, cells, 3);
                    }

                    // Location - try cell 9 if available
                    if (cells.length >= 10) {
                        location = await extractCellData(page, cells, 9);
                    }

                    // Company size - try cell 10 if available
                    if (cells.length >= 11) {
                        companySize = await extractCellData(page, cells, 10);
                    }

                    // Industry - try cell 11 if available
                    if (cells.length >= 12) {
                        industry = await extractCellData(page, cells, 11);
                    }

                    // Keywords - try cell 12 if available
                    if (cells.length >= 13) {
                        const keywordsText = await extractCellData(page, cells, 12);
                        if (keywordsText) {
                            keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k);
                        }
                    }

                    // Build LinkedIn URL
                    let linkedinUrl = personData.linkedinUrl;
                    if (linkedinUrl && !linkedinUrl.startsWith('http')) {
                        linkedinUrl = `https://app.apollo.io${linkedinUrl}`;
                    }

                    // Add lead - ensure all fields match ScrapedLead type
                    allLeads.push({
                        first_name: firstName,
                        last_name: lastName,
                        title,
                        company_name: companyName,
                        company_linkedin: companyData.linkedin,
                        location,
                        company_size: companySize,
                        industry,
                        website: companyData.website,
                        keywords,
                        email: undefined,
                        linkedin_url: linkedinUrl,
                        phone_numbers: phoneNumbers
                    });

                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    console.error(`[LOCAL-SCRAPER] Error parsing row ${rowIndex}:`, errorMessage);
                    errors.push({
                        row: rowIndex,
                        message: errorMessage,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Pagination
            if (currentPage < pages) {
                // Try multiple selectors for next button
                const nextSelectors = [
                    'button[aria-label="Next"]',
                    'button[aria-label="next"]',
                    '[data-cy="pagination-next"]',
                    'button:has-text("Next")'
                ];

                let nextBtn: ElementHandle | null = null;
                for (const selector of nextSelectors) {
                    try {
                        nextBtn = await page.$(selector);
                        if (nextBtn) break;
                    } catch {
                        continue;
                    }
                }

                if (nextBtn) {
                    const isDisabled = await page.evaluate(el => el.hasAttribute('disabled'), nextBtn);
                    if (!isDisabled) {
                        const delay = Math.floor(Math.random() * 5000) + 3000; // 3-8s delay
                        console.log(`[LOCAL-SCRAPER] Waiting ${delay}ms before next page...`);
                        await new Promise(r => setTimeout(r, delay));

                        await nextBtn.click();
                        await humanDelay(3000, 5000); // Wait for load
                    } else {
                        console.log('[LOCAL-SCRAPER] Next button is disabled, stopping pagination');
                        break;
                    }
                } else {
                    console.log('[LOCAL-SCRAPER] Next button not found, stopping pagination');
                    break;
                }
            }
        }

        console.log(`[LOCAL-SCRAPER] ✓ Scraped ${allLeads.length} leads (${errors.length} row errors)`);
        return allLeads;

    } catch (error) {
        console.error('[LOCAL-SCRAPER] Scrape failed:', error);
        throw error;
    } finally {
        if (page) await page.close();
    }
}


