/**
 * Dolphin Anty Scraper - Apollo scraping using Dolphin Anty anti-detect browser
 * 
 * This module handles scraping Apollo.io using Dolphin Anty browser profiles.
 * It provides enhanced anonymity and Cloudflare bypass through anti-detect
 * fingerprinting and residential proxy support.
 * 
 * PREREQUISITES:
 * 1. Dolphin Anty installed and running
 * 2. Browser profile created with Apollo logged in
 * 3. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - SCRAPER_MODE=dolphin (to enable this scraper)
 * - DOLPHIN_ANTY_API_URL: API base URL (default: http://localhost:3001)
 * - DOLPHIN_ANTY_PROFILE_ID: Profile ID to use for scraping
 * 
 * FUNCTION SIGNATURE (must match all scrapers):
 * scrapeApollo(url: string, pages?: number): Promise<ScrapedLead[]>
 * 
 * @see docs/ARCHITECTURE.md for system design documentation
 * @see docs/DOLPHIN_ANTY_SETUP.md for setup instructions
 */

import { browserManagerDolphin } from './browser-manager-dolphin';
import { Page, ElementHandle } from 'puppeteer';
import type { ScrapedLead, ScrapeError } from './scraper-types';

// Re-export types for convenience
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
    const companySelectors = [
        'a[href*="/organizations/"]',
        'a[href*="/accounts/"]',
        'a[data-link-type="company"]',
        '[data-cy="company-name"] a',
        'a[class*="company"]'
    ];
    
    const companyEl = await findBySelectors(row, companySelectors);
    const name = await getTextContent(page, companyEl);
    
    const linkedinSelectors = [
        'a[href*="linkedin.com/company"]',
        'a[aria-label="linkedin link"][href*="linkedin.com/company"]',
        'a[aria-label*="LinkedIn"][href*="company"]'
    ];
    const linkedinEl = await findBySelectors(row, linkedinSelectors);
    const linkedin = await getHref(page, linkedinEl);
    
    const websiteSelectors = [
        'a[aria-label="website link"]',
        'a[aria-label*="website"]',
        'a[href^="http"]:not([href*="apollo.io"]):not([href*="linkedin.com"]):not([href*="twitter.com"]):not([href*="facebook.com"])'
    ];
    const websiteEl = await findBySelectors(row, websiteSelectors);
    const website = await getHref(page, websiteEl);
    
    return { name, linkedin, website };
}

/**
 * Extract phone numbers from a row
 */
async function extractPhoneNumbers(page: Page, row: ElementHandle): Promise<string[]> {
    const phones: string[] = [];
    
    const telLinks = await row.$$('a[href^="tel:"]');
    for (const link of telLinks) {
        const phone = await getTextContent(page, link);
        if (phone && phone !== 'Access Mobile') {
            phones.push(phone);
        }
    }
    
    return phones;
}

/**
 * Extract data from cells by index with validation
 */
async function extractCellData(page: Page, cells: ElementHandle[], index: number): Promise<string> {
    if (index >= cells.length) return '';
    return await getTextContent(page, cells[index]);
}

