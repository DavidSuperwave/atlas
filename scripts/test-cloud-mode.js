#!/usr/bin/env node

/**
 * GoLogin Cloud Mode Test Script
 * 
 * Tests the complete cloud mode flow for Railway deployment:
 * 1. WebSocket URL construction
 * 2. Profile start in cloud mode
 * 3. Puppeteer connection
 * 4. Apollo navigation
 * 5. Session persistence
 * 6. Error handling
 * 
 * Prerequisites:
 * - GOLOGIN_API_TOKEN set in .env.local
 * - GOLOGIN_PROFILE_ID set in .env.local
 * 
 * Usage:
 *   GOLOGIN_CLOUD_MODE=true node scripts/test-cloud-mode.js
 *   GOLOGIN_CLOUD_MODE=true GOLOGIN_DEBUG=true node scripts/test-cloud-mode.js
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
        console.log('✓ Loaded environment from .env.local');
    }
}

loadEnv();

const API_TOKEN = process.env.GOLOGIN_API_TOKEN;
const PROFILE_ID = process.argv[2] || process.env.GOLOGIN_PROFILE_ID;
const CLOUD_MODE = process.env.GOLOGIN_CLOUD_MODE === 'true';
const DEBUG = process.env.GOLOGIN_DEBUG === 'true';

const CLOUD_WS_URL = 'https://cloudbrowser.gologin.com';

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

// Test results tracking
const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function recordTest(name, passed, message = '') {
    testResults.tests.push({ name, passed, message });
    if (passed) {
        testResults.passed++;
        console.log(`  ✓ ${name}`);
    } else {
        testResults.failed++;
        console.log(`  ✗ ${name}: ${message}`);
    }
}

/**
 * Test 1: WebSocket URL Construction
 */
async function testWebSocketConstruction() {
    console.log('\n=== Test 1: WebSocket URL Construction ===');
    
    try {
        // Verify cloud mode is enabled
        if (!CLOUD_MODE) {
            recordTest('Cloud mode enabled', false, 'GOLOGIN_CLOUD_MODE is not set to true');
            return false;
        }
        recordTest('Cloud mode enabled', true);
        
        // Verify API token exists
        if (!API_TOKEN) {
            recordTest('API token configured', false, 'GOLOGIN_API_TOKEN not set');
            return false;
        }
        recordTest('API token configured', true);
        
        // Verify profile ID exists
        if (!PROFILE_ID) {
            recordTest('Profile ID configured', false, 'GOLOGIN_PROFILE_ID not set');
            return false;
        }
        recordTest('Profile ID configured', true);
        
        // Construct WebSocket URL
        const wsUrl = `${CLOUD_WS_URL}/connect?token=${API_TOKEN}&profile=${PROFILE_ID}`;
        
        // Verify URL format
        const urlValid = wsUrl.startsWith('https://cloudbrowser.gologin.com/connect?') &&
                        wsUrl.includes('token=') &&
                        wsUrl.includes('profile=');
        
        if (!urlValid) {
            recordTest('WebSocket URL format', false, 'Invalid URL format');
            return false;
        }
        recordTest('WebSocket URL format', true);
        
        log(`WebSocket URL: ${wsUrl.substring(0, 70)}...`);
        
        return true;
    } catch (error) {
        recordTest('WebSocket construction', false, error.message);
        return false;
    }
}

/**
 * Test 2: Profile Start (Cloud Mode)
 */
