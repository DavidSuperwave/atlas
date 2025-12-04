/**
 * GoLogin API Client
 * 
 * This module provides a TypeScript client for interacting with GoLogin.
 * It uses the official 'gologin' npm package for browser automation (Puppeteer support)
 * and keeps cloud API methods for status checks and profile management.
 * 
 * PREREQUISITES:
 * 1. GoLogin account with API access
 * 2. Browser profile created with Apollo logged in
 * 3. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - GOLOGIN_API_TOKEN: API token from GoLogin dashboard
 * - GOLOGIN_PROFILE_ID: Profile ID to use for scraping
 * - GOLOGIN_DEBUG: Set to 'true' for verbose logging
 * 
 * @see https://github.com/gologinapp/gologin
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

// @ts-ignore - gologin package doesn't have TypeScript definitions
import { GoLogin } from 'gologin';

/** GoLogin API base URL for status/management calls */
const GOLOGIN_API_URL = 'https://api.gologin.com';

/** Debug mode flag */
const DEBUG = process.env.GOLOGIN_DEBUG === 'true';

/**
 * Debug log helper - only logs when GOLOGIN_DEBUG=true
 */
function debugLog(message: string, data?: unknown): void {
    if (DEBUG) {
        if (data) {
            console.log(`[GOLOGIN-DEBUG] ${message}`, data);
        } else {
            console.log(`[GOLOGIN-DEBUG] ${message}`);
        }
    }
}

/**
 * GoLogin profile information
 */
