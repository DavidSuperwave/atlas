#!/usr/bin/env node

/**
 * GoLogin Scrape Test Script
 * 
 * Tests the complete flow:
 * 1. Start GoLogin profile using official SDK
 * 2. Connect Puppeteer via WebSocket
 * 3. Navigate to Apollo search page
 * 4. Extract lead data
 * 5. Clean up
 * 
 * Prerequisites:
 * - GOLOGIN_API_TOKEN set in .env.local
 * - GOLOGIN_PROFILE_ID set in .env.local (or passed as argument)
 * - Profile has Apollo.io logged in (manual step)
 * 
 * Usage:
 *   node scripts/test-gologin-scrape.js
 *   node scripts/test-gologin-scrape.js [profile_id]
 *   GOLOGIN_DEBUG=true node scripts/test-gologin-scrape.js
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
                    // Remove quotes if present
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
        console.log('✓ Loaded environment from .env.local');
    }
}

loadEnv();

// Import GoLogin SDK after env is loaded
const { GoLogin } = require('gologin');

const API_TOKEN = process.env.GOLOGIN_API_TOKEN;
const PROFILE_ID = process.argv[2] || process.env.GOLOGIN_PROFILE_ID;
const DEBUG = process.env.GOLOGIN_DEBUG === 'true';

// Test Apollo URL - you can change this to test different searches
const TEST_URL = 'https://app.apollo.io/';

function log(message, data) {
    const timestamp = new Date().toISOString().substring(11, 19);
    if (data !== undefined) {
        console.log(`[${timestamp}] ${message}`, data);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
}

function debugLog(message, data) {
    if (DEBUG) {
        log(`[DEBUG] ${message}`, data);
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract leads from the current Apollo page
 */
async function extractLeads(page) {
    log('Extracting leads from page...');
    
    // Wait for the table to load
    try {
        await page.waitForSelector('table tbody tr', { timeout: 10000 });
    } catch {
        log('No table rows found - may not be on a search results page');
        return [];
    }

    // Extract lead data
    const leads = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        return Array.from(rows).slice(0, 10).map(row => {
            const cells = row.querySelectorAll('td');
            
            // Get name - usually in first cell
            const nameCell = cells[0];
            const nameLink = nameCell?.querySelector('a');
            const name = nameLink?.textContent?.trim() || nameCell?.textContent?.trim() || '';
            
            // Get title - usually in second or third cell  
            const titleCell = cells[1] || cells[2];
            const title = titleCell?.textContent?.trim() || '';
            
            // Get company - look for company link
            let company = '';
            for (const cell of cells) {
                const companyLink = cell.querySelector('a[href*="/companies/"]');
                if (companyLink) {
                    company = companyLink.textContent?.trim() || '';
                    break;
                }
            }
            
            // Get email if visible
            let email = '';
            for (const cell of cells) {
                const text = cell.textContent || '';
                const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
                if (emailMatch) {
                    email = emailMatch[0];
                    break;
                }
            }
            
            return { name, title, company, email };
        }).filter(lead => lead.name);
    });

    log(`Found ${leads.length} leads`);
    return leads;
}

/**
 * Check if logged into Apollo
 */
async function checkApolloLogin(page) {
    // Look for common logged-in indicators
    const isLoggedIn = await page.evaluate(() => {
        // Check for user menu, search input, or dashboard elements
        return !!(
            document.querySelector('[data-cy="user-menu"]') ||
            document.querySelector('[class*="UserMenu"]') ||
            document.querySelector('[placeholder*="Search"]') ||
            document.querySelector('[class*="SearchBar"]') ||
            document.querySelector('[class*="sidebar"]') ||
            // Also check URL patterns
            window.location.href.includes('/people') ||
            window.location.href.includes('/companies') ||
            window.location.href.includes('/dashboard')
        );
    });
    
    return isLoggedIn;
}

