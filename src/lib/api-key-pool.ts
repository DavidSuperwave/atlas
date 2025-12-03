/**
 * API Key Pool Manager
 * 
 * Manages multiple MailTester API keys for parallel email verification.
 * Handles rate limiting per key and distributes load across available keys.
 * 
 * RATE LIMITS (MailTester Ninja):
 * - 170 emails per 30 seconds per key
 * - 500,000 emails per day per key
 * 
 * ENVIRONMENT VARIABLES:
 * - MAILTESTER_API_KEY: Single key (backward compatible)
 * - MAILTESTER_API_KEYS: JSON array of keys for scaling
 * 
 * Example:
 *   MAILTESTER_API_KEYS='["key1","key2","key3"]'
 * 
 * Or use numbered keys:
 *   MAILTESTER_API_KEY_1=xxx
 *   MAILTESTER_API_KEY_2=yyy
 *   MAILTESTER_API_KEY_3=zzz
 */

/** Rate limit configuration */
const RATE_LIMIT_WINDOW_MS = 30000; // 30 seconds
const REQUESTS_PER_WINDOW = 170;    // 170 emails per 30 seconds
const DAILY_LIMIT = 500000;         // 500k per day per key

/** Minimum delay between requests on same key (ms) */
const MIN_REQUEST_DELAY = Math.ceil(RATE_LIMIT_WINDOW_MS / REQUESTS_PER_WINDOW); // ~176ms

/** API key usage tracking */
interface KeyUsage {
    /** Requests in current 30-second window */
    windowCount: number;
    /** Timestamp when current window started */
    windowStart: number;
    /** Total requests today */
    dailyCount: number;
    /** Date string for daily reset (YYYY-MM-DD) */
    dailyDate: string;
    /** Timestamp of last request */
    lastRequest: number;
    /** Is this key currently in use (locked) */
    inUse: boolean;
}

/**
 * API Key Pool Manager
 * 
 * Singleton class that manages multiple API keys with rate limiting.
 */
export class ApiKeyPool {
    private static instance: ApiKeyPool;
    private keys: string[] = [];
    private keyNames: Map<string, string> = new Map(); // key -> name mapping
    private usage: Map<string, KeyUsage> = new Map();
    private initialized = false;

    private constructor() {
        this.loadKeys();
    }

    /**
     * Get singleton instance
     */
    static getInstance(): ApiKeyPool {
        if (!ApiKeyPool.instance) {
            ApiKeyPool.instance = new ApiKeyPool();
        }
        return ApiKeyPool.instance;
    }

    /**
     * Load API keys from environment variables
     */
    private loadKeys(): void {
        const keys: string[] = [];
        
        // Method 1: JSON array
        const jsonKeys = process.env.MAILTESTER_API_KEYS;
        if (jsonKeys) {
            try {
                const parsed = JSON.parse(jsonKeys);
                if (Array.isArray(parsed)) {
                    parsed.forEach((key, index) => {
                        if (typeof key === 'string' && key.trim()) {
                            keys.push(key.trim());
                            this.keyNames.set(key.trim(), `key_${index + 1}`);
                        } else if (typeof key === 'object' && key.key) {
                            keys.push(key.key.trim());
                            this.keyNames.set(key.key.trim(), key.name || `key_${index + 1}`);
                        }
                    });
                }
            } catch (e) {
                console.warn('[API-KEY-POOL] Failed to parse MAILTESTER_API_KEYS JSON:', e);
            }
        }

        // Method 2: Numbered keys (MAILTESTER_API_KEY_1, MAILTESTER_API_KEY_2, etc.)
        for (let i = 1; i <= 20; i++) {
            const key = process.env[`MAILTESTER_API_KEY_${i}`];
            if (key && key.trim() && !keys.includes(key.trim())) {
                keys.push(key.trim());
                this.keyNames.set(key.trim(), `key_${i}`);
            }
        }

        // Method 3: Single key (backward compatible)
        const singleKey = process.env.MAILTESTER_API_KEY;
        if (singleKey && singleKey.trim() && !keys.includes(singleKey.trim())) {
            keys.push(singleKey.trim());
            this.keyNames.set(singleKey.trim(), 'primary');
        }

        this.keys = keys;
        
        // Initialize usage tracking for each key
        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];
        