export interface GoLoginProfile {
    id: string;
    name: string;
    notes?: string;
    browserType?: string;
    os?: string;
    proxy?: {
        mode: string;
        host?: string;
        port?: number;
        username?: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Response when starting a profile
 * Contains the WebSocket endpoint for Puppeteer connection
 */
export interface GoLoginStartResponse {
    success: boolean;
    /** WebSocket endpoint for Puppeteer connection */
    wsEndpoint: string;
    /** Port for the browser debugging */
    port?: number;
    error?: string;
}

/**
 * Response for profile status check
 */
export interface GoLoginProfileStatusResponse {
    success: boolean;
    profile: GoLoginProfile | null;
    isRunning: boolean;
    wsEndpoint?: string;
    error?: string;
}

/**
 * Response for listing profiles
 */
export interface GoLoginProfileListResponse {
    success: boolean;
    profiles: GoLoginProfile[];
    total: number;
}

/**
 * GoLogin SDK instance type
 */
interface GoLoginSDKInstance {
    start: () => Promise<{ status: string; wsUrl: string }>;
    stop: () => Promise<void>;
}

/**
 * GoLogin API Client
 * 
 * Uses the official 'gologin' npm package for browser automation.
 * The SDK downloads and runs a local Orbita browser with the profile's
 * anti-detect fingerprint, providing a WebSocket endpoint for Puppeteer.
 * 
 * Cloud API methods are kept for profile management and status checks.
 */
export class GoLoginClient {
    private apiToken: string;
    private profileId: string | null;
    private runningProfiles: Map<string, { wsEndpoint: string; glInstance: GoLoginSDKInstance }> = new Map();

    /**
     * Create a new GoLogin client
     * 
     * @param apiToken - API token (defaults to env var)
     * @param profileId - Profile ID to use (defaults to env var)
     */
    constructor(apiToken?: string, profileId?: string) {
        this.apiToken = apiToken || process.env.GOLOGIN_API_TOKEN || '';
        this.profileId = profileId || process.env.GOLOGIN_PROFILE_ID || null;
        
        if (this.apiToken) {
            console.log(`[GOLOGIN-CLIENT] Initialized with API token`);
        } else {
            console.warn(`[GOLOGIN-CLIENT] No API token configured`);
        }
        
        if (this.profileId) {
            console.log(`[GOLOGIN-CLIENT] Using profile ID: ${this.profileId}`);
        }
    }

    /**
     * Get authorization headers for API requests
     */
    private getHeaders(): HeadersInit {
        return {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Check if GoLogin API is available and configured
     * 
     * @returns true if GoLogin API is accessible
     */
    async isAvailable(): Promise<boolean> {
        if (!this.apiToken) {
            console.error('[GOLOGIN-CLIENT] No API token configured');
            return false;
        }

        try {
            const response = await fetch(`${GOLOGIN_API_URL}/browser/v2`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(10000)
            });
            return response.ok;
        } catch (error) {
            console.error('[GOLOGIN-CLIENT] GoLogin API is not available:', error);
            return false;
        }
    }

    /**
     * List all browser profiles
     * 
     * @returns List of profiles
     */
    async listProfiles(): Promise<GoLoginProfileListResponse> {
        try {
            const response = await fetch(`${GOLOGIN_API_URL}/browser/v2`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            const profiles = Array.isArray(data.profiles) ? data.profiles : (Array.isArray(data) ? data : []);
            
            return {
                success: true,
                profiles: profiles.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    notes: p.notes,
                    browserType: p.browserType,
                    os: p.os,
                    proxy: p.proxy,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt
                })),
                total: profiles.length
            };
        } catch (error) {
            console.error('[GOLOGIN-CLIENT] Error listing profiles:', error);
            return {
                success: false,
                profiles: [],
                total: 0
            };
        }
    }

    /**
     * Get a specific profile by ID
     * 
     * @param profileId - Profile ID to fetch
     * @returns Profile information
     */
    async getProfile(profileId?: string): Promise<GoLoginProfile | null> {
        const id = profileId || this.profileId;
        if (!id) {
            throw new Error('Profile ID is required');
        }

        try {
            const url = `${GOLOGIN_API_URL}/browser/${id}`;
            debugLog(`GET ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders()
            });

            debugLog(`Response status: ${response.status}`);

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            debugLog('Profile data:', data);
            
            return {
                id: data.id,
                name: data.name,
                notes: data.notes,
                browserType: data.browserType,
                os: data.os,
                proxy: data.proxy,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            };
        } catch (error) {
            console.error(`[GOLOGIN-CLIENT] Error getting profile ${id}:`, error);
            return null;
        }
    }

    /**
     * Start a browser profile using the official GoLogin SDK
     * 
     * This launches a local Orbita browser with the profile's anti-detect
     * fingerprint and returns a WebSocket endpoint for Puppeteer connection.
     * 
     * @param profileId - Profile ID to start (uses default if not provided)
     * @returns Start response with WebSocket endpoint
     */
    async startProfile(profileId?: string): Promise<GoLoginStartResponse> {
        const id = profileId || this.profileId;
        if (!id) {
            return {
                success: false,
                wsEndpoint: '',
                error: 'Profile ID is required. Set GOLOGIN_PROFILE_ID environment variable.'
            };
        }

        // Check if already running
        const existing = this.runningProfiles.get(id);
        if (existing) {
            console.log(`[GOLOGIN-CLIENT] Profile ${id} already running`);
            return {
                success: true,
                wsEndpoint: existing.wsEndpoint
            };
        }

        try {
            console.log(`[GOLOGIN-CLIENT] Starting profile: ${id} using GoLogin SDK`);
            
            // Create GoLogin SDK instance
            const GL = new GoLogin({
                token: this.apiToken,
                profile_id: id,
                // Upload cookies to server after stopping (preserves session)
                uploadCookiesToServer: true,
                // Import cookies from server on start
                writeCookesFromServer: true,
            });

            debugLog('GoLogin SDK instance created');

            // Start the browser profile
            const { status, wsUrl } = await GL.start();
            
            debugLog(`Start result - status: ${status}, wsUrl: ${wsUrl}`);

            if (status !== 'success' || !wsUrl) {
                throw new Error(`Failed to start profile: status=${status}`);
            }

            // Store the running instance
            this.runningProfiles.set(id, { 
                wsEndpoint: wsUrl, 
                glInstance: GL 
            });

            console.log(`[GOLOGIN-CLIENT] Profile started successfully`);
            console.log(`[GOLOGIN-CLIENT] WebSocket endpoint: ${wsUrl}`);

            return {
                success: true,
                wsEndpoint: wsUrl
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[GOLOGIN-CLIENT] Error starting profile ${id}:`, errorMessage);
            return {
                success: false,
                wsEndpoint: '',
                error: errorMessage
            };
        }
    }

    /**
     * Stop a running browser profile
     * 
     * @param profileId - Profile ID to stop (uses default if not provided)
     * @returns Success status
     */
    async stopProfile(profileId?: string): Promise<{ success: boolean; error?: string }> {
        const id = profileId || this.profileId;
        if (!id) {
            return {
                success: false,
                error: 'Profile ID is required'
            };
        }

        const running = this.runningProfiles.get(id);
        if (!running) {
            console.log(`[GOLOGIN-CLIENT] Profile ${id} is not running (no cached instance)`);
            return { success: true };
        }

        try {
            console.log(`[GOLOGIN-CLIENT] Stopping profile: ${id}`);
            
            // Stop using the SDK instance
            await running.glInstance.stop();
            
            // Remove from running profiles cache
            this.runningProfiles.delete(id);

            console.log(`[GOLOGIN-CLIENT] Profile stopped successfully`);
            
            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[GOLOGIN-CLIENT] Error stopping profile ${id}:`, errorMessage);
            // Still remove from cache even on error
            this.runningProfiles.delete(id);
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Check if a profile is currently running
     * 
     * @param profileId - Profile ID to check (uses default if not provided)
     * @returns Status response with running state
     */
    async getProfileStatus(profileId?: string): Promise<GoLoginProfileStatusResponse> {
        const id = profileId || this.profileId;
        if (!id) {
            return {
                success: false,
                profile: null,
                isRunning: false,
                error: 'Profile ID is required'
            };
        }

        try {
            // Get profile info
            const profile = await this.getProfile(id);
            if (!profile) {
                return {
                    success: false,
                    profile: null,
                    isRunning: false,
                    error: 'Profile not found'
                };
            }

            // Check running status from cache
            const cached = this.runningProfiles.get(id);
            if (cached) {
                return {
                    success: true,
                    profile,
                    isRunning: true,
                    wsEndpoint: cached.wsEndpoint
                };
            }

            return {
                success: true,
                profile,
                isRunning: false
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[GOLOGIN-CLIENT] Error getting profile status:`, errorMessage);
            return {
                success: false,
                profile: null,
                isRunning: false,
                error: errorMessage
            };
        }
    }

