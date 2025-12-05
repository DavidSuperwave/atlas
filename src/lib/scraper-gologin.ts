/**
 * GoLogin Scraper - Apollo scraping using GoLogin cloud anti-detect browser
 * 
 * EXTRACTION STRATEGY:
 * 1. Find NAME via person link (href contains "/people/")
 * 2. Find DOMAIN via website link (aria-label="website link")
 * 3. Discard rows missing name OR domain
 */

import { getBrowserForProfile } from './browser-manager-gologin';
import { getUserProfileId, ProfileLookupResult } from './gologin-profile-manager';
import { Page } from 'puppeteer';
import type { ScrapedLead, ScrapeError } from './scraper-types';

export type { ScrapedLead, ScrapeError };

const SCRAPE_TIMEOUT = 120000;

const humanDelay = (min: number, max: number) =>
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

interface RawLeadData {
    name: string;
    title: string;
    companyName: string;
    domain: string;
    location: string;
    companySize: string;
    industry: string;
    companyLinkedin: string;
    phoneNumbers: string[];
    apolloUrl: string;
    personLinkedin: string;  // Person's LinkedIn URL (from Cell 4: Links)
    keywords: string[];      // Keywords (from Cell 9: Company · Keywords)
}

interface ExtractionDiagnostics {
    rowsFound: number;
    skippedNoName: number;
    skippedNoDomain: number;
    successfulExtractions: number;
    sampleData: string[];
    errors: string[];
    domainMethods: { [key: string]: number }; // Track which method found domains
}

async function getProfileForScrape(userId?: string): Promise<ProfileLookupResult> {
    if (userId) {
        const result = await getUserProfileId(userId);
        if (result.profileId) return result;
        if (result.error) console.warn(`[GOLOGIN-SCRAPER] ${result.error}`);
        return result;
    }

    const envProfileId = process.env.GOLOGIN_PROFILE_ID;
    if (envProfileId) {
        return { profileId: envProfileId, source: 'environment' };
    }

    return {
        profileId: '',
        source: 'none',
        error: 'No GoLogin profile configured.'
    };
}

/**
 * Extract leads from Apollo page
 * 
 * CELL MAPPING (based on Apollo's table structure):
 * Cell 0: Checkbox
 * Cell 1: Name (REQUIRED)
 * Cell 2: Job title
 * Cell 3: Company
 * Cell 4: Links (person's LinkedIn)
 * Cell 5: Company · Links (website domain - REQUIRED)
 * Cell 6: Company · Industries
 * Cell 7: Location
 * Cell 8: Company · Number of employees
 * Cell 9: Company · Keywords
 */
