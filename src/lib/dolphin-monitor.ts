/**
 * Dolphin Anty Account Monitor
 * 
 * This module provides utilities for monitoring Apollo account health
 * when using Dolphin Anty browser profiles. It helps detect:
 * - Apollo login status
 * - Cloudflare challenges
 * - Rate limiting
 * - Account issues
 * 
 * USAGE:
 * - Call checkApolloStatus() to verify Apollo session
 * - Use isCloudflareChallenge() to detect blocking
 * - Monitor account health with getAccountHealth()
 * 
 * @see docs/DOLPHIN_ANTY_SETUP.md for account monitoring best practices
 */

import { Page } from 'puppeteer';
import { browserManagerDolphin } from './browser-manager-dolphin';

/**
 * Apollo account status
 */
export interface ApolloStatus {
    isLoggedIn: boolean;
    hasCloudflareChallenge: boolean;
    isRateLimited: boolean;
    currentUrl: string;
    userInfo?: {
        email?: string;
        name?: string;
    };
    error?: string;
}

/**
 * Account health check result
 */
export interface AccountHealth {
    healthy: boolean;
    issues: string[];
    warnings: string[];
    lastChecked: string;
    apolloStatus?: ApolloStatus;
}

/**
 * Check if the current page has a Cloudflare challenge
 * 
 * @param page - Puppeteer page to check
 * @returns true if Cloudflare challenge is detected
 */
