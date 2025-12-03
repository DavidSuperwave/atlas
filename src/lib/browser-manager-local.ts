/**
 * Local Browser Manager for Chrome with Remote Debugging
 * 
 * This module manages connections to a local Chrome browser instance
 * running with remote debugging enabled on port 9222.
 * 
 * USAGE:
 * 1. Start Chrome manually with: --remote-debugging-port=9222
 * 2. Login to Apollo in the browser
 * 3. The scraper will connect to this browser instance
 * 
 * ENVIRONMENT:
 * - Used when SCRAPER_MODE is 'local' or not set (default)
 * 
 * CONFLICT PREVENTION:
 * - Only one browser manager should be active at a time
 * - Do not run alongside Dolphin Anty mode
 * 
 * @see docs/ARCHITECTURE.md for system design documentation
 */

import puppeteer, { Browser } from 'puppeteer';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

/** Chrome remote debugging port - must match the port Chrome is started with */
const CHROME_DEBUG_PORT = 9222;
/** URL for connecting to Chrome's debugging interface */
const CHROME_DEBUG_URL = `http://127.0.0.1:${CHROME_DEBUG_PORT}`;
/** Maximum connection retry attempts */
const MAX_RETRIES = 3;
/** Delay between retry attempts in milliseconds */
const RETRY_DELAY = 2000;

// Detect platform for platform-specific operations
const platform = os.platform();

/**
 * Chrome installation paths by platform
 * Used to find and launch Chrome automatically
 */
