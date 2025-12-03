import puppeteer, { Browser } from 'puppeteer';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

const CHROME_DEBUG_PORT = 9222;
const CHROME_DEBUG_URL = `http://127.0.0.1:${CHROME_DEBUG_PORT}`;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Detect platform
const platform = os.platform();

// Chrome installation paths by platform
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

export class BrowserManager {
    private static instance: BrowserManager;
    private browser: Browser | null = null;
    private isConnecting = false;

    private constructor() { }

    static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    /**
     * Find Chrome executable path based on current platform
     */
    private async findChrome(): Promise<string | null> {
        const fs = require('fs').promises;
        const paths = CHROME_PATHS[platform] || [];

        for (const path of paths) {
            try {
                await fs.access(path);
                console.log(`Found Chrome at: ${path}`);
                return path;
            } catch {
                continue;
            }
        }

        console.error(`Chrome not found in common locations for ${platform}`);
        return null;
    }

    /**
     * Check if Chrome is running with debugging port
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
     */
    private async killChrome(): Promise<void> {
        try {
            if (platform === 'win32') {
                await execAsync('taskkill /F /IM chrome.exe /T', { timeout: 5000 });
            } else {
                // macOS and Linux
                await execAsync('pkill -f "Google Chrome"', { timeout: 5000 });
            }
            console.log('Closed existing Chrome instances');
            await this.sleep(1500);
        } catch (err) {
            // Ignore errors if Chrome wasn't running
            console.log('No existing Chrome instances to close');
        }
    }

    /**
     * Get the temp directory path based on platform
     */
    private getTempDir(): string {
        if (platform === 'win32') {
            return '%TEMP%\\chrome-debug-profile';
        }
        return `${os.tmpdir()}/chrome-debug-profile`;
    }

    /**
     * Start Chrome with remote debugging enabled
     */
    async startChrome(): Promise<void> {
        console.log(`Starting Chrome with remote debugging on ${platform}...`);

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
                    console.error('Error starting Chrome:', error);
                }
            });

            console.log('Chrome starting... waiting for debugging port to be ready');

            // Wait for Chrome to be ready
            await this.waitForChromeReady();

            console.log('Chrome is ready!');
        } catch (error) {
            throw new Error(`Failed to start Chrome: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Wait for Chrome debugging port to be ready
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
     */
    async ensureChromeReady(): Promise<void> {
        const isRunning = await this.isChromeRunning();

        if (!isRunning) {
            console.log('Chrome is not running. Starting Chrome...');
            await this.startChrome();
        } else {
            console.log('Chrome is already running with debugging port');
        }
    }

    /**
     * Connect to Chrome browser with retry logic
     */
    async connect(): Promise<Browser> {
        // Return existing connection if available
        if (this.browser && this.browser.connected) {
            console.log('Reusing existing browser connection');
            return this.browser;
        }

        // Prevent concurrent connection attempts
        if (this.isConnecting) {
            console.log('Connection attempt already in progress, waiting...');
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
                    console.log(`Connecting to browser (attempt ${attempt}/${MAX_RETRIES})...`);

                    this.browser = await puppeteer.connect({
                        browserURL: CHROME_DEBUG_URL,
                        defaultViewport: null,
                    });

                    console.log('Successfully connected to browser!');

                    // Set up disconnect handler
                    this.browser.on('disconnected', () => {
                        console.log('Browser disconnected');
                        this.browser = null;
                    });

                    return this.browser;
                } catch (error) {
                    console.error(`Connection attempt ${attempt} failed:`, error);

                    if (attempt < MAX_RETRIES) {
                        console.log(`Retrying in ${RETRY_DELAY}ms...`);
                        await this.sleep(RETRY_DELAY);

                        // Try restarting Chrome if connection keeps failing
                        if (attempt === 2) {
                            console.log('Restarting Chrome...');
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
     */
    async getBrowser(): Promise<Browser> {
        return this.connect();
    }

    /**
     * Disconnect from browser (keeps Chrome running)
     */
    async disconnect(): Promise<void> {
        if (this.browser) {
            try {
                await this.browser.disconnect();
                console.log('Disconnected from browser');
            } catch (error) {
                console.error('Error disconnecting:', error);
            }
            this.browser = null;
        }
    }

    /**
     * Cleanup and close Chrome
     */
    async cleanup(): Promise<void> {
        await this.disconnect();
        await this.killChrome();
        console.log('Chrome cleanup complete');
    }

    /**
     * Helper sleep function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const browserManager = BrowserManager.getInstance();
