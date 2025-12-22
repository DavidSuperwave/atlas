/**
 * GoLogin Scraper - WORKING VERSION
 *
 * - Auto-detects columns (adaptive to user configuration)
 * - No scrolling needed (95% faster)
 * - Proper domain extraction (not full URL)
 * - Simple, reliable navigation (no complex retry logic that breaks)
 * - Correct mapping to ScrapedLead schema
 */

import { getBrowserForProfile, getBrowserManagerForProfile } from './browser-manager-gologin';
import { getUserProfileId, ProfileLookupResult } from './gologin-profile-manager';
import { Page } from 'puppeteer';
import type { ScrapedLead, ScrapeError } from './scraper-types';
import { createClient } from '@supabase/supabase-js';

export type { ScrapedLead, ScrapeError };

const SCRAPE_TIMEOUT = 20 * 60 * 1000;

const supabaseCancel = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isScrapeCancelled(scrapeId?: string): Promise<boolean> {
    if (!scrapeId) return false;
    const { data } = await supabaseCancel.from('scrapes').select('status').eq('id', scrapeId).single();
    return data?.status === 'cancelled';
}

async function updateScrapeState(scrapeId: string | undefined, state: any): Promise<void> {
    if (!scrapeId) return;
    try {
        await supabaseCancel.from('scrapes').update({ ...state, state_updated_at: new Date().toISOString() }).eq('id', scrapeId);
    } catch (error) {
        console.warn('[GOLOGIN-SCRAPER] Failed to update state:', error);
    }
}

const humanDelay = (min: number, max: number) =>
    new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

interface RawLeadData {
    name: string;
    jobTitle: string;
    company: string;
    domain: string;
    linkedin: string;
    location: string;
    industries: string;
    companySize: string;
    keywords: string;
    apolloUrl: string;
    companyLinkedin: string;
}

interface ColumnMap {
    name: number;
    jobTitle: number;
    company: number;
    companyLinks: number;
    personLinks: number;
    industries: number;
    location: number;
    companySize: number;
    keywords: number;
}

/**
 * Build column map with semantic fallbacks
 */
async function buildColumnMap(page: Page): Promise<ColumnMap | null> {
    return await page.evaluate(() => {
        const headers = document.querySelectorAll('div[role="columnheader"]');
        const map: Record<string, number> = {};
        
        headers.forEach((header, index) => {
            const text = header.textContent?.trim().toLowerCase() || '';
            if (text) map[text] = index;
        });

        console.log('[COLUMN DETECTION] Headers:', Object.keys(map));

        // Helper to find column by content in first data row
        function findByContent(selector: string): number | null {
            const firstRow = document.querySelector('div[role="treegrid"] div[role="row"]:not(:has([role="columnheader"]))');
            if (!firstRow) return null;
            const cells = firstRow.querySelectorAll('div[role="gridcell"]');
            for (let i = 0; i < cells.length; i++) {
                if (cells[i].querySelector(selector)) return i;
            }
            return null;
        }

        const columnMap: any = {};

        // Name (required) - try header first, then semantic search
        columnMap.name = map['name'] ?? map['person'] ?? findByContent('a[href*="/people/"]') ?? 1;

        // Job Title
        columnMap.jobTitle = map['job title'] ?? map['title'] ?? 2;

        // Company
        columnMap.company = map['company'] ?? map['organization'] ?? 3;

        // Person Links (LinkedIn)
        columnMap.personLinks = map['links'] ?? map['person · links'] ?? findByContent('a[href*="linkedin.com/in/"]') ?? 4;

        // Company Links (required) - try header first, then semantic search
        columnMap.companyLinks = map['company · links'] ?? map['company links'] ?? map['website'] ?? findByContent('a[aria-label="website link"]') ?? 5;

        // Industries
        columnMap.industries = map['company · industries'] ?? map['industries'] ?? map['industry'] ?? 6;

        // Location
        columnMap.location = map['location'] ?? map['person locations'] ?? 7;

        // Company Size
        columnMap.companySize = map['company · number of employees'] ?? map['# employees'] ?? map['employees'] ?? 8;

        // Keywords
        columnMap.keywords = map['company · keywords'] ?? map['keywords'] ?? 9;

        console.log('[COLUMN DETECTION] Map:', columnMap);
        return columnMap as ColumnMap;
    });
}

/**
 * Extract leads from page (runs in browser context)
 */
