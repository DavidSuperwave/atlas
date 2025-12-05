/**
 * GoLogin Scraper - Apollo scraping using GoLogin cloud anti-detect browser
 * 
 * OPTIMIZED VERSION: Uses batch page.evaluate() for fast data extraction
 * 
 * This module handles scraping Apollo.io using GoLogin browser profiles.
 * It provides enhanced anonymity and Cloudflare bypass through anti-detect
 * fingerprinting and residential proxy support.
 * 
 * MULTI-PROFILE SUPPORT:
 * - Pass userId to scrapeApollo() to use user's assigned profile
 * - Falls back to GOLOGIN_PROFILE_ID env var if no assignment
 * 
 * PREREQUISITES:
 * 1. GoLogin account with API access
 * 2. Browser profile created with Apollo logged in
 * 3. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - SCRAPER_MODE=gologin (to enable this scraper)
 * - GOLOGIN_API_TOKEN: API token from GoLogin dashboard
 * - GOLOGIN_PROFILE_ID: Default profile ID (optional fallback)
 * 
 * FUNCTION SIGNATURE:
 * scrapeApollo(url: string, pages?: number, userId?: string): Promise<ScrapedLead[]>
 * 
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

import { getBrowserForProfile } from './browser-manager-gologin';
import { getUserProfileId, ProfileLookupResult } from './gologin-profile-manager';
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
 * Interface for raw lead data extracted from browser
 * Optimized to only include fields needed for database/enrichment
 */
interface RawLeadData {
    name: string;           // Full name from NAME column
    title: string;          // From JOB TITLE column
    companyName: string;    // From COMPANY column
    website: string;        // Domain from COMPANY LINKS (critical for enrichment)
    location: string;       // From LOCATION column
    companySize: string;    // From COMPANY # OF EMPLOYEES column
    industry: string;       // From COMPANY INDUSTRIES column
}

/**
 * Get the profile ID to use for scraping
 * 
 * @param userId - Optional user ID to look up assigned profile
 * @returns Profile lookup result with profile ID and source
 */
async function getProfileForScrape(userId?: string): Promise<ProfileLookupResult> {
    if (userId) {
        // Look up user's assigned profile
        const result = await getUserProfileId(userId);
        if (result.profileId) {
            return result;
        }
        // If no assignment, error will be in result
        if (result.error) {
            console.warn(`[GOLOGIN-SCRAPER] ${result.error}`);
        }
        return result;
    }
    
    // No userId provided, use environment variable
    const envProfileId = process.env.GOLOGIN_PROFILE_ID;
    if (envProfileId) {
        return {
            profileId: envProfileId,
            source: 'environment'
        };
    }
    
    return {
        profileId: '',
        source: 'none',
        error: 'No GoLogin profile configured. Set GOLOGIN_PROFILE_ID or assign a profile to the user.'
    };
}

/**
 * Debug function to detect what table structure Apollo is using
 * Run this first to identify the correct selectors
 */
