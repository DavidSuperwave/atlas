/**
 * GoLogin Browser Manager
 * 
 * This module manages connections to browser profiles through GoLogin cloud.
 * It provides the same interface as browser-manager-dolphin.ts for seamless
 * integration with the scraper factory.
 * 
 * PREREQUISITES:
 * 1. GoLogin account with API access
 * 2. Browser profile created with Apollo logged in
 * 3. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - GOLOGIN_API_TOKEN: API token from GoLogin dashboard
 * - GOLOGIN_PROFILE_ID: Profile ID to use for scraping
 * 
 * ADVANTAGES OVER DOLPHIN ANTY:
 * - Cloud-based: No local installation required
 * - No VNC setup needed
 * - Web dashboard for team access
 * - API-first design
 * 
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

import puppeteer, { Browser } from 'puppeteer';
import { goLoginClient, GoLoginClient } from './gologin-client';

/** Maximum connection retry attempts */
const MAX_RETRIES = 3;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY = 2000;

/**
 * BrowserManagerGoLogin handles connections to GoLogin browser profiles
 * 
 * Singleton pattern ensures only one connection is active at a time.
 * This prevents resource conflicts and ensures session consistency.
 */
export class BrowserManagerGoLogin {
    private static instance: BrowserManagerGoLogin;
    private browser: Browser | null = null;
    private isConnecting = false;
    private client: GoLoginClient;
    private currentWsEndpoint: string | null = null;

    private constructor() {
        this.client = goLoginClient;
    }

    /**
     * Get the singleton instance of BrowserManagerGoLogin
     */
    static getInstance(): BrowserManagerGoLogin {
        if (!BrowserManagerGoLogin.instance) {
            BrowserManagerGoLogin.instance = new BrowserManagerGoLogin();
        }
        return BrowserManagerGoLogin.instance;
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
        console.log('[GOLOGIN-BROWSER] Starting GoLogin profile...');

        // Check if GoLogin is configured
        if (!this.isConfigured()) {
            throw new Error(
                'GoLogin is not configured. Please set GOLOGIN_API_TOKEN and GOLOGIN_PROFILE_ID environment variables.'
            );
        }

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

        console.log('[GOLOGIN-BROWSER] Profile started successfully');
        return wsEndpoint;
    }

    /**
     * Stop the GoLogin profile
     */
    async stopProfile(): Promise<void> {
        console.log('[GOLOGIN-BROWSER] Stopping GoLogin profile...');
        await this.client.stopProfile();
        this.currentWsEndpoint = null;
        console.log('[GOLOGIN-BROWSER] Profile stopped');
    }

    /**
     * Ensure the profile is running and ready
     * 
     * @returns WebSocket endpoint for the running profile
     */
    async ensureProfileReady(): Promise<string> {
        // Check if we already have a valid connection
        if (this.currentWsEndpoint && this.browser?.connected) {
            console.log('[GOLOGIN-BROWSER] Profile already running and connected');
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
            console.log('[GOLOGIN-BROWSER] Reusing existing browser connection');
            return this.browser;
        }

        // Prevent concurrent connection attempts
        if (this.isConnecting) {
            console.log('[GOLOGIN-BROWSER] Connection attempt already in progress, waiting...');
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
                    console.log(`[GOLOGIN-BROWSER] Connecting to browser (attempt ${attempt}/${MAX_RETRIES})...`);

                    this.browser = await puppeteer.connect({
                        browserWSEndpoint: wsEndpoint,
                        defaultViewport: null,
                    });

                    console.log('[GOLOGIN-BROWSER] Successfully connected to GoLogin browser!');

                    // Set up disconnect handler
                    this.browser.on('disconnected', () => {
                        console.log('[GOLOGIN-BROWSER] Browser disconnected');
                        this.browser = null;
                        this.currentWsEndpoint = null;
                    });

                    return this.browser;
                } catch (error) {
                    console.error(`[GOLOGIN-BROWSER] Connection attempt ${attempt} failed:`, error);

                    if (attempt < MAX_RETRIES) {
                        console.log(`[GOLOGIN-BROWSER] Retrying in ${RETRY_DELAY}ms...`);
                        await this.sleep(RETRY_DELAY);

                        // Try restarting the profile if connection keeps failing
                        if (attempt === 2) {
                            console.log('[GOLOGIN-BROWSER] Restarting profile...');
                            await this.stopProfile();
                            await this.sleep(1000);
                            await this.startProfile();
                        }
                    } else {
                        throw new Error(
                            `Failed to connect to GoLogin browser after ${MAX_RETRIES} attempts. ` +
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
                console.log('[GOLOGIN-BROWSER] Disconnected from browser');
            } catch (error) {
                console.error('[GOLOGIN-BROWSER] Error disconnecting:', error);
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
        console.log('[GOLOGIN-BROWSER] Cleanup complete');
    }

    /**
     * Get the current profile status
     * Useful for monitoring and debugging
     */
    async getStatus(): Promise<{
        goLoginAvailable: boolean;
        configured: boolean;
        profileId: string | null;
        profileRunning: boolean;
        browserConnected: boolean;
        wsEndpoint: string | null;
    }> {
        const available = await this.isGoLoginAvailable();
        const status = await this.client.getProfileStatus();

        return {
            goLoginAvailable: available,
            configured: this.isConfigured(),
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

// Export singleton instance for use by scraper-gologin
export const browserManagerGoLogin = BrowserManagerGoLogin.getInstance();

