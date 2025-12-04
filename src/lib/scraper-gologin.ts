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
import { Page } from 'puppeteer';
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
 */
interface RawLeadData {
    name: string;
    linkedinUrl: string;
    title: string;
    companyName: string;
    companyLinkedin: string;
    website: string;
    location: string;
    companySize: string;
    industry: string;
    keywords: string;
    phoneNumbers: string[];
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
 * Extract ALL leads from the current page in a SINGLE browser call
 * This is much faster than iterating row by row with multiple round-trips
 */
async function extractAllLeadsFromPage(page: Page): Promise<RawLeadData[]> {
    return await page.evaluate(() => {
        const leads: RawLeadData[] = [];
        
        // Get all rows - try multiple selectors
        let rows = document.querySelectorAll('div[role="treegrid"] div[role="row"]');
        if (rows.length === 0) {
            rows = document.querySelectorAll('table[role="grid"] tr');
        }
        if (rows.length === 0) {
            rows = document.querySelectorAll('[data-cy="people-table-row"]');
        }
        
        rows.forEach((row) => {
            try {
                // Check for checkbox to ensure it's a data row (not header)
                const hasCheckbox = row.querySelector('input[type="checkbox"]');
                if (!hasCheckbox) return;
                
                // Get all cells
                const cells = row.querySelectorAll('div[role="cell"], td');
                if (cells.length < 3) return;
                
                // Extract person name and LinkedIn URL
                const personLink = row.querySelector('a[href*="/people/"]') || 
                                   row.querySelector('a[data-link-type="person"]') ||
                                   row.querySelector('[data-cy="person-name"] a');
                
                if (!personLink) return;
                
                const name = personLink.textContent?.trim() || '';
                if (!name) return;
                
                let linkedinUrl = personLink.getAttribute('href') || '';
                if (linkedinUrl && !linkedinUrl.startsWith('http')) {
                    linkedinUrl = `https://app.apollo.io${linkedinUrl}`;
                }
                
                // Extract company data
                const companyLink = row.querySelector('a[href*="/organizations/"]') ||
                                    row.querySelector('a[href*="/accounts/"]') ||
                                    row.querySelector('a[data-link-type="company"]') ||
                                    row.querySelector('[data-cy="company-name"] a');
                
                let companyName = companyLink?.textContent?.trim() || '';
                
                // Fallback: get company from cell index
                if (!companyName && cells.length >= 4) {
                    companyName = cells[3]?.textContent?.trim() || '';
                }
                
                // Company LinkedIn
                const companyLinkedinLink = row.querySelector('a[href*="linkedin.com/company"]');
                const companyLinkedin = companyLinkedinLink?.getAttribute('href') || '';
                
                // Website - find link that's not apollo, linkedin, twitter, facebook
                let website = '';
                const allLinks = row.querySelectorAll('a[href^="http"]');
                for (const link of allLinks) {
                    const href = link.getAttribute('href') || '';
                    if (href && 
                        !href.includes('apollo.io') && 
                        !href.includes('linkedin.com') && 
                        !href.includes('twitter.com') && 
                        !href.includes('facebook.com')) {
                        website = href;
                        break;
                    }
                }
                
                // Extract title from cell index 2
                const title = cells.length >= 3 ? (cells[2]?.textContent?.trim() || '') : '';
                
                // Extract location from cell index 9
                const location = cells.length >= 10 ? (cells[9]?.textContent?.trim() || '') : '';
                
                // Extract company size from cell index 10
                const companySize = cells.length >= 11 ? (cells[10]?.textContent?.trim() || '') : '';
                
                // Extract industry from cell index 11
                const industry = cells.length >= 12 ? (cells[11]?.textContent?.trim() || '') : '';
                
                // Extract keywords from cell index 12
                const keywords = cells.length >= 13 ? (cells[12]?.textContent?.trim() || '') : '';
                
                // Extract phone numbers
                const phoneNumbers: string[] = [];
                const telLinks = row.querySelectorAll('a[href^="tel:"]');
                telLinks.forEach(telLink => {
                    const phone = telLink.textContent?.trim();
                    if (phone && phone !== 'Access Mobile') {
                        phoneNumbers.push(phone);
                    }
                });
                
                leads.push({
                    name,
                    linkedinUrl,
                    title,
                    companyName,
                    companyLinkedin,
                    website,
                    location,
                    companySize,
                    industry,
                    keywords,
                    phoneNumbers
                });
                
            } catch (err) {
                // Skip this row on error
                console.error('Error parsing row:', err);
            }
        });
        
        return leads;
    });
}

/**
 * Convert raw lead data to ScrapedLead format
 */
function convertToScrapedLead(raw: RawLeadData): ScrapedLead {
    const nameParts = raw.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const keywords = raw.keywords 
        ? raw.keywords.split(',').map(k => k.trim()).filter(k => k)
        : [];
    
    return {
        first_name: firstName,
        last_name: lastName,
        title: raw.title,
        company_name: raw.companyName,
        company_linkedin: raw.companyLinkedin,
        location: raw.location,
        company_size: raw.companySize,
        industry: raw.industry,
        website: raw.website,
        keywords,
        email: undefined,
        linkedin_url: raw.linkedinUrl,
        phone_numbers: raw.phoneNumbers
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
                
                if (currentUrl.includes('/login') || currentUrl.includes('/sign')) {
                    throw new Error('Not logged into Apollo. Please log in using the GoLogin browser profile.');
                }
                
                throw new Error('Apollo table not found. Ensure you are logged in and on a valid search page.');
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
                // Find next button
                const nextBtn = await page.$('button[aria-label="Next"]') ||
                               await page.$('button[aria-label="next"]') ||
                               await page.$('[data-cy="pagination-next"]');
                
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
