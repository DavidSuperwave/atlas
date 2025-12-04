/**
 * GoLogin Browser Manager
 * 
 * This module manages connections to browser profiles through GoLogin cloud.
 * It provides the same interface as browser-manager-dolphin.ts for seamless
 * integration with the scraper factory.
 * 
 * MULTI-PROFILE SUPPORT:
 * - Use getBrowserForProfile(profileId) to get a browser for a specific profile
 * - Use browserManagerGoLogin for default profile (from env var)
 * 
 * PREREQUISITES:
 * 1. GoLogin account with API access (Professional plan or higher)
 * 2. Browser profile created in GoLogin dashboard
 * 3. Apollo.io logged in manually via GoLogin browser (cookies saved)
 * 4. Proxy configured in the profile (recommended: residential proxy)
 * 
 * COMMON ISSUES:
 * - "WebSocket endpoint not returned": Profile may need to be restarted in GoLogin dashboard
 * - "Connection refused": Profile might already be open in another session
 * - "Not logged into Apollo": Need to manually log in using GoLogin browser first
 * 
 * ENVIRONMENT VARIABLES:
 * - GOLOGIN_API_TOKEN: API token from GoLogin dashboard (Settings → API)
 * - GOLOGIN_PROFILE_ID: Default profile ID (optional fallback)
 * - GOLOGIN_DEBUG: Set to 'true' for verbose API logging
 * 
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

import puppeteer, { Browser } from 'puppeteer';
import { GoLoginClient } from './gologin-client';

/** Maximum connection retry attempts */
const MAX_RETRIES = 3;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY = 3000;
/** Initial delay after starting profile before connecting */
const PROFILE_START_DELAY = 2000;

/** Cache of browser managers by profile ID */
const browserManagerCache = new Map<string, BrowserManagerGoLogin>();

/**
 * BrowserManagerGoLogin handles connections to GoLogin browser profiles
 * 
 * This class manages browser connections for a specific profile ID.
 * Use getBrowserForProfile() to get a manager for a specific profile.
 */
export class BrowserManagerGoLogin {
    private browser: Browser | null = null;
    private isConnecting = false;
    private client: GoLoginClient;
    private currentWsEndpoint: string | null = null;
    private profileId: string;

    /**
     * Create a new browser manager for a specific profile
     * 
     * @param profileId - The GoLogin profile ID to manage
     * @param apiToken - Optional API token (defaults to env var)
     */
    constructor(profileId: string, apiToken?: string) {
        this.profileId = profileId;
        this.client = new GoLoginClient(apiToken, profileId);
    }

    /**
     * Get the profile ID this manager is for
     */
    getProfileId(): string {
        return this.profileId;
    }

    /**
     * Check if GoLogin is available and configured
     * 
     * @returns true if GoLogin API is accessible
     */
    async isGoLoginAvailable(): Promise<boolean> {
        return this.client.isAvailable();
    }

    /**
     * Check if GoLogin is properly configured
     * 
     * @returns true if API token and profile ID are set
     */
    isConfigured(): boolean {
        return this.client.isConfigured();
    }

    /**
     * Check if a profile is currently running
     * 
     * @returns true if the configured profile is running
     */
    async isProfileRunning(): Promise<boolean> {
        const status = await this.client.getProfileStatus();
        return status.isRunning;
    }