    /**
     * Get the WebSocket endpoint for an already running profile
     * 
     * @param profileId - Profile ID (uses default if not provided)
     * @returns WebSocket endpoint or null if not running
     */
    async getRunningProfileEndpoint(profileId?: string): Promise<string | null> {
        const id = profileId || this.profileId || undefined;
        
        // Check cache
        const cached = this.runningProfiles.get(id || '');
        if (cached) {
            return cached.wsEndpoint;
        }

        return null;
    }

    /**
     * Start profile and get WebSocket endpoint, or get existing endpoint if already running
     * 
     * This is the main method to use for automation - it handles both
     * starting a new profile and reconnecting to an existing one.
     * 
     * @param profileId - Profile ID (uses default if not provided)
     * @returns WebSocket endpoint for Puppeteer connection
     */
    async ensureProfileRunning(profileId?: string): Promise<string> {
        const id = profileId || this.profileId || undefined;
        
        // First check if already running
        const existingEndpoint = await this.getRunningProfileEndpoint(id);
        if (existingEndpoint) {
            console.log('[GOLOGIN-CLIENT] Profile already running, reusing connection');
            return existingEndpoint;
        }

        // Start the profile
        const startResult = await this.startProfile(id);
        if (!startResult.success || !startResult.wsEndpoint) {
            throw new Error(startResult.error || 'Failed to start profile');
        }

        return startResult.wsEndpoint;
    }

    /**
     * Set the default profile ID
     * 
     * @param profileId - Profile ID to use as default
     */
    setProfileId(profileId: string): void {
        this.profileId = profileId;
        console.log(`[GOLOGIN-CLIENT] Default profile ID set to: ${profileId}`);
    }

    /**
     * Get the current default profile ID
     */
    getProfileId(): string | null {
        return this.profileId;
    }

    /**
     * Check if API token is configured
     */
    isConfigured(): boolean {
        return !!this.apiToken && !!this.profileId;
    }

    /**
     * Check if API token is set (profile may come from database)
     */
    hasApiToken(): boolean {
        return !!this.apiToken;
    }