async function testProfileStart() {
    console.log('\n=== Test 2: Profile Start (Cloud Mode) ===');
    
    try {
        log('Constructing cloud WebSocket URL...');
        
        const wsUrl = `${CLOUD_WS_URL}/connect?token=${API_TOKEN}&profile=${PROFILE_ID}`;
        
        // In cloud mode, we don't need to "start" the profile - we just construct the URL
        // The cloud server handles browser management
        
        if (!wsUrl) {
            recordTest('WebSocket URL generated', false, 'Failed to generate URL');
            return { success: false };
        }
        recordTest('WebSocket URL generated', true);
        
        log('Cloud profile WebSocket ready');
        log(`Endpoint: ${wsUrl.substring(0, 60)}...`);
        
        return { success: true, wsUrl };
    } catch (error) {
        recordTest('Profile start', false, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test 3: Puppeteer Connection
 */
async function testPuppeteerConnection(wsUrl) {
    console.log('\n=== Test 3: Puppeteer Connection ===');
    
    let browser = null;
    
    try {
        log('Connecting Puppeteer to cloud browser...');
        debugLog('WebSocket endpoint:', wsUrl);
        
        browser = await puppeteer.connect({
            browserWSEndpoint: wsUrl,
            defaultViewport: null,
        });
        
        if (!browser) {
            recordTest('Browser connected', false, 'Browser object is null');
            return { success: false };
        }
        recordTest('Browser connected', true);
        
        // Check if browser is actually connected
        const connected = browser.connected;
        if (!connected) {
            recordTest('Browser responsive', false, 'Browser not responsive');
            return { success: false, browser };
        }
        recordTest('Browser responsive', true);
        
        // Get pages
        const pages = await browser.pages();
        log(`Found ${pages.length} page(s)`);
        recordTest('Can list pages', true);
        
        return { success: true, browser, pages };
    } catch (error) {
        recordTest('Puppeteer connection', false, error.message);
        
        // Provide specific guidance based on error
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            log('ERROR: Invalid API token. Check GOLOGIN_API_TOKEN');
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            log('ERROR: Profile not found. Check GOLOGIN_PROFILE_ID');
        } else if (error.message.includes('timeout')) {
            log('ERROR: Connection timeout. Check network/GoLogin status');
        } else if (error.message.includes('WebSocket')) {
            log('ERROR: WebSocket connection failed. GoLogin cloud may be unavailable');
        }
        
        return { success: false, browser, error: error.message };
    }
}

/**
 * Test 4: Apollo Navigation
 */
async function testApolloNavigation(browser) {
    console.log('\n=== Test 4: Apollo Navigation ===');
    
    let page = null;
    
    try {
        // Get or create page
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        
        log('Navigating to Apollo...');
        await page.goto('https://app.apollo.io/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        recordTest('Navigate to Apollo', true);
        
        const currentUrl = page.url();
        log(`Current URL: ${currentUrl}`);
        
        // Wait for page to settle
        await sleep(3000);
        
        // Check if logged in
        const isLoggedIn = await page.evaluate(() => {
            return !!(
                document.querySelector('[data-cy="user-menu"]') ||
                document.querySelector('[class*="UserMenu"]') ||
                document.querySelector('[placeholder*="Search"]') ||
                document.querySelector('[class*="SearchBar"]') ||
                document.querySelector('[class*="sidebar"]') ||
                window.location.href.includes('/people') ||
                window.location.href.includes('/companies') ||
                window.location.href.includes('/dashboard')
            );
        });
        
        if (isLoggedIn) {
            recordTest('Apollo session active', true);
            log('✓ Logged into Apollo - cookies loaded from profile');
        } else {
            // Not necessarily a failure - might need manual login
            recordTest('Apollo session active', false, 'Not logged in - may need manual login first');
            log('⚠️ Not logged into Apollo. Profile may need manual login.');
        }
        
        // Check for Cloudflare
        const pageContent = await page.content();
        const hasCloudflare = pageContent.includes('challenge-platform') || 
                             pageContent.includes('cf-browser-verification');
        
        if (hasCloudflare) {
            recordTest('Cloudflare bypass', false, 'Cloudflare challenge detected');
            log('⚠️ Cloudflare challenge detected');
        } else {
            recordTest('Cloudflare bypass', true);
        }
        
        return { success: true, page, isLoggedIn };
    } catch (error) {
        recordTest('Apollo navigation', false, error.message);
        return { success: false, page, error: error.message };
    }
}

/**
 * Test 5: Lead Extraction (if logged in)
 */
async function testLeadExtraction(browser, page, isLoggedIn) {
    console.log('\n=== Test 5: Lead Extraction ===');
    
    if (!isLoggedIn) {
        log('Skipping lead extraction - not logged into Apollo');
        recordTest('Lead extraction', false, 'Skipped - not logged in');
        return { success: false, skipped: true };
    }
    
    try {
        // Navigate to people search if not already there
        const currentUrl = page.url();
        if (!currentUrl.includes('/people')) {
            log('Navigating to People search...');
            await page.goto('https://app.apollo.io/#/people', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            await sleep(3000);
        }
        
        // Try to find lead rows
        const tableSelectors = [
            'div[role="treegrid"]',
            'table[role="grid"]',
            '[data-cy="people-table"]',
            'table tbody tr'
        ];
        
        let tableFound = false;
        for (const selector of tableSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                tableFound = true;
                log(`Table found with selector: ${selector}`);
                break;
            } catch {
                continue;
            }
        }
        
        if (!tableFound) {
            recordTest('Find lead table', false, 'No lead table found');
            return { success: false };
        }
        recordTest('Find lead table', true);
        
        // Extract sample leads
        const leads = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tbody tr, [role="row"]');
            return Array.from(rows).slice(0, 5).map(row => {
                const nameEl = row.querySelector('a[href*="/people/"]') || row.querySelector('td:first-child');
                return {
                    name: nameEl?.textContent?.trim() || 'Unknown'
                };
            }).filter(lead => lead.name && lead.name !== 'Unknown');
        });
        
        log(`Extracted ${leads.length} sample leads`);
        
        if (leads.length > 0) {
            recordTest('Extract leads', true);
            console.log('\n--- Sample Leads ---');
            leads.forEach((lead, i) => {
                console.log(`${i + 1}. ${lead.name}`);
            });
            console.log('-------------------\n');
            return { success: true, leads };
        } else {
            recordTest('Extract leads', false, 'No leads extracted');
            return { success: false };
        }
    } catch (error) {
        recordTest('Lead extraction', false, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test 6: Session Persistence
 */
async function testSessionPersistence(browser) {
    console.log('\n=== Test 6: Session Persistence ===');
    
    try {
        log('Testing session persistence...');
        
        // Create a new page to verify session carries over
        const newPage = await browser.newPage();
        
        await newPage.goto('https://app.apollo.io/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        await sleep(2000);
        
        // Check if still logged in on new page
        const stillLoggedIn = await newPage.evaluate(() => {
            return !!(
                document.querySelector('[data-cy="user-menu"]') ||
                document.querySelector('[class*="UserMenu"]') ||
                document.querySelector('[placeholder*="Search"]') ||
                !window.location.href.includes('/login')
            );
        });
        
        await newPage.close();
        
        if (stillLoggedIn) {
            recordTest('Session persists across pages', true);
            return { success: true };
        } else {
            recordTest('Session persists across pages', false, 'Session lost on new page');
            return { success: false };
        }
    } catch (error) {
        recordTest('Session persistence', false, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test 7: Error Handling
 */
async function testErrorHandling() {
    console.log('\n=== Test 7: Error Handling ===');
    
    try {
        // Test 7a: Invalid profile ID
        log('Testing invalid profile ID handling...');
        const invalidProfileUrl = `${CLOUD_WS_URL}/connect?token=${API_TOKEN}&profile=invalid-profile-id`;
        
        let errorCaught = false;
        try {
            const browser = await puppeteer.connect({
                browserWSEndpoint: invalidProfileUrl,
                defaultViewport: null,
            });
            await browser.disconnect();
        } catch (error) {
            errorCaught = true;
            debugLog('Expected error caught:', error.message);
        }
        
        if (errorCaught) {
            recordTest('Invalid profile error handling', true);
        } else {
            recordTest('Invalid profile error handling', false, 'No error thrown for invalid profile');
        }
        
        // Test 7b: Invalid token
        log('Testing invalid token handling...');
        const invalidTokenUrl = `${CLOUD_WS_URL}/connect?token=invalid-token&profile=${PROFILE_ID}`;
        
        errorCaught = false;
        try {
            const browser = await puppeteer.connect({
                browserWSEndpoint: invalidTokenUrl,
                defaultViewport: null,
            });
            await browser.disconnect();
        } catch (error) {
            errorCaught = true;
            debugLog('Expected error caught:', error.message);
        }
        
        if (errorCaught) {
            recordTest('Invalid token error handling', true);
        } else {
            recordTest('Invalid token error handling', false, 'No error thrown for invalid token');
        }
        
        return { success: true };
    } catch (error) {
        recordTest('Error handling', false, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Print test summary
 */
function printSummary() {
    console.log('\n========================================');
    console.log('TEST SUMMARY');
    console.log('========================================');
    console.log(`Total: ${testResults.tests.length}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log('');
    
    if (testResults.failed > 0) {
        console.log('Failed tests:');
        testResults.tests.filter(t => !t.passed).forEach(t => {
            console.log(`  - ${t.name}: ${t.message}`);
        });
    }
    
    console.log('========================================\n');
    
    // Overall success criteria
    const criticalTests = [
        'Cloud mode enabled',
        'API token configured',
        'Profile ID configured',
        'WebSocket URL format',
        'Browser connected'
    ];
    
    const criticalPassed = criticalTests.every(name => 
        testResults.tests.find(t => t.name === name)?.passed
    );
    
    if (criticalPassed) {
        console.log('✅ CLOUD MODE READY FOR RAILWAY');
        console.log('Critical tests passed. You can deploy to Railway.\n');
        return true;
    } else {
        console.log('❌ CLOUD MODE NOT READY');
        console.log('Critical tests failed. Fix issues before deploying.\n');
        return false;
    }
}

/**
 * Main test runner
 */
async function main() {
    console.log('\n========================================');
    console.log('GoLogin Cloud Mode Test Suite');
    console.log('========================================');
    console.log('');
    console.log('Configuration:');
    console.log(`  GOLOGIN_CLOUD_MODE: ${CLOUD_MODE}`);
    console.log(`  GOLOGIN_API_TOKEN: ${API_TOKEN ? API_TOKEN.substring(0, 20) + '...' : 'NOT SET'}`);
    console.log(`  GOLOGIN_PROFILE_ID: ${PROFILE_ID || 'NOT SET'}`);
    console.log(`  GOLOGIN_DEBUG: ${DEBUG}`);
    console.log('');
    
    if (!CLOUD_MODE) {
        console.log('ERROR: GOLOGIN_CLOUD_MODE is not set to true');
        console.log('Run with: GOLOGIN_CLOUD_MODE=true node scripts/test-cloud-mode.js');
        process.exit(1);
    }
    
    let browser = null;
    
    try {
        // Test 1: WebSocket URL Construction
        const test1 = await testWebSocketConstruction();
        if (!test1) {
            log('Test 1 failed - cannot continue');
            printSummary();
            process.exit(1);
        }
        
        // Test 2: Profile Start
        const test2 = await testProfileStart();
        if (!test2.success) {
            log('Test 2 failed - cannot continue');
            printSummary();
            process.exit(1);
        }
        
        // Test 3: Puppeteer Connection
        const test3 = await testPuppeteerConnection(test2.wsUrl);
        browser = test3.browser;
        
        if (!test3.success) {
            log('Test 3 failed - cannot continue');
            printSummary();
            process.exit(1);
        }
        
        // Test 4: Apollo Navigation
        const test4 = await testApolloNavigation(browser);
        
        // Test 5: Lead Extraction (if logged in)
        const test5 = await testLeadExtraction(browser, test4.page, test4.isLoggedIn);
        
        // Test 6: Session Persistence (if logged in)
        if (test4.isLoggedIn) {
            await testSessionPersistence(browser);
        } else {
            log('\nSkipping session persistence test - not logged in');
            recordTest('Session persistence', false, 'Skipped - not logged in');
        }
        
        // Test 7: Error Handling
        await testErrorHandling();
        
        // Print summary
        const success = printSummary();
        
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
        if (DEBUG && error.stack) {
            console.error('Stack:', error.stack);
        }
        printSummary();
        process.exit(1);
    } finally {
        // Cleanup
        if (browser) {
            log('Disconnecting browser...');
            try {
                await browser.disconnect();
                log('✓ Browser disconnected');
            } catch (e) {
                debugLog('Disconnect error:', e.message);
            }
        }
    }
}

main();