async function extractLeadsFromPage(page: Page, columnMap: ColumnMap): Promise<RawLeadData[]> {
    return await page.evaluate((colMap) => {
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
            } catch (e) {
                console.warn('[DOMAIN EXTRACTION] Failed:', url, e);
            }
            return '';
        }

        const leads: RawLeadData[] = [];
        const table = document.querySelector('div[role="treegrid"]');
        if (!table) {
            console.error('[EXTRACTION] Table not found!');
            return [];
        }

        const rows = table.querySelectorAll('div[role="row"]');
        console.log('[EXTRACTION] Total rows:', rows.length);

        let extracted = 0;
        let skippedNoName = 0;
        let skippedNoDomain = 0;

        for (const row of rows) {
            // Skip header rows
            if (row.querySelector('div[role="columnheader"]')) continue;
            
            // Skip rows without checkbox
            if (!row.querySelector('input[type="checkbox"]')) continue;

            const cells = row.querySelectorAll('div[role="gridcell"]');
            if (cells.length < 5) continue;

            // === REQUIRED: NAME ===
            let name = '';
            let apolloUrl = '';
            
            const nameCell = cells[colMap.name];
            const nameLink = nameCell?.querySelector('a[href*="/people/"]');
            
            if (nameLink) {
                name = nameLink.textContent?.trim() || '';
                apolloUrl = (nameLink as HTMLAnchorElement).href;
            } else {
                // Fallback: search all cells
                for (const cell of cells) {
                    const link = cell.querySelector('a[href*="/people/"]');
                    if (link) {
                        name = link.textContent?.trim() || '';
                        apolloUrl = (link as HTMLAnchorElement).href;
                        break;
                    }
                }
            }

            if (!name) {
                skippedNoName++;
                continue;
            }

            // === REQUIRED: DOMAIN ===
            let domain = '';
            
            const companyLinksCell = cells[colMap.companyLinks];
            const websiteLink = companyLinksCell?.querySelector('a[aria-label="website link"]');
            
            if (websiteLink) {
                domain = extractDomain((websiteLink as HTMLAnchorElement).href);
            } else {
                // Fallback: search all cells
                for (const cell of cells) {
                    const link = cell.querySelector('a[aria-label="website link"]');
                    if (link) {
                        domain = extractDomain((link as HTMLAnchorElement).href);
                        break;
                    }
                }
            }

            if (!domain) {
                skippedNoDomain++;
                continue;
            }

            // === OPTIONAL FIELDS ===
            
            const jobTitle = cells[colMap.jobTitle]?.textContent?.trim() || '';
            const company = cells[colMap.company]?.textContent?.trim() || '';

            // Person LinkedIn
            let linkedin = '';
            const personLinksCell = cells[colMap.personLinks];
            const linkedinLink = personLinksCell?.querySelector('a[href*="linkedin.com/in/"]');
            if (linkedinLink) {
                linkedin = (linkedinLink as HTMLAnchorElement).href;
            } else {
                // Fallback
                for (const cell of cells) {
                    const link = cell.querySelector('a[href*="linkedin.com/in/"]');
                    if (link) {
                        linkedin = (link as HTMLAnchorElement).href;
                        break;
                    }
                }
            }

            // Company LinkedIn
            let companyLinkedin = '';
            const companyCell = cells[colMap.company];
            const companyLinkedinLink = companyCell?.querySelector('a[href*="linkedin.com/company/"]');
            if (companyLinkedinLink) {
                companyLinkedin = (companyLinkedinLink as HTMLAnchorElement).href;
            }

            const industries = cells[colMap.industries]?.textContent?.trim() || '';
            const location = cells[colMap.location]?.textContent?.trim() || '';
            const companySize = cells[colMap.companySize]?.textContent?.trim() || '';
            const keywords = cells[colMap.keywords]?.textContent?.trim() || '';

            leads.push({
                name, jobTitle, company, domain, linkedin, location, 
                industries, companySize, keywords, apolloUrl, companyLinkedin
            });
            extracted++;
        }
        
        console.log('[EXTRACTION] Extracted:', extracted);
        console.log('[EXTRACTION] Skipped - no name:', skippedNoName, 'no domain:', skippedNoDomain);
        
        return leads;
    }, columnMap);
}

function convertToScrapedLead(raw: RawLeadData): ScrapedLead {
    const nameParts = raw.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const keywords = raw.keywords 
        ? raw.keywords.split(/,|\s*\+\d+/).map(k => k.trim()).filter(k => k.length > 0)
        : [];

    return {
        first_name: firstName,
        last_name: lastName,
        title: raw.jobTitle,
        company_name: raw.company,
        website: raw.domain,
        location: raw.location,
        company_linkedin: raw.companyLinkedin,
        company_size: raw.companySize,
        industry: raw.industries,
        keywords: keywords,
        email: undefined,
        linkedin_url: raw.linkedin,
        phone_numbers: []
    };
}