async function detectApolloTableStructure(page: Page): Promise<void> {
    const result = await page.evaluate(() => {
        const selectors = {
            // Table selectors
            'div[role="treegrid"]': document.querySelectorAll('div[role="treegrid"]').length,
            'table[role="grid"]': document.querySelectorAll('table[role="grid"]').length,
            '[data-cy="people-table"]': document.querySelectorAll('[data-cy="people-table"]').length,
            'table': document.querySelectorAll('table').length,
            '[role="table"]': document.querySelectorAll('[role="table"]').length,
            // Row selectors
            'div[role="row"]': document.querySelectorAll('div[role="row"]').length,
            'tr': document.querySelectorAll('tr').length,
            '[data-cy="people-table-row"]': document.querySelectorAll('[data-cy="people-table-row"]').length,
            // Cell selectors
            'div[role="cell"]': document.querySelectorAll('div[role="cell"]').length,
            'td': document.querySelectorAll('td').length,
            '[role="gridcell"]': document.querySelectorAll('[role="gridcell"]').length,
            // Person link selectors
            'a[href*="/people/"]': document.querySelectorAll('a[href*="/people/"]').length,
            'a[href*="/contact/"]': document.querySelectorAll('a[href*="/contact/"]').length,
            // Company link selectors
            'a[href*="/organizations/"]': document.querySelectorAll('a[href*="/organizations/"]').length,
            'a[href*="/accounts/"]': document.querySelectorAll('a[href*="/accounts/"]').length,
            'a[href*="/company/"]': document.querySelectorAll('a[href*="/company/"]').length,
            // Checkbox (indicates data rows)
            'input[type="checkbox"]': document.querySelectorAll('input[type="checkbox"]').length,
            // Any data-cy attributes
            '[data-cy]': document.querySelectorAll('[data-cy]').length,
        };
        
        // Get all unique data-cy values
        const dataCyElements = document.querySelectorAll('[data-cy]');
        const dataCyValues: string[] = [];
        dataCyElements.forEach(el => {
            const val = el.getAttribute('data-cy');
            if (val && !dataCyValues.includes(val)) {
                dataCyValues.push(val);
            }
        });
        
        // Get sample of role attributes
        const roleElements = document.querySelectorAll('[role]');
        const roleValues: string[] = [];
        roleElements.forEach(el => {
            const val = el.getAttribute('role');
            if (val && !roleValues.includes(val)) {
                roleValues.push(val);
            }
        });
        
        return { selectors, dataCyValues: dataCyValues.slice(0, 30), roleValues };
    });
    
    console.log('[GOLOGIN-SCRAPER] ========== APOLLO TABLE STRUCTURE DETECTION ==========');
    console.log('[GOLOGIN-SCRAPER] Selector counts:');
    for (const [selector, count] of Object.entries(result.selectors)) {
        if (count > 0) {
            console.log(`[GOLOGIN-SCRAPER]   ${selector}: ${count}`);
        }
    }
    console.log('[GOLOGIN-SCRAPER] data-cy values found:', result.dataCyValues.join(', '));
    console.log('[GOLOGIN-SCRAPER] role values found:', result.roleValues.join(', '));
    console.log('[GOLOGIN-SCRAPER] =====================================================');
}

/**
 * Extract ALL leads from the current page in a SINGLE browser call
 * OPTIMIZED: Uses cell indices for fast, reliable extraction
 * 
 * Apollo Table Column Structure (as of Dec 2024):
 * 0: Checkbox
 * 1: NAME (person link)
 * 2: JOB TITLE
 * 3: COMPANY (company link)
 * 4: EMAILS (skip - we generate via enrichment)
 * 5: PHONE NUMBERS (skip)
 * 6: ACTIONS (skip)
 * 7: LINKS (person LinkedIn - skip for now)
 * 8: LOCATION
 * 9: COMPANY # OF EMPLOYEES
 * 10: COMPANY INDUSTRIES
 * 11: COMPANY KEYWORDS (skip)
 * 12: COMPANY LINKS (website domain - CRITICAL)
 */
