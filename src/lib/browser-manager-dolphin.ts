/**
 * Dolphin Anty Browser Manager
 * 
 * This module manages connections to browser profiles through Dolphin Anty.
 * It provides the same interface as browser-manager-local.ts for seamless
 * integration with the scraper factory.
 * 
 * PREREQUISITES:
 * 1. Dolphin Anty installed and running
 * 2. Browser profile created with Apollo logged in
 * 3. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - DOLPHIN_ANTY_API_URL: API base URL (default: http://localhost:3001)
 * - DOLPHIN_ANTY_PROFILE_ID: Profile ID to use for scraping
 * 
 * CONFLICT PREVENTION:
 * - Only one browser manager should be active at a time
 * - Do not run alongside local Chrome mode
 * - Profile locks prevent concurrent access to the same profile
 * 
 * @see docs/ARCHITECTURE.md for system design documentation
 * @see docs/DOLPHIN_ANTY_SETUP.md for setup instructions
 */

import puppeteer, { Browser } from 'puppeteer';
import { dolphinAntyClient, DolphinAntyClient } from './dolphin-anty-client';

/** Maximum connection retry attempts */
const MAX_RETRIES = 3;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY = 2000;

/**
 * BrowserManagerDolphin handles connections to Dolphin Anty browser profiles
 * 
 * Singleton pattern ensures only one connection is active at a time.
 * This prevents resource conflicts and ensures session consistency.
 */
export class BrowserManagerDolphin {
    private static instance: BrowserManagerDolphin;
    private browser: Browser | null = null;
    private isConnecting = false;
    private client: DolphinAntyClient;
    private currentWsEndpoint: string | null = null;

    private constructor() {
        this.client = dolphinAntyClient;
    }

    /**
     * Get the singleton instance of BrowserManagerDolphin
     */
    static getInstance(): BrowserManagerDolphin {
        if (!BrowserManagerDolphin.instance) {
            BrowserManagerDolphin.instance = new BrowserManagerDolphin();
        }
        return BrowserManagerDolphin.instance;
    }

    /**
     * Check if Dolphin Anty is available
     * 
     * @returns true if Dolphin Anty API is accessible
     */
    async isDolphinAvailable(): Promise<boolean> {
        return this.client.isAvailable();
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
     * Start the Dolphin Anty profile
     * 
     * This will:
     * 1. Check if Dolphin Anty is available
     * 2. Start the configured profile
     * 3. Return the WebSocket endpoint for Puppeteer connection
     * 
     * @throws Error if Dolphin Anty is not available or profile fails to start
     */
    async startProfile(): Promise<string> {
        console.log('[DOLPHIN-BROWSER] Starting Dolphin Anty profile...');

        // Check if Dolphin Anty is available
        const available = await this.isDolphinAvailable();
        if (!available) {
            throw new Error(
                'Dolphin Anty is not available. Please ensure Dolphin Anty is running ' +
                'and the API is accessible at ' + (process.env.DOLPHIN_ANTY_API_URL || 'http://localhost:3001')
            );
        }

        // Ensure profile is running and get WebSocket endpoint
        const wsEndpoint = await this.client.ensureProfileRunning();
        this.currentWsEndpoint = wsEndpoint;

        console.log('[DOLPHIN-BROWSER] Profile started successfully');
        return wsEndpoint;
    }

    /**
     * Stop the Dolphin Anty profile
     */
    async stopProfile(): Promise<void> {
        console.log('[DOLPHIN-BROWSER] Stopping Dolphin Anty profile...');
        await this.client.stopProfile();
        this.currentWsEndpoint = null;
        console.log('[DOLPHIN-BROWSER] Profile stopped');
    }

    /**
     * Ensure the profile is running and ready
     * 
     * @returns WebSocket endpoint for the running profile
     */
    async ensureProfileReady(): Promise<string> {
        // Check if we already have a valid connection
        if (this.currentWsEndpoint && this.browser?.connected) {
            console.log('[DOLPHIN-BROWSER] Profile already running and connected');
            return this.currentWsEndpoint;
        }

        // Start the profile
        return this.startProfile();
    }

    /**
     * Connect to Dolphin Anty browser with retry logic
     * 
     * @returns Connected Puppeteer Browser instance
     * @throws Error if connection fails after all retries
     */
    async connect(): Promise<Browser> {
        // Return existing connection if available
        if (this.browser && this.browser.connected) {
            console.log('[DOLPHIN-BROWSER] Reusing existing browser connection');
            return this.browser;
        }

        // Prevent concurrent connection attempts
        if (this.isConnecting) {
            console.log('[DOLPHIN-BROWSER] Connection attempt already in progress, waiting...');
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
                    console.log(`[DOLPHIN-BROWSER] Connecting to browser (attempt ${attempt}/${MAX_RETRIES})...`);

                    this.browser = await puppeteer.connect({
                        browserWSEndpoint: wsEndpoint,
                        defaultViewport: null,
                    });

                    console.log('[DOLPHIN-BROWSER] Successfully connected to Dolphin Anty browser!');

                    // Set up disconnect handler
                    this.browser.on('disconnected', () => {
                        console.log('[DOLPHIN-BROWSER] Browser disconnected');
                        this.browser = null;
                        this.currentWsEndpoint = null;
                    });

                    return this.browser;
                } catch (error) {
                    console.error(`[DOLPHIN-BROWSER] Connection attempt ${attempt} failed:`, error);

                    if (attempt < MAX_RETRIES) {
                        console.log(`[DOLPHIN-BROWSER] Retrying in ${RETRY_DELAY}ms...`);
                        await this.sleep(RETRY_DELAY);

                        // Try restarting the profile if connection keeps failing
                        if (attempt === 2) {
                            console.log('[DOLPHIN-BROWSER] Restarting profile...');
                            await this.stopProfile();
                            await this.sleep(1000);
                            await this.startProfile();
                        }
                    } else {
                        throw new Error(
                            `Failed to connect to Dolphin Anty browser after ${MAX_RETRIES} attempts. ` +
                            'Please check that Dolphin Anty is running and the profile is properly configured.'
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
                console.log('[DOLPHIN-BROWSER] Disconnected from browser');
            } catch (error) {
                console.error('[DOLPHIN-BROWSER] Error disconnecting:', error);
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
        console.log('[DOLPHIN-BROWSER] Cleanup complete');
    }

    /**
     * Get the current profile status
     * Useful for monitoring and debugging
     */
    async getStatus(): Promise<{
        dolphinAvailable: boolean;
        profileId: string | null;
        profileRunning: boolean;
        browserConnected: boolean;
        wsEndpoint: string | null;
    }> {
        const available = await this.isDolphinAvailable();
        const status = await this.client.getProfileStatus();

        return {
            dolphinAvailable: available,
            profileId: this.client.getProfileId(),
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

// Export singleton instance for use by scraper-dolphin
export const browserManagerDolphin = BrowserManagerDolphin.getInstance();