        for (const key of keys) {
            this.usage.set(key, {
                windowCount: 0,
                windowStart: now,
                dailyCount: 0,
                dailyDate: today,
                lastRequest: 0,
                inUse: false
            });
        }

        this.initialized = true;
        console.log(`[API-KEY-POOL] Loaded ${keys.length} API key(s)`);
        
        if (keys.length === 0) {
            console.warn('[API-KEY-POOL] No API keys configured! Set MAILTESTER_API_KEY or MAILTESTER_API_KEYS');
        }
    }

    /**
     * Get the number of available keys
     */
    getKeyCount(): number {
        return this.keys.length;
    }

    /**
     * Get all key names (for logging/monitoring)
     */
    getKeyNames(): string[] {
        return this.keys.map(key => this.keyNames.get(key) || 'unknown');
    }

    /**
     * Check if a key has available quota in current window
     */
    private hasWindowQuota(key: string): boolean {
        const usage = this.usage.get(key);
        if (!usage) return false;

        const now = Date.now();
        
        // Reset window if 30 seconds have passed
        if (now - usage.windowStart >= RATE_LIMIT_WINDOW_MS) {
            usage.windowCount = 0;
            usage.windowStart = now;
        }

        return usage.windowCount < REQUESTS_PER_WINDOW;
    }

    /**
     * Check if a key has available daily quota
     */
    private hasDailyQuota(key: string): boolean {
        const usage = this.usage.get(key);
        if (!usage) return false;

        const today = new Date().toISOString().split('T')[0];
        
        // Reset daily count if new day
        if (usage.dailyDate !== today) {
            usage.dailyCount = 0;
            usage.dailyDate = today;
        }

        return usage.dailyCount < DAILY_LIMIT;
    }

    /**
     * Check if key is available (not in use, has quota)
     */
    private isKeyAvailable(key: string): boolean {
        const usage = this.usage.get(key);
        if (!usage) return false;
        
        return !usage.inUse && this.hasWindowQuota(key) && this.hasDailyQuota(key);
    }

    /**
     * Get time until a key becomes available (ms)
     */
    private getTimeUntilAvailable(key: string): number {
        const usage = this.usage.get(key);
        if (!usage) return Infinity;

        const now = Date.now();
        
        // If key is in use, we need to wait for it to be released
        if (usage.inUse) {
            return MIN_REQUEST_DELAY;
        }

        // If window quota exhausted, wait until window resets
        if (!this.hasWindowQuota(key)) {
            return Math.max(0, (usage.windowStart + RATE_LIMIT_WINDOW_MS) - now);
        }

        // If we need to wait for rate limit delay
        const timeSinceLastRequest = now - usage.lastRequest;
        if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
            return MIN_REQUEST_DELAY - timeSinceLastRequest;
        }

        return 0;
    }

    /**
     * Get an available API key
     * 
     * Returns the key with the most available quota and least recent usage.
     * Waits if necessary for a key to become available.
     * 
     * @returns API key string
     * @throws Error if no keys are configured
     */
    async getAvailableKey(): Promise<string> {
        if (this.keys.length === 0) {
            throw new Error('No API keys configured. Set MAILTESTER_API_KEY environment variable.');
        }

        // Find immediately available key
        for (const key of this.keys) {
            if (this.isKeyAvailable(key)) {
                return key;
            }
        }

        // No immediately available key, find the one that will be available soonest
        let bestKey = this.keys[0];
        let shortestWait = this.getTimeUntilAvailable(this.keys[0]);

        for (const key of this.keys.slice(1)) {
            const waitTime = this.getTimeUntilAvailable(key);
            if (waitTime < shortestWait) {
                shortestWait = waitTime;
                bestKey = key;
            }
        }

        // Wait for the key to become available
        if (shortestWait > 0) {
            console.log(`[API-KEY-POOL] Waiting ${shortestWait}ms for key to become available`);
            await new Promise(resolve => setTimeout(resolve, shortestWait));
        }

        return bestKey;
    }

    /**
     * Acquire a key for exclusive use
     * 
     * Marks the key as in-use to prevent concurrent access.
     * Must call releaseKey() when done.
     * 
     * @returns API key string
     */
    async acquireKey(): Promise<string> {
        const key = await this.getAvailableKey();
        const usage = this.usage.get(key);
        
        if (usage) {
            usage.inUse = true;
        }

        const keyName = this.keyNames.get(key) || 'unknown';
        console.log(`[API-KEY-POOL] Acquired key: ${keyName}`);
        
        return key;
    }

    /**
     * Release a key after use
     * 
     * @param key - The API key to release
     */
    releaseKey(key: string): void {
        const usage = this.usage.get(key);
        if (usage) {
            usage.inUse = false;
        }
        
        const keyName = this.keyNames.get(key) || 'unknown';
        console.log(`[API-KEY-POOL] Released key: ${keyName}`);
    }

    /**
     * Track usage of a key after making a request
     * 
     * @param key - The API key that was used
     */
    trackUsage(key: string): void {
        const usage = this.usage.get(key);
        if (!usage) return;

        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];

        // Reset window if needed
        if (now - usage.windowStart >= RATE_LIMIT_WINDOW_MS) {
            usage.windowCount = 0;
            usage.windowStart = now;
        }

        // Reset daily if new day
        if (usage.dailyDate !== today) {
            usage.dailyCount = 0;
            usage.dailyDate = today;
        }

        // Increment counters
        usage.windowCount++;
        usage.dailyCount++;
        usage.lastRequest = now;
    }

    /**
     * Get usage statistics for all keys
     * 
     * @returns Array of key statistics
     */
    getStats(): Array<{
        name: string;
        windowCount: number;
        windowRemaining: number;
        dailyCount: number;
        dailyRemaining: number;
        inUse: boolean;
    }> {
        return this.keys.map(key => {
            const usage = this.usage.get(key)!;
            const name = this.keyNames.get(key) || 'unknown';
            
            return {
                name,
                windowCount: usage.windowCount,
                windowRemaining: REQUESTS_PER_WINDOW - usage.windowCount,
                dailyCount: usage.dailyCount,
                dailyRemaining: DAILY_LIMIT - usage.dailyCount,
                inUse: usage.inUse
            };
        });
    }

    /**
     * Get total capacity across all keys
     */
    getTotalCapacity(): {
        keysCount: number;
        requestsPerMinute: number;
        requestsPerHour: number;
        requestsPerDay: number;
    } {
        const keysCount = this.keys.length;
        return {
            keysCount,
            requestsPerMinute: keysCount * (REQUESTS_PER_WINDOW * 2), // 2 windows per minute
            requestsPerHour: keysCount * (REQUESTS_PER_WINDOW * 120), // 120 windows per hour
            requestsPerDay: keysCount * DAILY_LIMIT
        };
    }

    /**
     * Get the name for a key (for logging)
     */
    getKeyName(key: string): string {
        return this.keyNames.get(key) || 'unknown';
    }

    /**
     * Check if pool has any keys configured
     */
    hasKeys(): boolean {
        return this.keys.length > 0;
    }

    /**
     * Get delay needed before next request on a key
     */
    getDelayForKey(key: string): number {
        const usage = this.usage.get(key);
        if (!usage) return MIN_REQUEST_DELAY;

        const now = Date.now();
        const timeSinceLastRequest = now - usage.lastRequest;
        
        if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
            return MIN_REQUEST_DELAY - timeSinceLastRequest;
        }
        
        return 0;
    }
}

// Export singleton instance
export const apiKeyPool = ApiKeyPool.getInstance();

/**
 * Helper function to get an available key
 * Convenience wrapper around apiKeyPool.getAvailableKey()
 */
export async function getAvailableApiKey(): Promise<string> {
    return apiKeyPool.getAvailableKey();
}

/**
 * Helper function to track key usage
 */
export function trackApiKeyUsage(key: string): void {
    apiKeyPool.trackUsage(key);
}