async function main() {
    console.log('\n========================================');
    console.log('GoLogin Scrape Test');
    console.log('========================================\n');
    
    // Validate configuration
    if (!API_TOKEN) {
        console.error('❌ GOLOGIN_API_TOKEN is not set');
        console.log('Set it in .env.local or as environment variable');
        process.exit(1);
    }
    
    if (!PROFILE_ID) {
        console.error('❌ GOLOGIN_PROFILE_ID is not set');
        console.log('Set it in .env.local, as environment variable, or pass as argument:');
        console.log('  node scripts/test-gologin-scrape.js <profile_id>');
        process.exit(1);
    }
    
    log(`API Token: ${API_TOKEN.substring(0, 20)}...`);
    log(`Profile ID: ${PROFILE_ID}`);
    log(`Test URL: ${TEST_URL}`);
    log(`Debug Mode: ${DEBUG}`);
    console.log('');
    
    let GL = null;
    let browser = null;
    
    try {
        // Step 1: Create GoLogin instance
        log('Creating GoLogin SDK instance...');
        GL = new GoLogin({
            token: API_TOKEN,
            profile_id: PROFILE_ID,
            // Upload cookies to server after stopping (preserves session)
            uploadCookiesToServer: true,
            // Import cookies from server on start  
            writeCookesFromServer: true,
        });
        log('✓ GoLogin SDK instance created');
        
        // Step 2: Start the profile
        log('Starting browser profile...');
        log('(This will download Orbita browser on first run - may take a few minutes)');
        
        const startResult = await GL.start();
        debugLog('Start result:', startResult);
        
        const { status, wsUrl } = startResult;
        
        if (status !== 'success') {
            throw new Error(`Failed to start profile: status=${status}`);
        }
        
        log(`✓ Profile started successfully`);
        log(`WebSocket URL: ${wsUrl}`);
        console.log('');
        
        // Step 3: Connect Puppeteer
        log('Connecting Puppeteer...');
        browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null,
        });
        log('✓ Puppeteer connected');
        
        // Get pages
        const pages = await browser.pages();
        log(`Found ${pages.length} existing page(s)`);
        
        // Use existing page or create new one
        let page = pages[0] || await browser.newPage();
        
        // Step 4: Navigate to Apollo
        log(`Navigating to ${TEST_URL}...`);
        await page.goto(TEST_URL, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });
        
        const currentUrl = page.url();
        log(`Current URL: ${currentUrl}`);
        
        // Step 5: Check login status
        log('Checking Apollo login status...');
        await sleep(2000); // Wait for any redirects
        
        const isLoggedIn = await checkApolloLogin(page);
        
        if (isLoggedIn) {
            log('✓ Logged into Apollo!');
            
            // Try to navigate to people search
            if (!currentUrl.includes('/people')) {
                log('Navigating to People search...');
                await page.goto('https://app.apollo.io/#/people', {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                await sleep(3000);
            }
            
            // Extract sample leads
            const leads = await extractLeads(page);
            
            if (leads.length > 0) {
                console.log('\n--- Sample Leads ---');
                leads.slice(0, 5).forEach((lead, i) => {
                    console.log(`${i + 1}. ${lead.name}`);
                    if (lead.title) console.log(`   Title: ${lead.title}`);
                    if (lead.company) console.log(`   Company: ${lead.company}`);
                    if (lead.email) console.log(`   Email: ${lead.email}`);
                });
                console.log('-------------------\n');
            }
        } else {
            log('⚠️ Not logged into Apollo');
            log('The profile needs to be logged into Apollo manually first.');
            log('Steps:');
            log('1. Open GoLogin app');
            log('2. Run this profile');
            log('3. Navigate to app.apollo.io and log in');
            log('4. Close the browser (cookies will be saved)');
            log('5. Run this test again');
            
            // Take a screenshot for debugging
            const screenshotPath = path.join(process.cwd(), 'apollo-login-check.png');
            await page.screenshot({ path: screenshotPath, fullPage: true });
            log(`Screenshot saved to: ${screenshotPath}`);
        }
        
        // Get page title
        const title = await page.title();
        log(`Page title: ${title}`);
        
        console.log('\n========================================');
        console.log('✓ Test completed successfully!');
        console.log('========================================\n');
        
        // Summary
        console.log('SUMMARY:');
        console.log(`- Profile started: ✓`);
        console.log(`- Puppeteer connected: ✓`);
        console.log(`- Apollo logged in: ${isLoggedIn ? '✓' : '✗ (needs manual login)'}`);
        console.log('');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (DEBUG && error.stack) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    } finally {
        // Cleanup
        if (browser) {
            log('Disconnecting Puppeteer...');
            try {
                await browser.disconnect();
                log('✓ Puppeteer disconnected');
            } catch (e) {
                debugLog('Disconnect error:', e.message);
            }
        }
        
        if (GL) {
            log('Stopping GoLogin profile...');
            try {
                await GL.stop();
                log('✓ Profile stopped (cookies saved to server)');
            } catch (e) {
                debugLog('Stop error:', e.message);
            }
        }
    }
}

main();