    /**
     * Validate configuration and return diagnostic info
     */
    async validateConfiguration(): Promise<{
        valid: boolean;
        apiTokenValid: boolean;
        profileConfigured: boolean;
        profileExists: boolean;
        canListProfiles: boolean;
        errors: string[];
        warnings: string[];
        suggestions: string[];
        profileInfo?: { id: string; name: string; hasProxy: boolean };
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];
        let apiTokenValid = false;
        let canListProfiles = false;
        let profileExists = false;
        let profileInfo: { id: string; name: string; hasProxy: boolean } | undefined;

        // Check API token
        if (!this.apiToken) {
            errors.push('GOLOGIN_API_TOKEN is not set');
            suggestions.push('Get your API token from GoLogin Settings → API');
        } else {
            // Test API access
            try {
                const available = await this.isAvailable();
                apiTokenValid = available;
                canListProfiles = available;
                if (!available) {
                    errors.push('API token is invalid or GoLogin API is unreachable');
                    suggestions.push('Verify your API token and GoLogin subscription');
                }
            } catch {
                errors.push('Failed to connect to GoLogin API');
            }
        }

        // Check profile
        const profileConfigured = !!this.profileId;
        if (!profileConfigured) {
            warnings.push('GOLOGIN_PROFILE_ID is not set');
            suggestions.push('Set profile ID or use database profile assignments');
        } else if (canListProfiles) {
            const profiles = await this.listProfiles();
            const profile = profiles.profiles.find(p => p.id === this.profileId);
            if (profile) {
                profileExists = true;
                profileInfo = {
                    id: profile.id,
                    name: profile.name,
                    hasProxy: !!(profile.proxy && profile.proxy.mode !== 'none')
                };
                if (!profileInfo.hasProxy) {
                    warnings.push('Profile has no proxy - recommended for anti-detection');
                }
            } else {
                errors.push(`Profile ${this.profileId} not found`);
                const ids = profiles.profiles.map(p => p.id).join(', ');
                suggestions.push(`Available profiles: ${ids || 'none'}`);
            }
        }

        return {
            valid: errors.length === 0,
            apiTokenValid,
            profileConfigured,
            profileExists,
            canListProfiles,
            errors,
            warnings,
            suggestions,
            profileInfo
        };
    }

    /**
     * Get diagnostic report as formatted string
     */
    async getDiagnosticReport(): Promise<string> {
        const v = await this.validateConfiguration();
        const lines = [
            '=== GoLogin Diagnostic Report ===',
            `API Token: ${this.apiToken ? 'SET' : 'NOT SET'}`,
            `API Valid: ${v.apiTokenValid ? 'Yes' : 'No'}`,
            `Profile ID: ${this.profileId || 'NOT SET'}`,
            `Profile Exists: ${v.profileExists ? 'Yes' : 'No'}`,
            `SDK: Using official gologin npm package`,
        ];
        if (v.profileInfo) {
            lines.push(`Profile Name: ${v.profileInfo.name}`);
            lines.push(`Has Proxy: ${v.profileInfo.hasProxy ? 'Yes' : 'No'}`);
        }
        if (v.errors.length) {
            lines.push('', 'ERRORS:', ...v.errors.map(e => `  - ${e}`));
        }
        if (v.warnings.length) {
            lines.push('', 'WARNINGS:', ...v.warnings.map(w => `  - ${w}`));
        }
        if (v.suggestions.length) {
            lines.push('', 'SUGGESTIONS:', ...v.suggestions.map(s => `  - ${s}`));
        }
        lines.push('=================================');
        return lines.join('\n');
    }

    /**
     * Start cloud browser (for manual/visual access)
     * This uses the cloud API endpoint, not the SDK
     * 
     * @param profileId - Profile ID to start
     * @returns Cloud browser URL
     */
    async startCloudBrowser(profileId?: string): Promise<{ success: boolean; url?: string; error?: string }> {
        const id = profileId || this.profileId;
        if (!id) {
            return { success: false, error: 'Profile ID is required' };
        }

        try {
            const response = await fetch(`${GOLOGIN_API_URL}/browser/${id}/web`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({})
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            if (data.remoteOrbitaUrl) {
                return { success: true, url: data.remoteOrbitaUrl };
            }

            return { success: false, error: 'No cloud browser URL in response' };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return { success: false, error: errorMessage };
        }
    }
}

// Export singleton instance for convenience
export const goLoginClient = new GoLoginClient();