async function extractAllLeadsFromPage(page: Page): Promise<{ leads: RawLeadData[]; diagnostics: ExtractionDiagnostics }> {
    return await page.evaluate(() => {
        const leads: RawLeadData[] = [];
        const diagnostics: ExtractionDiagnostics = {
            rowsFound: 0,
            skippedNoName: 0,
            skippedNoDomain: 0,
            successfulExtractions: 0,
            sampleData: [],
            errors: [],
            domainMethods: {}
        };

        // Helper to extract domain from URL
        function extractDomain(url: string): string {
            if (!url) return '';
            try {
                if (url.includes('://')) {
                    const parsed = new URL(url);
                    return parsed.hostname.replace(/^www\./, '');
                }
                if (url.includes('.') && !url.includes(' ')) {
                    return url.replace(/^www\./, '').split('/')[0].trim();
                }
            } catch { }
            return '';
        }

        // Find the table
        const table = document.querySelector('div[role="treegrid"]') ||
            document.querySelector('table[role="grid"]') ||
            document.querySelector('table');

        if (!table) {
            diagnostics.errors.push('No table found');
            return { leads, diagnostics };
        }

        const allRows = table.querySelectorAll('[role="row"], tr');
        diagnostics.rowsFound = allRows.length;

        for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++) {
            const row = allRows[rowIndex];

            try {
                // Skip header rows
                if (row.querySelector('[role="columnheader"], th')) continue;

                // Check for checkbox to ensure it's a data row (like local scraper)
                if (!row.querySelector('input[type="checkbox"]')) continue;

                // Get all cells in this row
                const cells = row.querySelectorAll('[role="gridcell"]');

                // ========================================
                // CELL 1: NAME (REQUIRED)
                // ========================================
                let name = '';
                let apolloUrl = '';

                // First try to find person link anywhere in row (most reliable)
                const personLink = row.querySelector('a[href*="/people/"]') as HTMLAnchorElement;
                if (personLink) {
                    name = personLink.textContent?.trim() || '';
                    apolloUrl = personLink.href || '';
                    if (apolloUrl && !apolloUrl.startsWith('http')) {
                        apolloUrl = `https://app.apollo.io${apolloUrl}`;
                    }
                }

                // Validate name
                if (!name ||
                    name.toLowerCase().includes('access') ||
                    name.toLowerCase().includes('email') ||
                    name.length < 2) {
                    diagnostics.skippedNoName++;
                    continue;
                }

                // ========================================
                // CELL 5: COMPANY · LINKS (REQUIRED)
                // Contains: website link, company LinkedIn, Facebook, Twitter
                // We need the website link with aria-label="website link"
                // ========================================
                let domain = '';

                // Helper to find element by multiple selectors
                const findInRow = (selectors: string[]) => {
                    for (const sel of selectors) {
                        const el = row.querySelector(sel);
                        if (el) return el as HTMLAnchorElement;
                    }
                    return null;
                };

                // Robust website selectors (matching scraper-local.ts logic)
                const websiteSelectors = [
                    'a[aria-label="website link"]',
                    'a[aria-label*="website"]',
                    // Generic http link that isn't a known social/internal link
                    'a[href^="http"]:not([href*="apollo.io"]):not([href*="linkedin.com"]):not([href*="twitter.com"]):not([href*="facebook.com"]):not([href*="google.com"]):not([href*="instagram.com"]):not([href*="youtube.com"])'
                ];

                const websiteLink = findInRow(websiteSelectors);
                if (websiteLink) {
                    const href = websiteLink.getAttribute('data-href') || websiteLink.href || '';
                    domain = extractDomain(href);
                }

                // Skip if no domain found
                if (!domain) {
                    // Debug info
                    if (diagnostics.errors.length < 5) {
                        const cellCount = cells.length;
                        const hasWebsiteLink = row.querySelector('a[aria-label="website link"]') ? 'yes' : 'no';
                        diagnostics.errors.push(`Row ${rowIndex} (${name}) - cells:${cellCount}, website-link:${hasWebsiteLink}`);
                    }
                    diagnostics.skippedNoDomain++;
                    continue;
                }

                // ========================================
                // OPTIONAL FIELDS FROM OTHER CELLS
                // Cell 2: Job title
                // Cell 3: Company (semantic selector + fallback)
                // Cell 6: Person's LinkedIn (semantic selector)
                // Cell 9: Location
                // Cell 10: Company size
                // Cell 11: Industry
                // Cell 12: Keywords
                // Cell 13: Company Links (website, LinkedIn - semantic selectors)
                // ========================================

                // Cell 2: Job title
                let title = '';
                if (cells.length > 2) {
                    title = cells[2]?.textContent?.trim() || '';
                }

                // Cell 3: Company name
                let companyName = '';
                const companyLink = row.querySelector('a[href*="/organization"]') as HTMLAnchorElement;
                if (companyLink) {
                    companyName = companyLink.textContent?.trim() || '';
                } else if (cells.length > 3) {
                    companyName = cells[3]?.textContent?.trim() || '';
                }

                // Cell 4: Person's LinkedIn (from Links cell)
                let personLinkedin = '';
                const personLinkedinSelectors = [
                    'a[aria-label="linkedin link"][href*="/in/"]',
                    'a[href*="linkedin.com/in/"]',
                    'a[aria-label*="LinkedIn"][href*="/in/"]'
                ];
                const personLinkedinLink = findInRow(personLinkedinSelectors);
                if (personLinkedinLink) {
                    personLinkedin = personLinkedinLink.getAttribute('data-href') || personLinkedinLink.href || '';
                }

                // Cell 5: Company LinkedIn (from Company · Links cell)
                let companyLinkedin = '';
                const companyLinkedinSelectors = [
                    'a[aria-label="linkedin link"][href*="/company/"]',
                    'a[href*="linkedin.com/company/"]',
                    'a[aria-label*="LinkedIn"][href*="company"]'
                ];
                const companyLinkedinLink = findInRow(companyLinkedinSelectors);
                if (companyLinkedinLink) {
                    companyLinkedin = companyLinkedinLink.getAttribute('data-href') || companyLinkedinLink.href || '';
                }

                // Cell 9: Location
                let location = '';
                if (cells.length > 9) {
                    location = cells[9]?.textContent?.trim() || '';
                }

                // Cell 10: Company size
                let companySize = '';
                if (cells.length > 10) {
                    companySize = cells[10]?.textContent?.trim() || '';
                }

                // Cell 11: Industry
                let industry = '';
                if (cells.length > 11) {
                    industry = cells[11]?.textContent?.trim() || '';
                }

                // Cell 12: Keywords
                let keywords: string[] = [];
                if (cells.length > 12) {
                    const keywordsText = cells[12]?.textContent?.trim() || '';
                    if (keywordsText) {
                        keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k);
                    }
                }

                // Phone numbers (Removed per user request)
                const phoneNumbers: string[] = [];

                // Log sample data
                if (diagnostics.successfulExtractions < 3) {
                    diagnostics.sampleData.push(`${name} | ${title} | ${companyName} | ${domain}`);
                }

                leads.push({
                    name,
                    title,
                    companyName,
                    domain,
                    location,
                    companySize,
                    industry,
                    companyLinkedin,
                    phoneNumbers,
                    apolloUrl,
                    personLinkedin,
                    keywords
                });

                diagnostics.successfulExtractions++;

            } catch (err) {
                diagnostics.errors.push(`Row ${rowIndex}: ${err}`);
            }
        }

        return { leads, diagnostics };
    });
}

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