export async function scrapeApollo(url: string, pages: number = 1, userId?: string, scrapeId?: string): Promise<ScrapedLead[]> {
    console.log('[GOLOGIN-SCRAPER] === Starting Scrape ===');
    console.log('[GOLOGIN-SCRAPER] URL:', url);
    console.log('[GOLOGIN-SCRAPER] Pages:', pages);
    
    const profileResult = await getUserProfileId(userId || '');
    if (!profileResult.profileId) throw new Error('No GoLogin profile available.');

    let page: Page | null = null;
    const allLeads: ScrapedLead[] = [];
    const profileId = profileResult.profileId; // Store for cleanup

    try {
        const browser = await getBrowserForProfile(profileResult.profileId);
        page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 900 });

        await updateScrapeState(scrapeId, { scraper_status: 'navigating' });
        
        console.log('[GOLOGIN-SCRAPER] Navigating...');
        
        // Simple, reliable navigation
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (navError: any) {
            console.warn('[GOLOGIN-SCRAPER] domcontentloaded timeout, trying load...');
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        }
        
        await humanDelay(2000, 3000);
        
        const currentUrl = page.url();
        console.log('[GOLOGIN-SCRAPER] Current URL:', currentUrl);
        
        if (currentUrl === 'about:blank' || currentUrl.startsWith('about:')) {
            throw new Error('Navigation failed - page is blank. Check if URL is valid.');
        }
        
        if (currentUrl.includes('/login')) {
            throw new Error('Not logged into Apollo. Please log in first.');
        }

        // Wait for table
        console.log('[GOLOGIN-SCRAPER] Waiting for table...');
        await page.waitForSelector('div[role="treegrid"]', { timeout: 20000 });
        await humanDelay(1000, 2000);

        // Build column map once
        const columnMap = await buildColumnMap(page);
        if (!columnMap) {
            throw new Error('Failed to detect table columns.');
        }
        console.log('[GOLOGIN-SCRAPER] Column map:', columnMap);

        for (let currentPage = 1; currentPage <= pages; currentPage++) {
            if (await isScrapeCancelled(scrapeId)) throw new Error('Scrape cancelled.');

            await updateScrapeState(scrapeId, { 
                scraper_status: 'extracting', 
                current_page: currentPage, 
                total_pages: pages 
            });
            
            console.log(`[GOLOGIN-SCRAPER] Extracting page ${currentPage}/${pages}...`);

            const rawLeads = await extractLeadsFromPage(page, columnMap);
            console.log(`[GOLOGIN-SCRAPER] Extracted ${rawLeads.length} leads from page ${currentPage}`);

            if (rawLeads.length > 0) {
                console.log('[GOLOGIN-SCRAPER] Sample:', {
                    name: rawLeads[0].name,
                    domain: rawLeads[0].domain,
                    company: rawLeads[0].company
                });
            }

            for (const raw of rawLeads) {
                allLeads.push(convertToScrapedLead(raw));
            }
            
            await updateScrapeState(scrapeId, { rows_extracted: allLeads.length });

            if (currentPage < pages) {
                await updateScrapeState(scrapeId, { scraper_status: 'paginating' });
                
                const nextBtn = await page.$('button[aria-label="Next"]');
                if (nextBtn && !(await page.evaluate(el => el.hasAttribute('disabled'), nextBtn))) {
                    console.log('[GOLOGIN-SCRAPER] Clicking next page...');
                    await humanDelay(1500, 2500);
                    await nextBtn.click();
                    
                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    } catch (navError) {
                        console.warn('[GOLOGIN-SCRAPER] Pagination navigation timeout, continuing...');
                        await humanDelay(2000, 3000);
                    }
                    
                    // Wait for table to reload
                    await page.waitForSelector('div[role="treegrid"]', { timeout: 15000 });
                    await humanDelay(1000, 2000);
                } else {
                    console.log('[GOLOGIN-SCRAPER] No more pages.');
                    break;
                }
            }
        }

        await updateScrapeState(scrapeId, { scraper_status: 'completed', rows_extracted: allLeads.length });
        console.log(`[GOLOGIN-SCRAPER] ✓ Completed! Total: ${allLeads.length} leads`);
        return allLeads;

    } catch (error) {
        console.error('[GOLOGIN-SCRAPER] Failed:', error);
        await updateScrapeState(scrapeId, { scraper_status: 'failed' });
        throw error;
    } finally {
        // Clean up page
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.warn('[GOLOGIN-SCRAPER] Error closing page:', e);
            }
        }
        
        // FRESH CONNECTION POLICY: Always disconnect browser after scrape
        // This ensures the next scrape gets a completely fresh browser instance
        console.log('[GOLOGIN-SCRAPER] Disconnecting browser for fresh instance on next scrape...');
        try {
            const manager = getBrowserManagerForProfile(profileId);
            await manager.disconnect();
            console.log('[GOLOGIN-SCRAPER] ✓ Browser disconnected');
        } catch (e) {
            console.warn('[GOLOGIN-SCRAPER] Error disconnecting browser:', e);
        }
    }
}