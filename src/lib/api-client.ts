/**
 * API Client - Routes requests to appropriate backend
 * 
 * This module handles routing API requests to the correct backend:
 * - Quick APIs (auth, DB queries) → Same origin (Vercel)
 * - Long-running APIs (scrape, enrich) → Railway backend
 * 
 * ENVIRONMENT VARIABLES:
 * - NEXT_PUBLIC_RAILWAY_API_URL: Railway backend URL (optional)
 *   If not set, all requests go to same origin (for single-platform deployment)
 * 
 * USAGE:
 * ```typescript
 * import { apiFetch } from '@/lib/api-client';
 * const res = await apiFetch('/api/scrape', { method: 'POST', ... });
 * ```
 * 
 * @see docs/VERCEL_RAILWAY_SETUP.md for deployment architecture
 */

/**
 * Railway backend URL from environment
 * If not set, all requests go to same origin
 */
const RAILWAY_API_URL = typeof window !== 'undefined' 
    ? process.env.NEXT_PUBLIC_RAILWAY_API_URL 
    : process.env.NEXT_PUBLIC_RAILWAY_API_URL;

/**
 * APIs that should be routed to Railway (long-running operations)
 * These require persistent connections or long execution times
 */
const RAILWAY_APIS = [
    '/api/scrape',
    '/api/enrich',
    '/api/scrape/gologin-status',
    '/api/scrape/dolphin-status',
    '/api/verify-emails',
    '/api/browser', // Browser access/status/close endpoints
];

/**
 * Check if an endpoint should be routed to Railway
 * 
 * @param endpoint - API endpoint path
 * @returns true if the endpoint should go to Railway
 */
export function shouldUseRailway(endpoint: string): boolean {
    // If Railway URL is not configured, use same origin
    if (!RAILWAY_API_URL) {
        return false;
    }

    // Check if this endpoint matches any Railway API patterns
    return RAILWAY_APIS.some(api => endpoint.startsWith(api));
}

/**
 * Get the full URL for an API endpoint
 * 
 * @param endpoint - API endpoint path (e.g., '/api/scrape')
 * @returns Full URL with appropriate base
 */
export function getApiUrl(endpoint: string): string {
    // If Railway URL is set and endpoint should use Railway
    if (RAILWAY_API_URL && shouldUseRailway(endpoint)) {
        // Remove trailing slash from Railway URL if present
        const baseUrl = RAILWAY_API_URL.replace(/\/$/, '');
        return `${baseUrl}${endpoint}`;
    }

    // Use same origin (works for both SSR and client-side)
    return endpoint;
}

/**
 * Fetch wrapper that routes to correct backend
 * 
 * Use this instead of fetch() for API calls to ensure
 * requests go to the correct backend (Vercel or Railway).
 * 
 * @param endpoint - API endpoint path (e.g., '/api/scrape')
 * @param options - Fetch options
 * @returns Fetch response
 * 
 * @example
 * const res = await apiFetch('/api/scrape', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ url, pages })
 * });
 */
export async function apiFetch(
    endpoint: string,
    options?: RequestInit
): Promise<Response> {
    const url = getApiUrl(endpoint);
    
    // Add credentials for cross-origin requests to Railway
    const fetchOptions: RequestInit = {
        ...options,
        credentials: shouldUseRailway(endpoint) ? 'include' : 'same-origin',
    };

    return fetch(url, fetchOptions);
}

/**
 * Check if Railway backend is configured
 * 
 * Useful for conditional rendering or warnings in UI
 */
export function isRailwayConfigured(): boolean {
    return !!RAILWAY_API_URL;
}

/**
 * Get the Railway backend URL (masked for security)
 * 
 * Returns a masked version suitable for display
 */
export function getRailwayUrlDisplay(): string {
    if (!RAILWAY_API_URL) {
        return '(not configured - using same origin)';
    }
    
    try {
        const url = new URL(RAILWAY_API_URL);
        return `${url.protocol}//${url.host.substring(0, 10)}...`;
    } catch {
        return '(configured)';
    }
}

/**
 * Configuration info for debugging
 */
export function getApiClientConfig(): {
    railwayConfigured: boolean;
    railwayUrl: string;
    railwayApis: string[];
} {
    return {
        railwayConfigured: isRailwayConfigured(),
        railwayUrl: getRailwayUrlDisplay(),
        railwayApis: RAILWAY_APIS
    };
}