export async function isCloudflareChallenge(page: Page): Promise<boolean> {
    try {
        const content = await page.content();
        const indicators = [
            'challenge-platform',
            'cf-browser-verification',
            'cf-spinner',
            'Checking your browser',
            'Please wait while we verify',
            'cf-challenge',
            'ray ID'
        ];
        
        for (const indicator of indicators) {
            if (content.toLowerCase().includes(indicator.toLowerCase())) {
                console.log(`[DOLPHIN-MONITOR] Cloudflare indicator found: ${indicator}`);
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('[DOLPHIN-MONITOR] Error checking Cloudflare:', error);
        return false;
    }
}

/**
 * Check if Apollo has rate limited the account
 * 
 * @param page - Puppeteer page to check
 * @returns true if rate limiting is detected
 */
export async function isRateLimited(page: Page): Promise<boolean> {
    try {
        const content = await page.content();
        const indicators = [
            'rate limit',
            'too many requests',
            'slow down',
            'try again later',
            '429'
        ];
        
        for (const indicator of indicators) {
            if (content.toLowerCase().includes(indicator.toLowerCase())) {
                console.log(`[DOLPHIN-MONITOR] Rate limit indicator found: ${indicator}`);
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('[DOLPHIN-MONITOR] Error checking rate limit:', error);
        return false;
    }
}

/**
 * Check if logged into Apollo
 * 
 * @param page - Puppeteer page to check
 * @returns true if logged into Apollo
 */
export async function isLoggedIntoApollo(page: Page): Promise<boolean> {
    try {
        const currentUrl = page.url();
        
        // If on login page, not logged in
        if (currentUrl.includes('/login') || currentUrl.includes('/sign')) {
            return false;
        }
        
        // Check for logged-in indicators
        const loggedInIndicators = await page.evaluate(() => {
            // Look for user menu, settings, or other logged-in elements
            const userMenu = document.querySelector('[data-cy="user-menu"]');
            const settingsButton = document.querySelector('[aria-label="Settings"]');
            const searchBar = document.querySelector('[data-cy="search-bar"]');
            
            return !!(userMenu || settingsButton || searchBar);
        });
        
        return loggedInIndicators;
    } catch (error) {
        console.error('[DOLPHIN-MONITOR] Error checking login status:', error);
        return false;
    }
}

/**
 * Get user info from Apollo (if logged in)
 * 
 * @param page - Puppeteer page to check
 * @returns User info or undefined
 */
export async function getApolloUserInfo(page: Page): Promise<{ email?: string; name?: string } | undefined> {
    try {
        const userInfo = await page.evaluate(() => {
            // Try to extract user info from the page
            const userMenu = document.querySelector('[data-cy="user-menu"]');
            const emailEl = document.querySelector('[data-cy="user-email"]');
            const nameEl = document.querySelector('[data-cy="user-name"]');
            
            return {
                email: emailEl?.textContent?.trim(),
                name: nameEl?.textContent?.trim() || userMenu?.textContent?.trim()
            };
        });
        
        return userInfo.email || userInfo.name ? userInfo : undefined;
    } catch (error) {
        console.error('[DOLPHIN-MONITOR] Error getting user info:', error);
        return undefined;
    }
}

/**
 * Check Apollo account status
 * 
 * This function navigates to Apollo and checks the account status.
 * 
 * @returns Apollo account status
 */
export async function checkApolloStatus(): Promise<ApolloStatus> {
    let page = null;
    
    try {
        console.log('[DOLPHIN-MONITOR] Checking Apollo status...');
        
        // Get browser from Dolphin manager
        const browser = await browserManagerDolphin.getBrowser();
        page = await browser.newPage();
        
        // Navigate to Apollo
        await page.goto('https://app.apollo.io', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        const currentUrl = page.url();
        const hasCloudflare = await isCloudflareChallenge(page);
        const rateLimited = await isRateLimited(page);
        const loggedIn = await isLoggedIntoApollo(page);
        const userInfo = loggedIn ? await getApolloUserInfo(page) : undefined;
        
        return {
            isLoggedIn: loggedIn,
            hasCloudflareChallenge: hasCloudflare,
            isRateLimited: rateLimited,
            currentUrl,
            userInfo
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[DOLPHIN-MONITOR] Error checking Apollo status:', errorMessage);
        
        return {
            isLoggedIn: false,
            hasCloudflareChallenge: false,
            isRateLimited: false,
            currentUrl: '',
            error: errorMessage
        };
    } finally {
        if (page) {
            await page.close();
        }
    }
}

/**
 * Perform a comprehensive account health check
 * 
 * @returns Account health check result
 */
export async function getAccountHealth(): Promise<AccountHealth> {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    try {
        // Check Dolphin Anty availability
        const dolphinAvailable = await browserManagerDolphin.isDolphinAvailable();
        if (!dolphinAvailable) {
            issues.push('Dolphin Anty is not available. Please ensure it is running.');
        }
        
        // Check profile is configured
        const profileId = process.env.DOLPHIN_ANTY_PROFILE_ID;
        if (!profileId) {
            issues.push('DOLPHIN_ANTY_PROFILE_ID is not configured.');
        }
        
        // Only check Apollo if Dolphin is available
        let apolloStatus: ApolloStatus | undefined;
        if (dolphinAvailable && profileId) {
            // Check profile is running
            const profileRunning = await browserManagerDolphin.isProfileRunning();
            if (!profileRunning) {
                warnings.push('Dolphin Anty profile is not running. It will be started when needed.');
            }
            
            // Check Apollo status
            apolloStatus = await checkApolloStatus();
            
            if (apolloStatus.error) {
                issues.push(`Apollo check failed: ${apolloStatus.error}`);
            } else {
                if (!apolloStatus.isLoggedIn) {
                    issues.push('Not logged into Apollo. Please log in using the Dolphin Anty browser profile.');
                }
                
                if (apolloStatus.hasCloudflareChallenge) {
                    issues.push('Cloudflare challenge detected. The profile may be flagged.');
                }
                
                if (apolloStatus.isRateLimited) {
                    warnings.push('Rate limiting detected. Consider reducing scraping frequency.');
                }
            }
        }
        
        return {
            healthy: issues.length === 0,
            issues,
            warnings,
            lastChecked: new Date().toISOString(),
            apolloStatus
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            healthy: false,
            issues: [`Health check failed: ${errorMessage}`],
            warnings,
            lastChecked: new Date().toISOString()
        };
    }
}

/**
 * Take a screenshot for debugging
 * 
 * @param filename - Filename for the screenshot
 * @returns Base64 encoded screenshot or null
 */
export async function takeDebugScreenshot(filename?: string): Promise<string | null> {
    let page = null;
    
    try {
        const browser = await browserManagerDolphin.getBrowser();
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        
        const screenshot = await page.screenshot({ 
            encoding: 'base64',
            fullPage: false 
        });
        
        console.log(`[DOLPHIN-MONITOR] Screenshot taken${filename ? `: ${filename}` : ''}`);
        return screenshot as string;
        
    } catch (error) {
        console.error('[DOLPHIN-MONITOR] Error taking screenshot:', error);
        return null;
    }
}

/**
 * Wait for Cloudflare challenge to complete
 * 
 * @param page - Puppeteer page
 * @param maxWaitMs - Maximum time to wait (default: 30 seconds)
 * @returns true if challenge was resolved
 */
export async function waitForCloudflareResolution(page: Page, maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    console.log('[DOLPHIN-MONITOR] Waiting for Cloudflare challenge to resolve...');
    
    while (Date.now() - startTime < maxWaitMs) {
        if (!(await isCloudflareChallenge(page))) {
            console.log('[DOLPHIN-MONITOR] Cloudflare challenge resolved!');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('[DOLPHIN-MONITOR] Cloudflare challenge did not resolve in time');
    return false;
}