    /**
     * Start the GoLogin profile
     * 
     * This will:
     * 1. Validate configuration
     * 2. Check if GoLogin API is available
     * 3. Start the configured profile
     * 4. Return the WebSocket endpoint for Puppeteer connection
     * 
     * @throws Error if GoLogin is not available or profile fails to start
     */
    async startProfile(): Promise<string> {
        console.log(`[GOLOGIN-BROWSER] ========================================`);
        console.log(`[GOLOGIN-BROWSER] Starting GoLogin profile: ${this.profileId}`);
        
        // Step 1: Validate we have required configuration
        if (!this.profileId) {
            throw new Error(
                'No profile ID configured. Set GOLOGIN_PROFILE_ID environment variable ' +
                'or assign a profile to the user in the admin panel.'
            );
        }
        
        if (!this.client.hasApiToken()) {
            throw new Error(
                'GOLOGIN_API_TOKEN is not set. Get your API token from ' +
                'GoLogin dashboard: Settings → API'
            );
        }

        // Step 2: Check if GoLogin API is available
        console.log(`[GOLOGIN-BROWSER] Checking API availability...`);
        const available = await this.isGoLoginAvailable();
        if (!available) {
            // Get diagnostic info
            const diagnostic = await this.client.getDiagnosticReport();
            console.error(`[GOLOGIN-BROWSER] API check failed. Diagnostic:\n${diagnostic}`);
            
            throw new Error(
                'GoLogin API is not available. Possible causes:\n' +
                '1. API token is invalid or expired\n' +
                '2. GoLogin subscription does not include API access\n' +
                '3. Network connectivity issue\n' +
                'Check your API token in GoLogin Settings → API'
            );
        }
        console.log(`[GOLOGIN-BROWSER] ✓ API is available`);

        // Step 3: Start the profile and get WebSocket endpoint
        console.log(`[GOLOGIN-BROWSER] Starting browser profile...`);
        try {
            const wsEndpoint = await this.client.ensureProfileRunning();
            this.currentWsEndpoint = wsEndpoint;

            console.log(`[GOLOGIN-BROWSER] ✓ Profile started successfully`);
            console.log(`[GOLOGIN-BROWSER] WebSocket: ${wsEndpoint}`);
            console.log(`[GOLOGIN-BROWSER] ========================================`);
            
            return wsEndpoint;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[GOLOGIN-BROWSER] ✗ Failed to start profile: ${errorMessage}`);
            
            // Provide specific guidance based on error
            let guidance = '';
            if (errorMessage.includes('not found')) {
                guidance = '\n\nThe profile ID may be incorrect. Check your profile ID in GoLogin dashboard.';
            } else if (errorMessage.includes('WebSocket')) {
                guidance = '\n\nThe profile may already be running elsewhere. Try:\n' +
                          '1. Close any other sessions using this profile\n' +
                          '2. Stop the profile from GoLogin dashboard\n' +
                          '3. Wait 30 seconds and try again';
            } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                guidance = '\n\nYour API token appears to be invalid. Generate a new one in GoLogin Settings → API.';
            }
            
            throw new Error(errorMessage + guidance);
        }
    }

    /**
     * Stop the GoLogin profile
     */
    async stopProfile(): Promise<void> {
        console.log(`[GOLOGIN-BROWSER] Stopping GoLogin profile ${this.profileId}...`);
        await this.client.stopProfile();
        this.currentWsEndpoint = null;
        console.log(`[GOLOGIN-BROWSER] Profile ${this.profileId} stopped`);
    }

    /**
     * Ensure the profile is running and ready
     * 
     * @returns WebSocket endpoint for the running profile
     */
    async ensureProfileReady(): Promise<string> {
        // Check if we already have a valid connection
        if (this.currentWsEndpoint && this.browser?.connected) {
            console.log(`[GOLOGIN-BROWSER] Profile ${this.profileId} already running and connected`);
            return this.currentWsEndpoint;
        }

        // Start the profile
        return this.startProfile();
    }

    /**
     * Connect to GoLogin browser with retry logic
     * 
     * @returns Connected Puppeteer Browser instance
     * @throws Error if connection fails after all retries
     */
    async connect(): Promise<Browser> {
        // Return existing connection if available
        if (this.browser && this.browser.connected) {
            console.log(`[GOLOGIN-BROWSER] Reusing existing browser connection for profile ${this.profileId}`);
            return this.browser;
        }

        // Prevent concurrent connection attempts
        if (this.isConnecting) {
            console.log(`[GOLOGIN-BROWSER] Connection attempt already in progress for profile ${this.profileId}, waiting...`);
            await this.sleep(1000);
            return this.connect();
        }

        this.isConnecting = true;
        let lastError: Error | null = null;
        let wsEndpoint: string = '';

        try {
            // Ensure profile is running and get WebSocket endpoint
            wsEndpoint = await this.ensureProfileReady();
            
            // Wait for browser to fully initialize after profile start
            console.log(`[GOLOGIN-BROWSER] Waiting for browser initialization...`);
            await this.sleep(PROFILE_START_DELAY);

            // Attempt connection with retries
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[GOLOGIN-BROWSER] Connecting to browser (attempt ${attempt}/${MAX_RETRIES})...`);
                    console.log(`[GOLOGIN-BROWSER] WebSocket endpoint: ${wsEndpoint}`);

                    this.browser = await puppeteer.connect({
                        browserWSEndpoint: wsEndpoint,
                        defaultViewport: null,
                    });

                    console.log(`[GOLOGIN-BROWSER] ✓ Successfully connected to GoLogin browser!`);

                    // Set up disconnect handler
                    this.browser.on('disconnected', () => {
                        console.log(`[GOLOGIN-BROWSER] Browser disconnected for profile ${this.profileId}`);
                        this.browser = null;
                        this.currentWsEndpoint = null;
                    });

                    return this.browser;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    const errorMessage = lastError.message;
                    
                    console.error(`[GOLOGIN-BROWSER] Connection attempt ${attempt} failed:`);
                    console.error(`[GOLOGIN-BROWSER]   Error: ${errorMessage}`);

                    if (attempt < MAX_RETRIES) {
                        // Determine if we should restart the profile
                        const shouldRestart = 
                            errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('WebSocket') ||
                            errorMessage.includes('closed') ||
                            attempt === 2;
                        
                        if (shouldRestart) {
                            console.log(`[GOLOGIN-BROWSER] Restarting profile to get fresh connection...`);
                            try {
                                await this.stopProfile();
                                await this.sleep(2000);
                                wsEndpoint = await this.startProfile();
                                await this.sleep(PROFILE_START_DELAY);
                            } catch (restartError) {
                                console.error(`[GOLOGIN-BROWSER] Restart failed:`, restartError);
                            }
                        } else {
                            console.log(`[GOLOGIN-BROWSER] Retrying in ${RETRY_DELAY}ms...`);
                            await this.sleep(RETRY_DELAY);
                        }
                    }
                }
            }

            // All retries exhausted - provide detailed error
            const errorDetails = lastError?.message || 'Unknown error';
            let troubleshooting = `
Troubleshooting steps:
1. Check if the profile is already open in GoLogin dashboard or another session
2. Stop the profile from GoLogin dashboard and wait 30 seconds
3. Verify your GoLogin subscription includes API access (Professional plan or higher)
4. Try running the profile manually from GoLogin dashboard to ensure it works
5. Check your network connection and firewall settings`;

            if (errorDetails.includes('ECONNREFUSED')) {
                troubleshooting = `
The WebSocket connection was refused. This usually means:
- The browser profile failed to start properly
- The WebSocket endpoint is no longer valid
- There's a network/firewall issue

Try:
1. Stop the profile from GoLogin dashboard
2. Wait 30 seconds
3. Try again`;
            }

            throw new Error(
                `Failed to connect to GoLogin browser after ${MAX_RETRIES} attempts.\n` +
                `Profile ID: ${this.profileId}\n` +
                `WebSocket: ${wsEndpoint}\n` +
                `Last error: ${errorDetails}\n` +
                troubleshooting
            );
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Get browser instance (connects if needed)
     * Main entry point for obtaining a browser connection
     * 
     * @returns Connected Puppeteer Browser instance
     */
    async getBrowser(): Promise<Browser> {
        return this.connect();
    }

    /**
     * Disconnect from browser (keeps profile running)
     * Use this when done scraping but want to keep the session
     */
    async disconnect(): Promise<void> {
        if (this.browser) {
            try {
                await this.browser.disconnect();
                console.log(`[GOLOGIN-BROWSER] Disconnected from browser for profile ${this.profileId}`);
            } catch (error) {
                console.error(`[GOLOGIN-BROWSER] Error disconnecting from profile ${this.profileId}:`, error);
            }
            this.browser = null;
        }
    }

    /**
     * Cleanup - disconnect and stop profile
     * Use this for full cleanup when switching modes or shutting down
     */
    async cleanup(): Promise<void> {
        await this.disconnect();
        await this.stopProfile();
        console.log(`[GOLOGIN-BROWSER] Cleanup complete for profile ${this.profileId}`);
    }

    /**
     * Get the current profile status
     * Useful for monitoring and debugging
     */
    async getStatus(): Promise<{
        goLoginAvailable: boolean;
        configured: boolean;
        profileId: string;
        profileRunning: boolean;
        browserConnected: boolean;
        wsEndpoint: string | null;
    }> {
        const available = await this.isGoLoginAvailable();
        const status = await this.client.getProfileStatus();

        return {
            goLoginAvailable: available,
            configured: this.isConfigured(),
            profileId: this.profileId,
            profileRunning: status.isRunning,
            browserConnected: this.browser?.connected || false,
            wsEndpoint: this.currentWsEndpoint
        };
    }

    /**
     * Get comprehensive diagnostic information
     * Use this to troubleshoot connection issues
     */
    async getDiagnostics(): Promise<{
        status: {
            goLoginAvailable: boolean;
            configured: boolean;
            profileId: string;
            profileRunning: boolean;
            browserConnected: boolean;
            wsEndpoint: string | null;
        };
        validation: {
            valid: boolean;
            apiTokenValid: boolean;
            profileConfigured: boolean;
            profileExists: boolean;
            canListProfiles: boolean;
            errors: string[];
            warnings: string[];
            suggestions: string[];
            profileInfo?: {
                id: string;
                name: string;
                hasProxy: boolean;
            };
        };
        diagnosticReport: string;
    }> {
        const status = await this.getStatus();
        const validation = await this.client.validateConfiguration();
        const diagnosticReport = await this.client.getDiagnosticReport();

        return {
            status,
            validation,
            diagnosticReport
        };
    }

    /**
     * Test the connection without keeping it open
     * Useful for validating setup before scraping
     */
    async testConnection(): Promise<{
        success: boolean;
        message: string;
        wsEndpoint?: string;
        error?: string;
    }> {
        try {
            console.log(`[GOLOGIN-BROWSER] Testing connection for profile ${this.profileId}...`);
            
            // Try to start the profile
            const wsEndpoint = await this.startProfile();
            
            // Try to connect
            const browser = await puppeteer.connect({
                browserWSEndpoint: wsEndpoint,
                defaultViewport: null,
            });
            
            // Get a page to verify it works
            const pages = await browser.pages();
            const pageCount = pages.length;
            
            // Disconnect (don't close, just disconnect)
            await browser.disconnect();
            
            console.log(`[GOLOGIN-BROWSER] ✓ Connection test successful! Found ${pageCount} page(s)`);
            
            return {
                success: true,
                message: `Successfully connected to GoLogin browser. Found ${pageCount} page(s).`,
                wsEndpoint
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[GOLOGIN-BROWSER] ✗ Connection test failed: ${errorMessage}`);
            
            return {
                success: false,
                message: 'Failed to connect to GoLogin browser',
                error: errorMessage
            };
        }
    }

    /**
     * Helper sleep function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Get a browser manager for a specific profile ID
 * 
 * This function returns a cached browser manager for the given profile ID,
 * or creates a new one if it doesn't exist.
 * 
 * @param profileId - The GoLogin profile ID
 * @returns BrowserManagerGoLogin instance for the profile
 */
export function getBrowserManagerForProfile(profileId: string): BrowserManagerGoLogin {
    let manager = browserManagerCache.get(profileId);
    
    if (!manager) {
        console.log(`[GOLOGIN-BROWSER] Creating new browser manager for profile ${profileId}`);
        manager = new BrowserManagerGoLogin(profileId);
        browserManagerCache.set(profileId, manager);
    }
    
    return manager;
}

/**
 * Get a browser for a specific profile ID
 * Convenience function that gets the manager and connects in one call
 * 
 * @param profileId - The GoLogin profile ID
 * @returns Connected Puppeteer Browser instance
 */
export async function getBrowserForProfile(profileId: string): Promise<Browser> {
    const manager = getBrowserManagerForProfile(profileId);
    return manager.getBrowser();
}

/**
 * Cleanup a specific profile's browser manager
 * 
 * @param profileId - The GoLogin profile ID
 */
export async function cleanupProfile(profileId: string): Promise<void> {
    const manager = browserManagerCache.get(profileId);
    if (manager) {
        await manager.cleanup();
        browserManagerCache.delete(profileId);
    }
}

/**
 * Cleanup all browser managers
 */
export async function cleanupAllProfiles(): Promise<void> {
    for (const [profileId, manager] of browserManagerCache.entries()) {
        await manager.cleanup();
    }
    browserManagerCache.clear();
}

// Export default instance for backward compatibility (uses env var profile)
const defaultProfileId = process.env.GOLOGIN_PROFILE_ID || '';
export const browserManagerGoLogin = defaultProfileId 
    ? getBrowserManagerForProfile(defaultProfileId)
    : new BrowserManagerGoLogin(''); // Will fail if used without profile ID