function convertToScrapedLead(raw: RawLeadData): ScrapedLead {
    const { firstName, lastName } = splitName(raw.name);

    return {
        first_name: firstName,
        last_name: lastName,
        title: raw.title,
        company_name: raw.companyName,
        company_linkedin: raw.companyLinkedin,
        location: raw.location,
        company_size: raw.companySize,
        industry: raw.industry,
        website: raw.domain || '',  // Store domain only (e.g., "acme.com"), not full URL
        keywords: raw.keywords || [],
        email: undefined,
        linkedin_url: raw.personLinkedin || '',  // Person's LinkedIn URL from Cell 4
        phone_numbers: raw.phoneNumbers
    };
}

export async function scrapeApollo(url: string, pages: number = 1, userId?: string): Promise<ScrapedLead[]> {
    console.log('[GOLOGIN-SCRAPER] === Starting Apollo Scrape ===');
    console.log(`[GOLOGIN-SCRAPER] URL: ${url}`);
    console.log(`[GOLOGIN-SCRAPER] Pages: ${pages}`);

    const profileResult = await getProfileForScrape(userId);
    if (!profileResult.profileId) {
        throw new Error(profileResult.error || 'No GoLogin profile available.');
    }

    console.log(`[GOLOGIN-SCRAPER] Profile: ${profileResult.profileId}`);

    let page: Page | null = null;
    const allLeads: ScrapedLead[] = [];

    try {
        let browser = await getBrowserForProfile(profileResult.profileId);
        page = await browser.newPage();
        page.setDefaultTimeout(SCRAPE_TIMEOUT);
        await page.setViewport({ width: 1366, height: 768 });

        // Robust navigation with retries
        let navigationSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (!browser.isConnected()) {
                    console.log(`[GOLOGIN-SCRAPER] Browser disconnected, reconnecting (attempt ${attempt})...`);
                    browser = await getBrowserForProfile(profileResult.profileId);
                    page = await browser.newPage();
                    page.setDefaultTimeout(SCRAPE_TIMEOUT);
                    await page.setViewport({ width: 1366, height: 768 });
                }

                console.log(`[GOLOGIN-SCRAPER] Navigating (attempt ${attempt})...`);
                try {
                    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
                } catch (navError) {
                    console.warn(`[GOLOGIN-SCRAPER] Load timeout, trying domcontentloaded...`);
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                }
                navigationSuccess = true;
                break;
            } catch (error) {
                console.error(`[GOLOGIN-SCRAPER] Navigation failed (attempt ${attempt}):`, error);
                if (attempt === 3) throw error;
                await humanDelay(2000, 4000);
            }
        }

        await humanDelay(5000, 7000);

        // Check for Cloudflare
        const content = await page.content();
        if (content.includes('challenge-platform') || content.includes('cf-browser-verification')) {
            console.log('[GOLOGIN-SCRAPER] Cloudflare detected, waiting...');
            await humanDelay(5000, 10000);
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });
            await humanDelay(5000, 7000);
        }

        // Check login
        if (page.url().includes('/login') || page.url().includes('/sign')) {
            throw new Error('Not logged into Apollo.');
        }

        for (let currentPage = 1; currentPage <= pages; currentPage++) {
            console.log(`[GOLOGIN-SCRAPER] Page ${currentPage}/${pages}...`);

            // Wait for table
            const tableSelectors = ['div[role="treegrid"]', 'table[role="grid"]', 'table'];
            let tableFound = false;
            for (const sel of tableSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 10000 });
                    tableFound = true;
                    break;
                } catch { continue; }
            }
            if (!tableFound) throw new Error('Table not found.');

            // Wait for content to render
            await page.evaluate(() => window.scrollBy(0, 300));
            await humanDelay(2000, 3000);

            // Wait for website links to appear (they load lazily)
            try {
                await page.waitForSelector('a[aria-label="website link"]', { timeout: 15000 });
                console.log('[GOLOGIN-SCRAPER] Website links detected');
            } catch {
                console.log('[GOLOGIN-SCRAPER] No website links found on this page');
            }

            // Extract
            const { leads: rawLeads, diagnostics } = await extractAllLeadsFromPage(page);

            // Log results
            console.log(`[GOLOGIN-SCRAPER] ========== RESULTS ==========`);
            console.log(`[GOLOGIN-SCRAPER] Rows: ${diagnostics.rowsFound}`);
            console.log(`[GOLOGIN-SCRAPER] Skipped (no name): ${diagnostics.skippedNoName}`);
            console.log(`[GOLOGIN-SCRAPER] Skipped (no domain): ${diagnostics.skippedNoDomain}`);
            console.log(`[GOLOGIN-SCRAPER] Extracted: ${diagnostics.successfulExtractions}`);
            if (diagnostics.sampleData.length > 0) {
                console.log(`[GOLOGIN-SCRAPER] Samples:`);
                diagnostics.sampleData.forEach(s => console.log(`[GOLOGIN-SCRAPER]   ${s}`));
            }
            if (diagnostics.errors.length > 0) {
                console.log(`[GOLOGIN-SCRAPER] Debug: ${diagnostics.errors.slice(0, 5).join('; ')}`);
            }
            console.log(`[GOLOGIN-SCRAPER] =============================`);

            for (const raw of rawLeads) {
                allLeads.push(convertToScrapedLead(raw));
            }

            // Pagination
            if (currentPage < pages) {
                const nextBtn = await page.$('button[aria-label="Next"]') ||
                    await page.$('button[aria-label="next"]');
                if (nextBtn) {
                    const isDisabled = await page.evaluate((el: Element) => el.hasAttribute('disabled'), nextBtn);
                    if (!isDisabled) {
                        const delay = Math.floor(Math.random() * 6000) + 5000;
                        console.log(`[GOLOGIN-SCRAPER] Waiting ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        await nextBtn.click();
                        await humanDelay(3000, 5000);
                    } else break;
                } else break;
            }
        }

        console.log(`[GOLOGIN-SCRAPER] ✓ Total: ${allLeads.length} leads`);
        return allLeads;

    } catch (error) {
        console.error('[GOLOGIN-SCRAPER] Failed:', error);
        throw error;
    } finally {
        if (page) {
            try { await page.close(); } catch { }
        }
    }
}

export async function getScraperProfileInfo(userId?: string): Promise<ProfileLookupResult> {
    return getProfileForScrape(userId);
}