const CHROME_PATHS: Record<string, string[]> = {
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        `${os.homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
    ],
};

/**
 * BrowserManager handles connections to local Chrome browser
 * 
 * Singleton pattern ensures only one connection is active at a time.
 * This prevents resource conflicts and ensures session consistency.
 */
export class BrowserManagerLocal {
    private static instance: BrowserManagerLocal;
    private browser: Browser | null = null;
    private isConnecting = false;

    private constructor() { }

    /**
     * Get the singleton instance of BrowserManagerLocal
     */
    static getInstance(): BrowserManagerLocal {
        if (!BrowserManagerLocal.instance) {
            BrowserManagerLocal.instance = new BrowserManagerLocal();
        }
        return BrowserManagerLocal.instance;
    }

    /**
     * Find Chrome executable path based on current platform
     * @returns Path to Chrome executable or null if not found
     */
    private async findChrome(): Promise<string | null> {
        const fs = require('fs').promises;
        const paths = CHROME_PATHS[platform] || [];

        for (const path of paths) {
            try {
                await fs.access(path);
                console.log(`[LOCAL-BROWSER] Found Chrome at: ${path}`);
                return path;
            } catch {
                continue;
            }
        }

        console.error(`[LOCAL-BROWSER] Chrome not found in common locations for ${platform}`);
        return null;
    }

    /**
     * Check if Chrome is running with debugging port
     * 
     * This can be used to detect conflicts - if Chrome is running
     * when Dolphin mode is selected, we should warn the user.
     * 
     * @returns true if Chrome debugging port is accessible
     */
    async isChromeRunning(): Promise<boolean> {
        try {
            const response = await fetch(`${CHROME_DEBUG_URL}/json/version`, {
                signal: AbortSignal.timeout(2000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Kill Chrome processes based on platform
     * Used to clean up before starting a fresh instance
     */
    private async killChrome(): Promise<void> {
        try {
            if (platform === 'win32') {
                await execAsync('taskkill /F /IM chrome.exe /T', { timeout: 5000 });
            } else {
                // macOS and Linux
                await execAsync('pkill -f "Google Chrome"', { timeout: 5000 });
            }
            console.log('[LOCAL-BROWSER] Closed existing Chrome instances');
            await this.sleep(1500);
        } catch (err) {
            // Ignore errors if Chrome wasn't running
            console.log('[LOCAL-BROWSER] No existing Chrome instances to close');
        }
    }

    /**
     * Get the temp directory path based on platform
     * Used for Chrome's user data directory
     */
    private getTempDir(): string {
        if (platform === 'win32') {
            return '%TEMP%\\chrome-debug-profile';
        }
        return `${os.tmpdir()}/chrome-debug-profile`;
    }

    /**
     * Start Chrome with remote debugging enabled
     * 
     * This will:
     * 1. Kill any existing Chrome instances
     * 2. Start Chrome with remote debugging on port 9222
     * 3. Open Apollo login page
     * 4. Wait for the debugging port to be ready
     */
    async startChrome(): Promise<void> {
        console.log(`[LOCAL-BROWSER] Starting Chrome with remote debugging on ${platform}...`);

        const chromePath = await this.findChrome();
        if (!chromePath) {
            throw new Error(
                `Chrome not found. Please install Google Chrome or set the path manually. Platform: ${platform}`
            );
        }

        try {
            // Kill any existing Chrome processes to avoid conflicts
            await this.killChrome();

            const tempDir = this.getTempDir();
            let command: string;

            if (platform === 'win32') {
                command = `"${chromePath}" --remote-debugging-port=${CHROME_DEBUG_PORT} --user-data-dir="${tempDir}" "https://app.apollo.io/#/login"`;
            } else {
                // macOS and Linux - need to escape spaces and use proper quoting
                command = `"${chromePath}" --remote-debugging-port=${CHROME_DEBUG_PORT} --user-data-dir="${tempDir}" "https://app.apollo.io/#/login"`;
            }

            exec(command, (error) => {
                if (error) {
                    console.error('[LOCAL-BROWSER] Error starting Chrome:', error);
                }
            });

            console.log('[LOCAL-BROWSER] Chrome starting... waiting for debugging port to be ready');

            // Wait for Chrome to be ready
            await this.waitForChromeReady();

            console.log('[LOCAL-BROWSER] Chrome is ready!');
        } catch (error) {
            throw new Error(`Failed to start Chrome: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Wait for Chrome debugging port to be ready
     * @param maxWaitMs Maximum time to wait in milliseconds
     */
    private async waitForChromeReady(maxWaitMs = 15000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            if (await this.isChromeRunning()) {
                return;
            }
            await this.sleep(500);
        }

        throw new Error('Chrome did not start within the expected time');
    }

    /**
     * Ensure Chrome is running and ready
     * Starts Chrome if not already running
     */
    async ensureChromeReady(): Promise<void> {
        const isRunning = await this.isChromeRunning();

        if (!isRunning) {
            console.log('[LOCAL-BROWSER] Chrome is not running. Starting Chrome...');
            await this.startChrome();
        } else {
            console.log('[LOCAL-BROWSER] Chrome is already running with debugging port');
        }
    }

    /**
     * Connect to Chrome browser with retry logic
     * 
     * @returns Connected Puppeteer Browser instance
     * @throws Error if connection fails after all retries
     */
    async connect(): Promise<Browser> {
        // Return existing connection if available
        if (this.browser && this.browser.connected) {
            console.log('[LOCAL-BROWSER] Reusing existing browser connection');
            return this.browser;
        }

        // Prevent concurrent connection attempts
        if (this.isConnecting) {
            console.log('[LOCAL-BROWSER] Connection attempt already in progress, waiting...');
            await this.sleep(1000);
            return this.connect();
        }

        this.isConnecting = true;

        try {
            // Ensure Chrome is running
            await this.ensureChromeReady();

            // Attempt connection with retries
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[LOCAL-BROWSER] Connecting to browser (attempt ${attempt}/${MAX_RETRIES})...`);

                    this.browser = await puppeteer.connect({
                        browserURL: CHROME_DEBUG_URL,
                        defaultViewport: null,
                    });

                    console.log('[LOCAL-BROWSER] Successfully connected to browser!');

                    // Set up disconnect handler
                    this.browser.on('disconnected', () => {
                        console.log('[LOCAL-BROWSER] Browser disconnected');
                        this.browser = null;
                    });

                    return this.browser;
                } catch (error) {
                    console.error(`[LOCAL-BROWSER] Connection attempt ${attempt} failed:`, error);

                    if (attempt < MAX_RETRIES) {
                        console.log(`[LOCAL-BROWSER] Retrying in ${RETRY_DELAY}ms...`);
                        await this.sleep(RETRY_DELAY);

                        // Try restarting Chrome if connection keeps failing
                        if (attempt === 2) {
                            console.log('[LOCAL-BROWSER] Restarting Chrome...');
                            await this.startChrome();
                        }
                    } else {
                        const chromeCmd = platform === 'win32' 
                            ? `chrome.exe --remote-debugging-port=${CHROME_DEBUG_PORT}`
                            : `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=${CHROME_DEBUG_PORT}`;
                        throw new Error(
                            `Failed to connect to Chrome after ${MAX_RETRIES} attempts. ` +
                            `Please ensure Chrome is running with: ${chromeCmd}`
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
     * Disconnect from browser (keeps Chrome running)
     * Use this when done scraping but want to keep the session
     */
    async disconnect(): Promise<void> {
        if (this.browser) {
            try {
                await this.browser.disconnect();
                console.log('[LOCAL-BROWSER] Disconnected from browser');
            } catch (error) {
                console.error('[LOCAL-BROWSER] Error disconnecting:', error);
            }
            this.browser = null;
        }
    }

    /**
     * Cleanup and close Chrome
     * Use this for full cleanup when switching modes or shutting down
     */
    async cleanup(): Promise<void> {
        await this.disconnect();
        await this.killChrome();
        console.log('[LOCAL-BROWSER] Chrome cleanup complete');
    }

    /**
     * Helper sleep function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance for use by scraper-local
export const browserManagerLocal = BrowserManagerLocal.getInstance();


