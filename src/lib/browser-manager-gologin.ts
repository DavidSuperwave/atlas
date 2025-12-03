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
 * 1. GoLogin account with API access
 * 2. Browser profile created with Apollo logged in
 * 3. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - GOLOGIN_API_TOKEN: API token from GoLogin dashboard
 * - GOLOGIN_PROFILE_ID: Default profile ID (optional fallback)
 * 
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

import puppeteer, { Browser } from 'puppeteer';
import { GoLoginClient } from './gologin-client';

/** Maximum connection retry attempts */
const MAX_RETRIES = 3;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY = 2000;

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
     * 1. Check if GoLogin is available
     * 2. Start the configured profile
     * 3. Return the WebSocket endpoint for Puppeteer connection
     * 
     * @throws Error if GoLogin is not available or profile fails to start
     */
    async startProfile(): Promise<string> {
        console.log(`[GOLOGIN-BROWSER] Starting GoLogin profile ${this.profileId}...`);

        // Check if GoLogin API is available
        const available = await this.isGoLoginAvailable();
        if (!available) {
            throw new Error(
                'GoLogin API is not available. Please check your API token and internet connection.'
            );
        }

        // Ensure profile is running and get WebSocket endpoint
        const wsEndpoint = await this.client.ensureProfileRunning();
        this.currentWsEndpoint = wsEndpoint;

        console.log(`[GOLOGIN-BROWSER] Profile ${this.profileId} started successfully`);
        return wsEndpoint;
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

        try {
            // Ensure profile is running and get WebSocket endpoint
            const wsEndpoint = await this.ensureProfileReady();

            // Attempt connection with retries
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[GOLOGIN-BROWSER] Connecting to browser for profile ${this.profileId} (attempt ${attempt}/${MAX_RETRIES})...`);

                    this.browser = await puppeteer.connect({
                        browserWSEndpoint: wsEndpoint,
                        defaultViewport: null,
                    });

                    console.log(`[GOLOGIN-BROWSER] Successfully connected to GoLogin browser for profile ${this.profileId}!`);

                    // Set up disconnect handler
                    this.browser.on('disconnected', () => {
                        console.log(`[GOLOGIN-BROWSER] Browser disconnected for profile ${this.profileId}`);
                        this.browser = null;
                        this.currentWsEndpoint = null;
                    });

                    return this.browser;
                } catch (error) {
                    console.error(`[GOLOGIN-BROWSER] Connection attempt ${attempt} failed for profile ${this.profileId}:`, error);

                    if (attempt < MAX_RETRIES) {
                        console.log(`[GOLOGIN-BROWSER] Retrying in ${RETRY_DELAY}ms...`);
                        await this.sleep(RETRY_DELAY);

                        // Try restarting the profile if connection keeps failing
                        if (attempt === 2) {
                            console.log(`[GOLOGIN-BROWSER] Restarting profile ${this.profileId}...`);
                            await this.stopProfile();
                            await this.sleep(1000);
                            await this.startProfile();
                        }
                    } else {
                        throw new Error(
                            `Failed to connect to GoLogin browser for profile ${this.profileId} after ${MAX_RETRIES} attempts. ` +
                            'Please check that your GoLogin profile is properly configured.'
                        );
                    }
                }
            }

            throw new Error('Failed to connect to browser');
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
