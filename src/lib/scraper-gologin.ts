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
            } catch {}
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

                // ========================================
                // STEP 1: Find NAME (REQUIRED)
                // The name is a link with href containing "/people/"
                // ========================================
                let name = '';
                let apolloUrl = '';
                
                const personLink = row.querySelector('a[href*="/people/"]') as HTMLAnchorElement;
                if (personLink) {
                    name = personLink.textContent?.trim() || '';
                    apolloUrl = personLink.href || '';
                    if (apolloUrl && !apolloUrl.startsWith('http')) {
                        apolloUrl = `https://app.apollo.io${apolloUrl}`;
                    }
                }

                if (!name || 
                    name.toLowerCase().includes('access') || 
                    name.toLowerCase().includes('email') ||
                    name.length < 2) {
                    diagnostics.skippedNoName++;
                    continue;
                }

                // ========================================
                // STEP 2: Find DOMAIN (REQUIRED)
                // Apollo's website link is in the "Company · Links" column
                // Column has: aria-colindex="13", data-id="account.social"
                // We MUST find the link with aria-label="website link" - NOT social links
                // ========================================
                let domain = '';
                let domainMethod = '';
                
                // METHOD 1: Find the "Company · Links" column specifically by aria-colindex="13"
                // This is the most reliable method - target the exact column
                const companyLinksCell = row.querySelector('[aria-colindex="13"]') || 
                                         row.querySelector('[data-id="account.social"]');
                if (companyLinksCell) {
                    // Look for the website link in this specific cell
                    const websiteLink = companyLinksCell.querySelector('a[aria-label="website link"]') as HTMLAnchorElement;
                    if (websiteLink) {
                        const href = websiteLink.getAttribute('data-href') || 
                                    websiteLink.getAttribute('href') || 
                                    websiteLink.href || '';
                        if (href && 
                            !href.includes('apollo.io') && 
                            !href.includes('linkedin.com') &&
                            !href.includes('facebook.com') &&
                            !href.includes('twitter.com')) {
                            domain = extractDomain(href);
                            if (domain) {
                                domainMethod = 'company-links-col-13';
                            }
                        }
                    }
                }
                
                // METHOD 2: Direct search for website link anywhere in row
                if (!domain) {
                    const websiteLink = row.querySelector('a[aria-label="website link"]') as HTMLAnchorElement;
                    if (websiteLink) {
                        const href = websiteLink.getAttribute('data-href') || 
                                    websiteLink.getAttribute('href') || 
                                    websiteLink.href || '';
                        if (href && 
                            !href.includes('apollo.io') && 
                            !href.includes('linkedin.com') &&
                            !href.includes('facebook.com') &&
                            !href.includes('twitter.com')) {
                            domain = extractDomain(href);
                            if (domain) {
                                domainMethod = 'aria-label-website-link';
                            }
                        }
                    }
                }
                
                // METHOD 3: Look in cells that contain social links (indicates it's the links column)
                if (!domain) {
                    const cells = row.querySelectorAll('[role="gridcell"], [role="cell"], td');
                    for (const cell of cells) {
                        // Check if this cell has any social links (indicates it's the Company Links column)
                        const hasSocialLinks = cell.querySelector('a[aria-label="linkedin link"], a[aria-label="facebook link"], a[aria-label="twitter link"]');
                        if (hasSocialLinks) {
                            // This is the Company Links column - look for website link
                            const websiteLinkInCell = cell.querySelector('a[aria-label="website link"]') as HTMLAnchorElement;
                            if (websiteLinkInCell) {
                                const href = websiteLinkInCell.getAttribute('data-href') || 
                                            websiteLinkInCell.getAttribute('href') || 
                                            websiteLinkInCell.href || '';
                                if (href && 
                                    !href.includes('apollo.io') && 
                                    !href.includes('linkedin.com') &&
                                    !href.includes('facebook.com') &&
                                    !href.includes('twitter.com')) {
                                    domain = extractDomain(href);
                                    if (domain) {
                                        domainMethod = 'company-links-cell';
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // METHOD 4: Search all cells for website link
                if (!domain) {
                    const cells = row.querySelectorAll('[role="gridcell"], [role="cell"], td');
                    for (const cell of cells) {
                        const websiteLinkInCell = cell.querySelector('a[aria-label="website link"]') as HTMLAnchorElement;
                        if (websiteLinkInCell) {
                            const href = websiteLinkInCell.getAttribute('data-href') || 
                                        websiteLinkInCell.getAttribute('href') || 
                                        websiteLinkInCell.href || '';
                            if (href && 
                                !href.includes('apollo.io') && 
                                !href.includes('linkedin.com') &&
                                !href.includes('facebook.com') &&
                                !href.includes('twitter.com')) {
                                domain = extractDomain(href);
                                if (domain) {
                                    domainMethod = 'cell-website-link';
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // METHOD 5: Look for data-href with website URLs (not social)
                if (!domain) {
                    const elementsWithHref = row.querySelectorAll('a[data-href]') as NodeListOf<HTMLAnchorElement>;
                    for (const el of elementsWithHref) {
                        const ariaLabel = el.getAttribute('aria-label') || '';
                        // Only accept website links, skip social
                        if (ariaLabel === 'website link') {
                            const href = el.getAttribute('data-href') || '';
                            if (href && 
                                !href.includes('apollo.io') && 
                                !href.includes('linkedin.com') &&
                                !href.includes('facebook.com') &&
                                !href.includes('twitter.com')) {
                                domain = extractDomain(href);
                                if (domain) {
                                    domainMethod = 'data-href-website';
                                    break;
                                }
                            }
                        }
                    }
                }

                if (!domain) {
                    // Debug: log what's in the Company Links column (col 13)
                    const debugInfo: string[] = [];
                    
                    // Check column 13 specifically
                    const col13 = row.querySelector('[aria-colindex="13"]');
                    if (col13) {
                        const col13Links = col13.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>;
                        col13Links.forEach(link => {
                            const href = link.getAttribute('data-href') || link.getAttribute('href') || '';
                            const label = link.getAttribute('aria-label') || '';
                            if (href) {
                                debugInfo.push(`col13:[${label || 'no-label'}]:${href.substring(0, 40)}`);
                            }
                        });
                        if (col13Links.length === 0) {
                            debugInfo.push('col13:no-links');
                        }
                    } else {
                        debugInfo.push('col13:not-found');
                    }
                    
                    // Also log all links in row for comparison
                    const allRowLinks = row.querySelectorAll('a[aria-label]') as NodeListOf<HTMLAnchorElement>;
                    allRowLinks.forEach(link => {
                        const href = link.getAttribute('data-href') || link.getAttribute('href') || '';
                        const label = link.getAttribute('aria-label') || '';
                        if (href && label) {
                            debugInfo.push(`[${label}]:${href.substring(0, 30)}`);
                        }
                    });
                    
                    if (diagnostics.errors.length < 5) {
                        diagnostics.errors.push(`Row ${rowIndex} (${name}) - ${debugInfo.join(', ')}`);
                    }
                    diagnostics.skippedNoDomain++;
                    continue;
                }
                
                // Track which method found this domain
                if (domainMethod) {
                    diagnostics.domainMethods[domainMethod] = (diagnostics.domainMethods[domainMethod] || 0) + 1;
                }

                // ========================================
                // STEP 3: Extract optional fields
                // ========================================
                const cells = row.querySelectorAll('[role="cell"], [role="gridcell"], td');
                
                // Title - first cell that's not the name
                let title = '';
                for (let i = 0; i < Math.min(cells.length, 3); i++) {
                    const text = cells[i]?.textContent?.trim() || '';
                    if (text && text !== name && !text.toLowerCase().includes('access') && text.length > 2 && text.length < 100) {
                        title = text;
                        break;
                    }
                }

                // Company name
                let companyName = '';
                const companyLink = row.querySelector('a[href*="/organization"]') || row.querySelector('a[href*="/account"]');
                if (companyLink) {
                    companyName = companyLink.textContent?.trim() || '';
                }
                if (!companyName) {
                    for (let i = 1; i < Math.min(cells.length, 4); i++) {
                        const text = cells[i]?.textContent?.trim() || '';
                        if (text && text !== name && text !== title && !text.toLowerCase().includes('access') && text.length > 1) {
                            companyName = text;
                            break;
                        }
                    }
                }

                // Company LinkedIn
                let companyLinkedin = '';
                const linkedinLink = row.querySelector('a[href*="linkedin.com/company"]') as HTMLAnchorElement;
                if (linkedinLink) companyLinkedin = linkedinLink.href || '';

                // Location (City, State pattern)
                let location = '';
                for (const cell of cells) {
                    const text = cell.textContent?.trim() || '';
                    if (text.includes(',') && text.length < 60) {
                        location = text;
                        break;
                    }
                }

                // Company size (number pattern)
                let companySize = '';
                for (const cell of cells) {
                    const text = cell.textContent?.trim() || '';
                    if (text.match(/^\d+[-–]\d+$/) || text.match(/^\d+\+$/)) {
                        companySize = text;
                        break;
                    }
                }

                // Phone numbers
                const phoneNumbers: string[] = [];
                const telLinks = row.querySelectorAll('a[href^="tel:"]');
                telLinks.forEach(tel => {
                    const phone = tel.textContent?.trim();
                    if (phone && !phone.toLowerCase().includes('access')) {
                        phoneNumbers.push(phone);
                    }
                });

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
                    industry: '',
                    companyLinkedin,
                    phoneNumbers,
                    apolloUrl
                });

                diagnostics.successfulExtractions++;

            } catch (err) {
                diagnostics.errors.push(`Row ${rowIndex}: ${err}`);
            }
        }

        return { leads, diagnostics };
    });
}

function convertToScrapedLead(raw: RawLeadData): ScrapedLead {
    const nameParts = raw.name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    return {
        first_name: firstName,
        last_name: lastName,
        title: raw.title,
        company_name: raw.companyName,
        company_linkedin: raw.companyLinkedin,
        location: raw.location,
        company_size: raw.companySize,
        industry: raw.industry,
        website: raw.domain ? `https://${raw.domain}` : '',
        keywords: [],
        email: undefined,
        linkedin_url: raw.apolloUrl,
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
        const browser = await getBrowserForProfile(profileResult.profileId);
        page = await browser.newPage();
        page.setDefaultTimeout(SCRAPE_TIMEOUT);
        await page.setViewport({ width: 1366, height: 768 });

        console.log(`[GOLOGIN-SCRAPER] Navigating...`);
        try {
            await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        } catch {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

            await page.evaluate(() => window.scrollBy(0, 300));
            await humanDelay(500, 1000);

            // Extract
            const { leads: rawLeads, diagnostics } = await extractAllLeadsFromPage(page);
            
            // Log results
            console.log(`[GOLOGIN-SCRAPER] ========== RESULTS ==========`);
            console.log(`[GOLOGIN-SCRAPER] Rows: ${diagnostics.rowsFound}`);
            console.log(`[GOLOGIN-SCRAPER] Skipped (no name): ${diagnostics.skippedNoName}`);
            console.log(`[GOLOGIN-SCRAPER] Skipped (no domain): ${diagnostics.skippedNoDomain}`);
            console.log(`[GOLOGIN-SCRAPER] Extracted: ${diagnostics.successfulExtractions}`);
            if (Object.keys(diagnostics.domainMethods).length > 0) {
                console.log(`[GOLOGIN-SCRAPER] Domain extraction methods used:`);
                for (const [method, count] of Object.entries(diagnostics.domainMethods)) {
                    console.log(`[GOLOGIN-SCRAPER]   ${method}: ${count}`);
                }
            }
            if (diagnostics.sampleData.length > 0) {
                console.log(`[GOLOGIN-SCRAPER] Samples:`);
                diagnostics.sampleData.forEach(s => console.log(`[GOLOGIN-SCRAPER]   ${s}`));
            }
            if (diagnostics.errors.length > 0) {
                console.log(`[GOLOGIN-SCRAPER] Errors: ${diagnostics.errors.slice(0, 3).join('; ')}`);
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
            try { await page.close(); } catch {}
        }
    }
}

export async function getScraperProfileInfo(userId?: string): Promise<ProfileLookupResult> {
    return getProfileForScrape(userId);
}