/**
 * Scrape leads from Apollo.io using Dolphin Anty
 * 
 * This function scrapes lead data from an Apollo search results page.
 * It uses Dolphin Anty browser for enhanced anonymity and Cloudflare bypass.
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
    console.log('[DOLPHIN-SCRAPER] === Starting Apollo Scrape (Dolphin Anty Mode) ===');
    console.log(`[DOLPHIN-SCRAPER] Target URL: ${url}`);
    console.log(`[DOLPHIN-SCRAPER] Pages to scrape: ${pages}`);

    let page: Page | null = null;
    const allLeads: ScrapedLead[] = [];
    const errors: ScrapeError[] = [];

    try {
        console.log('[DOLPHIN-SCRAPER] Getting Dolphin Anty browser connection...');
        const browser = await browserManagerDolphin.getBrowser();

        console.log('[DOLPHIN-SCRAPER] Creating new page...');
        page = await browser.newPage();
        page.setDefaultTimeout(SCRAPE_TIMEOUT);

        // Set a realistic viewport (Dolphin Anty may override this with profile settings)
        await page.setViewport({ width: 1366, height: 768 });

        console.log(`[DOLPHIN-SCRAPER] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: SCRAPE_TIMEOUT });

        // Check for Cloudflare challenge
        const pageContent = await page.content();
        if (pageContent.includes('challenge-platform') || pageContent.includes('cf-browser-verification')) {
            console.log('[DOLPHIN-SCRAPER] WARNING: Cloudflare challenge detected. Waiting...');
            await humanDelay(5000, 10000);
            // Re-navigate after challenge
            await page.goto(url, { waitUntil: 'networkidle2', timeout: SCRAPE_TIMEOUT });
        }

        // Initial human pause
        await humanDelay(2000, 4000);

        for (let currentPage = 1; currentPage <= pages; currentPage++) {
            console.log(`[DOLPHIN-SCRAPER] Processing page ${currentPage}/${pages}...`);

            // Wait for table - try multiple selectors
            const tableSelectors = [
                'div[role="treegrid"]',
                'table[role="grid"]',
                '[data-cy="people-table"]',
                '.zp_tZMWg'
            ];
            
            let tableFound = false;
            for (const selector of tableSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 10000 });
                    console.log(`[DOLPHIN-SCRAPER] Table found with selector: ${selector}`);
                    tableFound = true;
                    break;
                } catch {
                    continue;
                }
            }
            
            if (!tableFound) {
                // Take screenshot for debugging
                console.log('[DOLPHIN-SCRAPER] Table not found - checking page state...');
                const currentUrl = page.url();
                console.log(`[DOLPHIN-SCRAPER] Current URL: ${currentUrl}`);
                
                if (currentUrl.includes('/login') || currentUrl.includes('/sign')) {
                    throw new Error('Not logged into Apollo. Please log in using the Dolphin Anty browser profile.');
                }
                
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
                    console.log(`[DOLPHIN-SCRAPER] Found ${rows.length} rows with selector: ${selector}`);
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
                        console.log(`[DOLPHIN-SCRAPER] Row ${rowIndex}: Insufficient cells (${cells.length}), skipping`);
                        continue;
                    }

                    // Extract person data
                    const personData = await extractPersonData(page, row);
                    if (!personData || !personData.name) {
                        console.log(`[DOLPHIN-SCRAPER] Row ${rowIndex}: No person name found, skipping`);
                        continue;
                    }

                    const [firstName, ...lastNameParts] = personData.name.split(' ');
                    const lastName = lastNameParts.join(' ');

                    // Extract company data
                    const companyData = await extractCompanyData(page, row);

                    // Extract phone numbers
                    const phoneNumbers = await extractPhoneNumbers(page, row);

                    // Extract additional fields from cells
                    let title = '';
                    let location = '';
                    let companySize = '';
                    let industry = '';
                    let keywords: string[] = [];

                    if (cells.length >= 3) {
                        title = await extractCellData(page, cells, 2);
                    }
                    
                    let companyName = companyData.name;
                    if (!companyName && cells.length >= 4) {
                        companyName = await extractCellData(page, cells, 3);
                    }

                    if (cells.length >= 10) {
                        location = await extractCellData(page, cells, 9);
                    }

                    if (cells.length >= 11) {
                        companySize = await extractCellData(page, cells, 10);
                    }

                    if (cells.length >= 12) {
                        industry = await extractCellData(page, cells, 11);
                    }

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
                    console.error(`[DOLPHIN-SCRAPER] Error parsing row ${rowIndex}:`, errorMessage);
                    errors.push({
                        row: rowIndex,
                        message: errorMessage,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Pagination with longer delays for anti-detection
            if (currentPage < pages) {
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
                        // Longer delays for Dolphin Anty to appear more human-like
                        const delay = Math.floor(Math.random() * 7000) + 4000; // 4-11s delay
                        console.log(`[DOLPHIN-SCRAPER] Waiting ${delay}ms before next page...`);
                        await new Promise(r => setTimeout(r, delay));

                        await nextBtn.click();
                        await humanDelay(4000, 6000); // Wait for load
                    } else {
                        console.log('[DOLPHIN-SCRAPER] Next button is disabled, stopping pagination');
                        break;
                    }
                } else {
                    console.log('[DOLPHIN-SCRAPER] Next button not found, stopping pagination');
                    break;
                }
            }
        }

        console.log(`[DOLPHIN-SCRAPER] ✓ Scraped ${allLeads.length} leads (${errors.length} row errors)`);
        return allLeads;

    } catch (error) {
        console.error('[DOLPHIN-SCRAPER] Scrape failed:', error);
        throw error;
    } finally {
        if (page) await page.close();
    }
}