async function extractAllLeadsFromPage(page: Page): Promise<RawLeadData[]> {
    return await page.evaluate(() => {
        const leads: RawLeadData[] = [];
        
        // Get all rows from treegrid
        let rows = document.querySelectorAll('[role="treegrid"] [role="row"]');
        if (rows.length === 0) {
            rows = document.querySelectorAll('[role="row"]');
        }
        
        console.log(`[EXTRACT] Found ${rows.length} rows`);
        
        rows.forEach((row, rowIndex) => {
            try {
                // Check for checkbox to ensure it's a data row (not header)
                const hasCheckbox = row.querySelector('input[type="checkbox"]');
                if (!hasCheckbox) return;
                
                // Get all cells in the row
                const cells = row.querySelectorAll('[role="cell"], [role="gridcell"]');
                if (cells.length < 13) {
                    console.log(`[EXTRACT] Row ${rowIndex}: Only ${cells.length} cells, skipping`);
                    return;
                }
                
                // === EXTRACT NAME (Cell 1) ===
                // Look for person link in the name cell
                const nameCell = cells[1];
                const personLink = nameCell?.querySelector('a[href*="/people/"]') || 
                                   nameCell?.querySelector('a');
                const name = personLink?.textContent?.trim() || nameCell?.textContent?.trim() || '';
                
                // Skip rows with "(No Name)" or empty names - can't do enrichment without name
                if (!name || name === '(No Name)' || name.toLowerCase().includes('no name')) {
                    console.log(`[EXTRACT] Row ${rowIndex}: Skipping - no valid name`);
                    return;
                }
                
                // === EXTRACT JOB TITLE (Cell 2) ===
                const title = cells[2]?.textContent?.trim() || '';
                
                // === EXTRACT COMPANY NAME (Cell 3) ===
                const companyCell = cells[3];
                const companyLink = companyCell?.querySelector('a[href*="/accounts/"]') ||
                                    companyCell?.querySelector('a[href*="/organizations/"]') ||
                                    companyCell?.querySelector('a');
                const companyName = companyLink?.textContent?.trim() || companyCell?.textContent?.trim() || '';
                
                // === EXTRACT LOCATION (Cell 8) ===
                const location = cells[8]?.textContent?.trim() || '';
                
                // === EXTRACT COMPANY SIZE (Cell 9) ===
                const companySize = cells[9]?.textContent?.trim() || '';
                
                // === EXTRACT INDUSTRY (Cell 10) ===
                const industry = cells[10]?.textContent?.trim() || '';
                
                // === EXTRACT WEBSITE from COMPANY LINKS (Cell 12) ===
                // This is CRITICAL for enrichment - we need the domain
                let website = '';
                const companyLinksCell = cells[12];
                if (companyLinksCell) {
                    // Look for external website link (not social media)
                    const links = companyLinksCell.querySelectorAll('a[href^="http"]');
                    for (const link of links) {
                        const href = link.getAttribute('href') || '';
                        // Skip social media links
                        if (href && 
                            !href.includes('linkedin.com') && 
                            !href.includes('twitter.com') && 
                            !href.includes('facebook.com') &&
                            !href.includes('apollo.io')) {
                            website = href;
                            break;
                        }
                    }
                }
                
                // If no website in company links, try to find it elsewhere in the row
                if (!website) {
                    const allLinks = row.querySelectorAll('a[href^="http"]');
                    for (const link of allLinks) {
                        const href = link.getAttribute('href') || '';
                        if (href && 
                            !href.includes('apollo.io') && 
                            !href.includes('linkedin.com') && 
                            !href.includes('twitter.com') && 
                            !href.includes('facebook.com') &&
                            !href.includes('crunchbase.com')) {
                            website = href;
                            break;
                        }
                    }
                }
                
                // Log what we extracted for debugging
                console.log(`[EXTRACT] Row ${rowIndex}: ${name} | ${title} | ${companyName} | ${website || 'NO WEBSITE'}`);
                
                leads.push({
                    name,
                    title,
                    companyName,
                    website,
                    location,
                    companySize,
                    industry
                });
                
            } catch (err) {
                console.error(`[EXTRACT] Error parsing row ${rowIndex}:`, err);
            }
        });
        
        console.log(`[EXTRACT] Successfully extracted ${leads.length} leads`);
        return leads;
    });
}

/**
 * Convert raw lead data to ScrapedLead format
 * Optimized version - only includes fields needed for enrichment
 */
function convertToScrapedLead(raw: RawLeadData): ScrapedLead {
    // Split name into first and last
    const nameParts = raw.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    return {
        first_name: firstName,
        last_name: lastName,
        title: raw.title || '',
        company_name: raw.companyName || '',
        company_linkedin: '', // Not extracted in optimized version
        location: raw.location || '',
        company_size: raw.companySize || '',
        industry: raw.industry || '',
        website: raw.website || '',
        keywords: [], // Not extracted in optimized version
        email: undefined, // Generated by enrichment
        linkedin_url: '', // Not extracted in optimized version
        phone_numbers: [] // Not extracted in optimized version
    };
}

/**
 * Scrape leads from Apollo.io using GoLogin
 * 
 * OPTIMIZED: Uses batch page.evaluate() for fast extraction
 * 
 * @param url - Apollo search URL to scrape
 * @param pages - Number of pages to scrape (default: 1)
 * @param userId - Optional user ID to look up assigned profile
 * @returns Promise<ScrapedLead[]> - Array of scraped leads
 */
