#!/usr/bin/env node

/**
 * GoLogin Cloud Mode - End-to-End Scrape Test
 * 
 * Tests actual lead extraction from Apollo using cloud mode.
 * This simulates what will happen when a user submits a scrape.
 * 
 * Usage:
 *   GOLOGIN_CLOUD_MODE=true node scripts/test-cloud-scrape.js
 *   GOLOGIN_CLOUD_MODE=true node scripts/test-cloud-scrape.js <profile_id>
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Load .env.local
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    let value = trimmed.substring(eqIndex + 1).trim();
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    }
}

loadEnv();

const API_TOKEN = process.env.GOLOGIN_API_TOKEN;
const PROFILE_ID = process.argv[2] || process.env.GOLOGIN_PROFILE_ID;
const CLOUD_MODE = process.env.GOLOGIN_CLOUD_MODE === 'true';

const CLOUD_WS_URL = 'https://cloudbrowser.gologin.com';

// Test Apollo search URL - simple US people search
const TEST_URL = 'https://app.apollo.io/#/people?personLocations[]=United%20States&page=1';

function log(message, data) {
    const timestamp = new Date().toISOString().substring(11, 19);
    if (data !== undefined) {
        console.log(`[${timestamp}] ${message}`, data);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract leads from Apollo page
 */
async function extractLeads(page) {
    log('Extracting leads from page...');
    
    const leads = await page.evaluate(() => {
        const results = [];
        
        // Try multiple row selectors
        const rowSelectors = [
            'table tbody tr',
            '[data-cy="people-table"] tr',
            'div[role="row"]',
            '.zp_tZMWg tbody tr'
        ];
        
        let rows = [];
        for (const selector of rowSelectors) {
            rows = document.querySelectorAll(selector);
            if (rows.length > 0) break;
        }
        
        for (const row of rows) {
            // Get name
            const nameEl = row.querySelector('a[href*="/people/"]') ||
                          row.querySelector('[data-cy="person-name"]') ||
                          row.querySelector('td:first-child a');
            
            const name = nameEl?.textContent?.trim();
            if (!name) continue;
            
            // Get title
            const titleEl = row.querySelector('[class*="title"]') ||
                           row.querySelector('td:nth-child(2)');
            const title = titleEl?.textContent?.trim() || '';
            
            // Get company
            const companyEl = row.querySelector('a[href*="/companies/"]') ||
                             row.querySelector('[class*="company"]');
            const company = companyEl?.textContent?.trim() || '';
            
            // Get email (if visible)
            let email = '';
            const emailEl = row.querySelector('[data-cy="email"]') ||
                           row.querySelector('a[href^="mailto:"]');
            if (emailEl) {
                email = emailEl.textContent?.trim() || 
                       emailEl.getAttribute('href')?.replace('mailto:', '') || '';
            }
            
            // Get LinkedIn
            const linkedinEl = row.querySelector('a[href*="linkedin.com"]');
            const linkedinUrl = linkedinEl?.getAttribute('href') || '';
            
            results.push({
                name,
                title,
                company,
                email,
                linkedinUrl
            });
        }
        
        return results;
    });
    
    return leads;
}

async function main() {
    console.log('\n========================================');
    console.log('Cloud Mode - End-to-End Scrape Test');
    console.log('========================================\n');
    
    if (!CLOUD_MODE) {
        console.log('ERROR: Run with GOLOGIN_CLOUD_MODE=true');
        process.exit(1);
    }
    
    if (!API_TOKEN || !PROFILE_ID || PROFILE_ID === 'your-profile-id-here') {
        console.log('ERROR: Set GOLOGIN_API_TOKEN and GOLOGIN_PROFILE_ID');
        process.exit(1);
    }
    
    log(`Profile ID: ${PROFILE_ID}`);
    log(`Test URL: ${TEST_URL}`);
    
    let browser = null;
    
    try {
        // Build cloud WebSocket URL
        const wsUrl = `${CLOUD_WS_URL}/connect?token=${API_TOKEN}&profile=${PROFILE_ID}`;
        
        // Connect Puppeteer
        log('Connecting to cloud browser...');
        browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null,
        });
        log('✓ Connected to cloud browser');
        
        // Get/create page
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        
        // Navigate to search URL
        log('Navigating to Apollo search...');
        await page.goto(TEST_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // Wait for page to load
        await sleep(5000);
        
        const currentUrl = page.url();
        log(`Current URL: ${currentUrl}`);
        
        // Check if redirected to login
        if (currentUrl.includes('/login') || currentUrl.includes('/sign')) {
            log('ERROR: Not logged into Apollo');
            log('Please log into Apollo using the GoLogin profile first');
            process.exit(1);
        }
        
        // Wait for table
        log('Waiting for lead table...');
        const tableSelectors = [
            'table tbody tr',
            '[data-cy="people-table"]',
            'div[role="treegrid"]',
            '.zp_tZMWg'
        ];
        
        let tableFound = false;
        for (const selector of tableSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 15000 });
                log(`✓ Table found (${selector})`);
                tableFound = true;
                break;
            } catch {
                continue;
            }
        }
        
        if (!tableFound) {
            log('WARNING: No lead table found - page may still be loading');
            
            // Take screenshot for debugging
            const screenshotPath = path.join(process.cwd(), 'cloud-scrape-debug.png');
            await page.screenshot({ path: screenshotPath, fullPage: true });
            log(`Debug screenshot saved: ${screenshotPath}`);
        }
        
        // Extract leads
        await sleep(2000); // Extra wait for dynamic content
        const leads = await extractLeads(page);
        
        log(`\n✓ Extracted ${leads.length} leads`);
        
        if (leads.length > 0) {
            console.log('\n--- Sample Leads ---');
            leads.slice(0, 5).forEach((lead, i) => {
                console.log(`${i + 1}. ${lead.name}`);
                if (lead.title) console.log(`   Title: ${lead.title}`);
                if (lead.company) console.log(`   Company: ${lead.company}`);
                if (lead.email) console.log(`   Email: ${lead.email}`);
                if (lead.linkedinUrl) console.log(`   LinkedIn: ${lead.linkedinUrl}`);
            });
            console.log('-------------------\n');
            
            console.log('========================================');
            console.log('✅ END-TO-END SCRAPE TEST PASSED');
            console.log('========================================');
            console.log(`Leads extracted: ${leads.length}`);
            console.log('Cloud mode is working correctly!\n');
            
        } else {
            console.log('\n========================================');
            console.log('⚠️ NO LEADS EXTRACTED');
            console.log('========================================');
            console.log('This could mean:');
            console.log('- Page still loading');
            console.log('- No results for this search');
            console.log('- Selectors need updating');
            console.log('Check the debug screenshot.\n');
        }
        
    } catch (error) {
        console.error('\n❌ Scrape test failed:', error.message);
        process.exit(1);
    } finally {
        if (browser) {
            log('Disconnecting browser...');
            try {
                await browser.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
        }
    }
}

main();

