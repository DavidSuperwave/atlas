/**
 * Simple in-memory rate limiter
 * 
 * NOTE: This is suitable for single-server deployments.
 * For multi-server deployments, use Redis-based rate limiting.
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// Separate stores for different rate limit contexts
const stores: Map<string, Map<string, RateLimitEntry>> = new Map();

function getStore(context: string): Map<string, RateLimitEntry> {
    let store = stores.get(context);
    if (!store) {
        store = new Map();
        stores.set(context, store);
    }
    return store;
}

interface RateLimitOptions {
    /** Rate limit context/namespace (e.g., 'access-requests', 'invites') */
    context: string;
    /** Time window in milliseconds */
    windowMs: number;
    /** Max requests allowed per window */
    maxRequests: number;
}

interface RateLimitResult {
    /** Whether the request is rate limited */
    limited: boolean;
    /** Current request count */
    current: number;
    /** Max allowed requests */
    max: number;
    /** Seconds until reset */
    resetInSeconds: number;
}

/**
 * Check if a key is rate limited
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const store = getStore(options.context);
    const entry = store.get(key);
    
    // No entry or expired - create new entry
    if (!entry || now > entry.resetTime) {
        store.set(key, { count: 1, resetTime: now + options.windowMs });
        return {
            limited: false,
            current: 1,
            max: options.maxRequests,
            resetInSeconds: Math.ceil(options.windowMs / 1000),
        };
    }
    
    // Check if over limit
    if (entry.count >= options.maxRequests) {
        return {
            limited: true,
            current: entry.count,
            max: options.maxRequests,
            resetInSeconds: Math.ceil((entry.resetTime - now) / 1000),
        };
    }
    
    // Increment and allow
    entry.count++;
    return {
        limited: false,
        current: entry.count,
        max: options.maxRequests,
        resetInSeconds: Math.ceil((entry.resetTime - now) / 1000),
    };
}

/**
 * Get client IP from request headers
 */
export function getClientIp(request: Request): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

// Preset configurations
export const RATE_LIMITS = {
    /** Exporting leads to third-party tools: 10 per minute per user */
    EXPORT_LEADS: {
        context: 'export-leads',
        windowMs: 60 * 1000,
        maxRequests: 10,
    },
    /** Public access request submissions: 5 per minute per IP */
    ACCESS_REQUESTS: {
        context: 'access-requests',
        windowMs: 60 * 1000,
        maxRequests: 5,
    },
    /** Admin invite operations: 20 per hour per user */
    INVITE_SEND: {
        context: 'invite-send',
        windowMs: 60 * 60 * 1000,
        maxRequests: 20,
    },
    /** General API: 100 per minute per user */
    API_GENERAL: {
        context: 'api-general',
        windowMs: 60 * 1000,
        maxRequests: 100,
    },
    /** Scrape creation: 10 per hour per user */
    SCRAPE: {
        context: 'scrape',
        windowMs: 60 * 60 * 1000,
        maxRequests: 10,
    },
    /** Enrichment requests: 3000 per hour per user */
    ENRICH: {
        context: 'enrich',
        windowMs: 60 * 60 * 1000,
        maxRequests: 3000,
    },
    /** Email verification (bulk/upload/start): 5000 per hour per user */
    VERIFY_EMAILS: {
        context: 'verify-emails',
        windowMs: 60 * 60 * 1000,
        maxRequests: 5000,
    },
    /** Browser access: 20 per hour per user */
    BROWSER_ACCESS: {
        context: 'browser-access',
        windowMs: 60 * 60 * 1000,
        maxRequests: 20,
    },
} as const;

