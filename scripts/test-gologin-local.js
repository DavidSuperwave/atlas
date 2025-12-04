#!/usr/bin/env node
/**
 * GoLogin Local Test Script
 * 
 * This script tests the GoLogin API workflow locally to help diagnose
 * connection issues and verify the correct API endpoints.
 * 
 * Usage:
 *   node scripts/test-gologin-local.js
 * 
 * Required environment variables:
 *   GOLOGIN_API_TOKEN - Your GoLogin API token
 *   GOLOGIN_PROFILE_ID - (Optional) Profile ID to test with
 * 
 * You can create a .env.local file in the project root with these values.
 */

// Load environment variables from .env.local
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
    try {
        const envPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(envPath)) {
            console.log(`No ${filePath} file found at ${envPath}`);
            return;
        }
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        let loaded = 0;
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;
            const key = trimmed.slice(0, eqIndex).trim();
            let value = trimmed.slice(eqIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = value;
                loaded++;
            }
        }
        console.log(`Loaded ${loaded} env vars from ${filePath}`);
    } catch (err) {
        console.error(`Error loading ${filePath}:`, err.message);
    }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const GOLOGIN_API_URL = 'https://api.gologin.com';

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
    console.log(`\n${colors.cyan}[STEP ${step}]${colors.reset} ${colors.bright}${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
    console.log(`  ${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message) {
    console.log(`  ${colors.blue}ℹ${colors.reset} ${message}`);
}

function logWarn(message) {
    console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`);
}

function maskToken(token) {
    if (!token) return '(not set)';
    if (token.length <= 8) return '****';
    return token.slice(0, 4) + '...' + token.slice(-4);
}

async function testGoLoginAPI() {
    console.log('\n' + '='.repeat(60));
    log('GoLogin API Local Test Script', colors.bright);
    console.log('='.repeat(60));

    const apiToken = process.env.GOLOGIN_API_TOKEN;
    const profileId = process.env.GOLOGIN_PROFILE_ID;

    logInfo(`API Token: ${maskToken(apiToken)}`);
    logInfo(`Profile ID: ${profileId || '(not set - will use first available)'}`);
    console.log();

    if (!apiToken) {
        logError('GOLOGIN_API_TOKEN is not set!');
        logInfo('Set it in .env.local file or as environment variable');
        logInfo('Get your token from: GoLogin Dashboard → Settings → API');
        process.exit(1);
    }

    const headers = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
    };

    // ============================================================
    // STEP 1: Test API Connection
    // ============================================================
    logStep(1, 'Testing API Connection');

    try {
        logInfo(`GET ${GOLOGIN_API_URL}/browser/v2`);
        const response = await fetch(`${GOLOGIN_API_URL}/browser/v2`, {
            method: 'GET',
            headers,
        });

        logInfo(`Status: ${response.status} ${response.statusText}`);

        if (response.ok) {
            logSuccess('API connection successful!');
        } else {
            const errorText = await response.text();
            logError(`API returned error: ${errorText}`);
            process.exit(1);
        }
    } catch (error) {
        logError(`Failed to connect to API: ${error.message}`);
        if (error.cause) {
            logError(`Cause: ${error.cause.message || error.cause}`);
        }
        logInfo('Checking network connectivity...');
        try {
            await fetch('https://google.com', { method: 'HEAD' });
            logInfo('Network is working - GoLogin API may be blocking or down');
        } catch (netErr) {
            logError('Network seems to be blocked or unavailable');
        }
        process.exit(1);
    }

    // ============================================================
    // STEP 2: List Profiles
    // ============================================================
    logStep(2, 'Listing Available Profiles');

    let profiles = [];
    let selectedProfileId = profileId;

    try {
        logInfo(`GET ${GOLOGIN_API_URL}/browser/v2`);
        const response = await fetch(`${GOLOGIN_API_URL}/browser/v2`, {
            method: 'GET',
            headers,
        });

        const data = await response.json();
        profiles = Array.isArray(data.profiles) ? data.profiles : (Array.isArray(data) ? data : []);

        logSuccess(`Found ${profiles.length} profile(s)`);

        if (profiles.length > 0) {
            console.log('\n  Available profiles:');
            profiles.slice(0, 10).forEach((p, i) => {
                const marker = p.id === selectedProfileId ? ' ← selected' : '';
                console.log(`    ${i + 1}. ${p.name} (${p.id})${marker}`);
            });
            if (profiles.length > 10) {
                console.log(`    ... and ${profiles.length - 10} more`);
            }

            // If no profile ID specified, use the first one
            if (!selectedProfileId && profiles.length > 0) {
                selectedProfileId = profiles[0].id;
                logInfo(`Using first profile: ${profiles[0].name} (${selectedProfileId})`);
            }
        } else {
            logWarn('No profiles found! Create one in GoLogin dashboard first.');
            process.exit(1);
        }
    } catch (error) {
        logError(`Failed to list profiles: ${error.message}`);
        process.exit(1);
    }

    // ============================================================
    // STEP 3: Get Profile Details (try multiple endpoints)
    // ============================================================
    logStep(3, 'Getting Profile Details');

    const profileEndpoints = [
        `/browser/${selectedProfileId}`,
        `/browser/v2/${selectedProfileId}`,
    ];

    let profileFound = false;
    for (const endpoint of profileEndpoints) {
        try {
            logInfo(`GET ${GOLOGIN_API_URL}${endpoint}`);
            const response = await fetch(`${GOLOGIN_API_URL}${endpoint}`, {
                method: 'GET',
                headers,
            });

            logInfo(`Status: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const profile = await response.json();
                logSuccess(`Profile found: ${profile.name}`);
                logInfo(`Browser: ${profile.browserType || 'unknown'}`);
                logInfo(`OS: ${profile.os || 'unknown'}`);
                if (profile.proxy) {
                    logInfo(`Proxy: ${profile.proxy.mode} ${profile.proxy.host ? `(${profile.proxy.host})` : ''}`);
                } else {
                    logWarn('No proxy configured (recommended for anti-detection)');
                }
                profileFound = true;
                break;
            } else {
                const errorText = await response.text();
                logWarn(`Endpoint ${endpoint} failed: ${response.status}`);
            }
        } catch (error) {
            logError(`Failed to get profile from ${endpoint}: ${error.message}`);
        }
    }
    
    if (!profileFound) {
        logWarn('Could not get profile details - continuing anyway');
    }

    // ============================================================
    // STEP 4: Test Different Start Endpoints
    // ============================================================
    logStep(4, 'Testing Profile Start Endpoints');

    const startEndpoints = [
        // Cloud/Remote browser endpoints
        { url: `/browser/${selectedProfileId}/web`, body: {} },
        { url: `/browser/${selectedProfileId}/web`, body: { isRemote: true } },
        { url: `/browser/${selectedProfileId}/cloud-start`, body: {} },
        { url: `/browser/${selectedProfileId}/remote-start`, body: {} },
        // Standard endpoints (for reference)
        { url: `/browser/${selectedProfileId}/start`, body: {} },
        { url: `/browser/${selectedProfileId}/start`, body: { isRemote: true } },
        { url: `/browser/${selectedProfileId}/start`, body: { isRemote: true, sync: true } },
        { url: `/browser/v2/${selectedProfileId}/start`, body: {} },
        { url: `/browser/${selectedProfileId}/web-run`, body: {} },
        // Run endpoints
        { url: `/browser/${selectedProfileId}/run`, body: {} },
        { url: `/browser/run`, body: { profileId: selectedProfileId } },
    ];

    let wsEndpoint = null;
    let workingEndpoint = null;

    for (const endpoint of startEndpoints) {
        console.log();
        logInfo(`Trying: POST ${GOLOGIN_API_URL}${endpoint.url}`);
        logInfo(`Body: ${JSON.stringify(endpoint.body)}`);

        try {
            const response = await fetch(`${GOLOGIN_API_URL}${endpoint.url}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(endpoint.body),
            });

            logInfo(`Status: ${response.status} ${response.statusText}`);

            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch {
                data = { raw: responseText };
            }

            if (response.ok) {
                logSuccess('Endpoint works!');
                console.log(`  Response: ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}`);

                // Look for WebSocket endpoint
                wsEndpoint = data.wsEndpoint || data.ws || data.wsUrl || data.browserWSEndpoint;
                if (wsEndpoint) {
                    logSuccess(`Got WebSocket endpoint: ${wsEndpoint}`);
                    workingEndpoint = endpoint;
                    break;
                }
                
                // Look for remote Orbita URL (cloud browser)
                if (data.remoteOrbitaUrl) {
                    logSuccess(`Got cloud browser URL: ${data.remoteOrbitaUrl}`);
                    workingEndpoint = endpoint;
                    // Store for later use
                    workingEndpoint.remoteOrbitaUrl = data.remoteOrbitaUrl;
                    // Don't break - continue to see if there's a WS endpoint
                }
                
                if (!wsEndpoint && !data.remoteOrbitaUrl) {
                    logWarn('No WebSocket endpoint or cloud URL in response');
                }
            } else {
                logError(`Failed: ${JSON.stringify(data)}`);
            }
        } catch (error) {
            logError(`Request failed: ${error.message}`);
        }
    }

    // ============================================================
    // STEP 5: Try to get WebSocket from Cloud Browser
    // ============================================================
    if (workingEndpoint && workingEndpoint.remoteOrbitaUrl) {
        logStep(5, 'Getting WebSocket from Cloud Browser');
        
        const remoteUrl = workingEndpoint.remoteOrbitaUrl;
        logInfo(`Cloud browser URL: ${remoteUrl}`);
        
        // Try to get WebSocket endpoint from cloud browser
        // The cloud browser might expose a /json/version endpoint
        try {
            // Extract the base URL
            const urlParts = new URL(remoteUrl);
            const cloudBaseUrl = `${urlParts.protocol}//${urlParts.host}`;
            const browserPath = urlParts.pathname;
            
            logInfo(`Trying cloud browser endpoints...`);
            
            // Try different potential WebSocket endpoints
            const cloudEndpoints = [
                `${remoteUrl}json/version`,
                `${cloudBaseUrl}/json/version`,
                `${remoteUrl}devtools/browser`,
            ];
            
            for (const ep of cloudEndpoints) {
                try {
                    logInfo(`GET ${ep}`);
                    const resp = await fetch(ep, { headers });
                    logInfo(`Status: ${resp.status}`);
                    if (resp.ok) {
                        const text = await resp.text();
                        logSuccess(`Response: ${text.slice(0, 500)}`);
                        try {
                            const json = JSON.parse(text);
                            if (json.webSocketDebuggerUrl) {
                                wsEndpoint = json.webSocketDebuggerUrl;
                                logSuccess(`Found WebSocket endpoint: ${wsEndpoint}`);
                                break;
                            }
                        } catch {}
                    }
                } catch (err) {
                    logWarn(`${ep}: ${err.message}`);
                }
            }
        } catch (error) {
            logError(`Cloud browser check failed: ${error.message}`);
        }
    }

    // ============================================================
    // STEP 6: Try Puppeteer Connection (if we got a WebSocket)
    // ============================================================
    if (wsEndpoint) {
        logStep(6, 'Testing Puppeteer Connection');

        try {
            logInfo(`Connecting to: ${wsEndpoint}`);
            
            // Dynamic import for puppeteer
            const puppeteer = require('puppeteer');
            
            const browser = await puppeteer.connect({
                browserWSEndpoint: wsEndpoint,
                defaultViewport: null,
            });

            logSuccess('Puppeteer connected successfully!');

            const pages = await browser.pages();
            logInfo(`Found ${pages.length} open page(s)`);

            // Try to get page info
            if (pages.length > 0) {
                const page = pages[0];
                const url = page.url();
                logInfo(`Current page URL: ${url}`);
            }

            // Disconnect (don't close)
            await browser.disconnect();
            logSuccess('Disconnected from browser');

        } catch (error) {
            logError(`Puppeteer connection failed: ${error.message}`);
            logInfo('This might be normal if the profile is not fully started yet');
        }
    } else {
        logStep(6, 'Skipping Puppeteer Test (no WebSocket endpoint)');
        logWarn('Could not obtain WebSocket endpoint');
        if (workingEndpoint && workingEndpoint.remoteOrbitaUrl) {
            logInfo(`Cloud browser is running at: ${workingEndpoint.remoteOrbitaUrl}`);
            logInfo('The cloud browser may not expose a direct WebSocket for Puppeteer.');
            logInfo('Consider using the official gologin npm package for local browser automation.');
        }
    }

    // ============================================================
    // STEP 7: Try to Stop the Profile
    // ============================================================
    logStep(7, 'Stopping Profile');

    // Try both stop endpoints
    const stopEndpoints = [
        `/browser/${selectedProfileId}/stop`,
        `/browser/${selectedProfileId}/stop-web`,
    ];
    
    for (const ep of stopEndpoints) {
        try {
            logInfo(`POST ${GOLOGIN_API_URL}${ep}`);
            const response = await fetch(`${GOLOGIN_API_URL}${ep}`, {
                method: 'POST',
                headers,
            });

            logInfo(`Status: ${response.status} ${response.statusText}`);

            if (response.ok) {
                logSuccess(`Profile stopped via ${ep}`);
                break;
            } else if (response.status === 404) {
                logWarn(`Endpoint ${ep} not found`);
            } else {
                const errorText = await response.text();
                logWarn(`${ep} returned: ${errorText.slice(0, 100)}`);
            }
        } catch (error) {
            logWarn(`Stop via ${ep} failed: ${error.message}`);
        }
    }

    // ============================================================
    // Summary
    // ============================================================
    console.log('\n' + '='.repeat(60));
    log('SUMMARY', colors.bright);
    console.log('='.repeat(60));

    if (workingEndpoint) {
        logSuccess('Found working endpoint!');
        console.log(`\n  ${colors.green}Working configuration:${colors.reset}`);
        console.log(`    Start URL: POST ${GOLOGIN_API_URL}${workingEndpoint.url}`);
        console.log(`    Body: ${JSON.stringify(workingEndpoint.body)}`);
        
        if (workingEndpoint.remoteOrbitaUrl) {
            console.log(`\n  ${colors.cyan}Cloud Browser:${colors.reset}`);
            console.log(`    Remote URL: ${workingEndpoint.remoteOrbitaUrl}`);
        }
        
        if (wsEndpoint) {
            console.log(`\n  ${colors.green}WebSocket Endpoint:${colors.reset}`);
            console.log(`    ${wsEndpoint}`);
            console.log(`\n  ${colors.cyan}Update gologin-client.ts startProfile() to use this endpoint.${colors.reset}`);
        } else if (workingEndpoint.remoteOrbitaUrl) {
            console.log(`\n  ${colors.yellow}Note:${colors.reset} Cloud browser is running but no WebSocket endpoint found.`);
            console.log(`  The GoLogin Cloud API returns a web URL (VNC-style access), not WebSocket.`);
            console.log(`\n  ${colors.cyan}Options:${colors.reset}`);
            console.log(`    1. Use the official 'gologin' npm package for local browser automation`);
            console.log(`    2. The cloud browser URL can be used for manual/visual access`);
        }
    } else {
        logError('No working start endpoint found!');
        console.log(`\n  ${colors.yellow}Possible issues:${colors.reset}`);
        console.log('    1. GoLogin subscription may not include API access');
        console.log('    2. Profile may need to be started manually first');
        console.log('    3. The API may have changed - check GoLogin documentation');
        console.log('\n  Try:');
        console.log('    - Start the profile manually in GoLogin dashboard');
        console.log('    - Check https://gologin.com/docs/api-reference');
        console.log('    - Consider using the official gologin npm package');
    }

    console.log('\n');
}

// Run the test
testGoLoginAPI().catch(error => {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
});