export async function scrapeApollo(url: string, pages: number = 1, userId?: string): Promise<ScrapedLead[]> {
    console.log('[GOLOGIN-SCRAPER] === Starting Apollo Scrape (GoLogin Mode - OPTIMIZED) ===');
    console.log(`[GOLOGIN-SCRAPER] Target URL: ${url}`);
    console.log(`[GOLOGIN-SCRAPER] Pages to scrape: ${pages}`);
    console.log(`[GOLOGIN-SCRAPER] User ID: ${userId || '(none - using default profile)'}`);

    // Get the profile to use
    const profileResult = await getProfileForScrape(userId);
    
    if (!profileResult.profileId) {
        throw new Error(profileResult.error || 'No GoLogin profile available for scraping.');
    }
    
    console.log(`[GOLOGIN-SCRAPER] Using profile: ${profileResult.profileId} (source: ${profileResult.source}${profileResult.profileName ? `, name: ${profileResult.profileName}` : ''})`);

    let page: Page | null = null;
    const allLeads: ScrapedLead[] = [];

    try {
        console.log('[GOLOGIN-SCRAPER] Getting GoLogin browser connection...');
        
        // Get browser for the specific profile
        const browser = await getBrowserForProfile(profileResult.profileId);

        console.log('[GOLOGIN-SCRAPER] Creating new page...');
        page = await browser.newPage();
        page.setDefaultTimeout(SCRAPE_TIMEOUT);

        // Set a realistic viewport (GoLogin may override this with profile settings)
        await page.setViewport({ width: 1366, height: 768 });

        console.log(`[GOLOGIN-SCRAPER] Navigating to: ${url}`);
        
        // Use 'load' instead of 'networkidle2' - Apollo keeps making requests so networkidle2 may never fire
        try {
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        } catch (navError) {
            // If initial navigation fails, try with domcontentloaded
            console.log('[GOLOGIN-SCRAPER] Initial navigation slow, trying domcontentloaded...');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
        
        // Wait for page to stabilize after navigation
        console.log('[GOLOGIN-SCRAPER] Waiting for page to stabilize...');
        await humanDelay(5000, 7000);

        // Check for Cloudflare challenge
        const pageContent = await page.content();
        if (pageContent.includes('challenge-platform') || pageContent.includes('cf-browser-verification')) {
            console.log('[GOLOGIN-SCRAPER] WARNING: Cloudflare challenge detected. Waiting...');
            await humanDelay(5000, 10000);
            // Re-navigate after challenge
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });
            await humanDelay(5000, 7000);
        }

        // Check if we're on the right page
        const currentUrl = page.url();
        console.log(`[GOLOGIN-SCRAPER] Current URL after navigation: ${currentUrl}`);
        
        if (currentUrl.includes('/login') || currentUrl.includes('/sign')) {
            throw new Error('Not logged into Apollo. Please log in using the GoLogin browser profile.');
        }

        for (let currentPage = 1; currentPage <= pages; currentPage++) {
            console.log(`[GOLOGIN-SCRAPER] Processing page ${currentPage}/${pages}...`);

            // Run structure detection on first page to help debug selector issues
            if (currentPage === 1) {
                await detectApolloTableStructure(page);
            }

            // Wait for table - try multiple selectors (expanded for newer Apollo versions)
            const tableSelectors = [
                'div[role="treegrid"]',
                'table[role="grid"]',
                '[data-cy="people-table"]',
                'table tbody',
                '[role="table"]',
                '.zp_tZMWg',
                // Fallback: any table with rows
                'table:has(tr)'
            ];
            
            let tableFound = false;
            for (const selector of tableSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 10000 });
                    console.log(`[GOLOGIN-SCRAPER] Table found with selector: ${selector}`);
                    tableFound = true;
                    break;
                } catch {
                    continue;
                }
            }
            
            if (!tableFound) {
                console.log('[GOLOGIN-SCRAPER] Table not found - checking page state...');
                const currentUrl = page.url();
                console.log(`[GOLOGIN-SCRAPER] Current URL: ${currentUrl}`);
                
                // Log page title and some content for debugging
                const pageTitle = await page.title();
                console.log(`[GOLOGIN-SCRAPER] Page title: ${pageTitle}`);
                
                // Try to get page content summary for debugging
                try {
                    const bodyText = await page.evaluate(() => {
                        const body = document.body;
                        return body ? body.innerText.substring(0, 500) : '(no body)';
                    });
                    console.log(`[GOLOGIN-SCRAPER] Page content preview: ${bodyText.substring(0, 200)}...`);
                } catch (e) {
                    console.log('[GOLOGIN-SCRAPER] Could not get page content');
                }
                
                // Take screenshot for debugging (save to /tmp or log as base64)
                try {
                    const screenshot = await page.screenshot({ encoding: 'base64' });
                    console.log(`[GOLOGIN-SCRAPER] Screenshot (base64, first 200 chars): ${screenshot.substring(0, 200)}...`);
                    console.log(`[GOLOGIN-SCRAPER] Full screenshot length: ${screenshot.length} characters`);
                } catch (e) {
                    console.log('[GOLOGIN-SCRAPER] Could not take screenshot');
                }
                
                if (currentUrl.includes('/login') || currentUrl.includes('/sign')) {
                    throw new Error('Not logged into Apollo. Please log in using the GoLogin browser profile.');
                }
                
                if (currentUrl.includes('challenge') || pageTitle.includes('Cloudflare')) {
                    throw new Error('Cloudflare challenge detected. The browser may need manual interaction or a better proxy.');
                }
                
                throw new Error(`Apollo table not found. URL: ${currentUrl}, Title: ${pageTitle}. Ensure you are logged in and on a valid search page.`);
            }

            // Small scroll to ensure all rows are visible
            await page.evaluate(() => window.scrollBy(0, 300));
            await humanDelay(500, 1000);

            // BATCH EXTRACTION - Extract ALL leads in a single call (FAST!)
            const startTime = Date.now();
            const rawLeads = await extractAllLeadsFromPage(page);
            const extractionTime = Date.now() - startTime;
            
            console.log(`[GOLOGIN-SCRAPER] Extracted ${rawLeads.length} leads in ${extractionTime}ms`);

            // Convert to ScrapedLead format
            for (const raw of rawLeads) {
                allLeads.push(convertToScrapedLead(raw));
            }

            // Pagination with delays for anti-detection (5-11 seconds as requested)
            if (currentPage < pages) {
                // Try multiple selectors for next button (more robust)
                const nextSelectors = [
                    'button[aria-label="Next"]',
                    'button[aria-label="next"]',
                    '[data-cy="pagination-next"]',
                    'button:has-text("Next")',
                    'button[aria-label*="Next" i]', // Case-insensitive
                    '[aria-label*="next" i]' // More flexible
                ];
                
                let nextBtn: ElementHandle | null = null;
                for (const selector of nextSelectors) {
                    try {
                        nextBtn = await page.$(selector);
                        if (nextBtn) {
                            console.log(`[GOLOGIN-SCRAPER] Found next button with selector: ${selector}`);
                            break;
                        }
                    } catch {
                        continue;
                    }
                }
                
                if (nextBtn) {
                    const isDisabled = await page.evaluate(el => el.hasAttribute('disabled'), nextBtn);
                    if (!isDisabled) {
                        // Keep 5-11 second delay for pagination (anti-detection)
                        const delay = Math.floor(Math.random() * 6000) + 5000; // 5-11s delay
                        console.log(`[GOLOGIN-SCRAPER] Waiting ${delay}ms before next page...`);
                        await new Promise(r => setTimeout(r, delay));

                        await nextBtn.click();
                        await humanDelay(3000, 5000); // Wait for page load
                    } else {
                        console.log('[GOLOGIN-SCRAPER] Next button is disabled, stopping pagination');
                        break;
                    }
                } else {
                    console.log('[GOLOGIN-SCRAPER] Next button not found, stopping pagination');
                    break;
                }
            }
        }

        console.log(`[GOLOGIN-SCRAPER] ✓ Scraped ${allLeads.length} leads total`);
        return allLeads;

    } catch (error) {
        console.error('[GOLOGIN-SCRAPER] Scrape failed:', error);
        throw error;
    } finally {
        // Safely close the page, handling connection closed errors
        if (page) {
            try {
                await page.close();
            } catch (closeError) {
                // Connection may already be closed - this is not a critical error
                console.log('[GOLOGIN-SCRAPER] Page close warning (connection may have been closed):', 
                    closeError instanceof Error ? closeError.message : 'Unknown error');
            }
        }
    }
}

/**
 * Get the profile result that would be used for a scrape
 * Useful for UI to show which profile will be used
 * 
 * @param userId - Optional user ID
 * @returns Profile lookup result
 */
export async function getScraperProfileInfo(userId?: string): Promise<ProfileLookupResult> {
    return getProfileForScrape(userId);
}
