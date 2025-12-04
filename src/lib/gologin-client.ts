/**
 * GoLogin API Client
 * 
 * This module provides a TypeScript client for interacting with the GoLogin
 * cloud API. GoLogin is a cloud-based anti-detect browser service.
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
 * API DOCUMENTATION:
 * @see https://docs.gologin.com/
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

/** GoLogin API base URL */
const GOLOGIN_API_URL = 'https://api.gologin.com';

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
 * GoLogin API Client
 * 
 * Provides methods to interact with GoLogin's cloud API for
 * managing browser profiles and obtaining WebSocket endpoints for
 * Puppeteer automation.
 * 
 * ADVANTAGES OVER DOLPHIN ANTY:
 * - Cloud-based: No local installation needed
 * - Web dashboard: Easy team access for manual browser operations
 * - API-first: Designed for automation
 * - Simpler setup: Just API token, no VNC required
 */
export class GoLoginClient {
    private apiToken: string;
    private profileId: string | null;
    private runningProfiles: Map<string, { wsEndpoint: string; pid?: number }> = new Map();

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
            
            // Debug: Log the full response to understand structure
            console.log('[GOLOGIN-CLIENT] Raw API response:', JSON.stringify(data, null, 2));
            
            // Handle different response structures
            let profiles: any[] = [];
            if (Array.isArray(data.profiles)) {
                profiles = data.profiles;
            } else if (Array.isArray(data)) {
                profiles = data;
            } else if (data.data && Array.isArray(data.data)) {
                profiles = data.data;
            } else if (data.results && Array.isArray(data.results)) {
                profiles = data.results;
            }
            
            console.log(`[GOLOGIN-CLIENT] Found ${profiles.length} profiles`);
            
            return {
                success: true,
                profiles: profiles.map((p: any) => ({
                    id: p.id || p.profileId,
                    name: p.name || p.profileName || 'Unnamed Profile',
                    notes: p.notes || p.description,
                    browserType: p.browserType || p.browser_type,
                    os: p.os || p.operatingSystem,
                    proxy: p.proxy,
                    createdAt: p.createdAt || p.created_at,
                    updatedAt: p.updatedAt || p.updated_at,
                    // Include all fields for debugging
                    _raw: p
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
            const response = await fetch(`${GOLOGIN_API_URL}/browser/v2/${id}`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
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
     * Start a browser profile
     * 
     * This launches the browser profile via GoLogin cloud and returns
     * the WebSocket endpoint for Puppeteer connection.
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
            console.log(`[GOLOGIN-CLIENT] Starting profile: ${id}`);
            
            // First verify the profile exists in the account
            const profileCheck = await this.getProfile(id);
            if (!profileCheck) {
                // Profile not found - list available profiles for debugging
                const allProfiles = await this.listProfiles();
                console.error(`[GOLOGIN-CLIENT] Profile ${id} not found in account!`);
                console.error(`[GOLOGIN-CLIENT] Available profiles: ${JSON.stringify(allProfiles.profiles.map(p => ({ id: p.id, name: p.name })))}`);
                return {
                    success: false,
                    wsEndpoint: '',
                    error: `Profile ${id} not found in your GoLogin account. Please verify the profile ID.`
                };
            }
            
            console.log(`[GOLOGIN-CLIENT] Profile found: ${profileCheck.name}`);
            
            // Start the profile via GoLogin API (Note: start endpoint does NOT use v2)
            const response = await fetch(`${GOLOGIN_API_URL}/browser/${id}/start`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    // Request remote browser (cloud-based)
                    isRemote: true,
                    // Sync settings
                    sync: true
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            // GoLogin returns wsEndpoint directly for remote browsers
            const wsEndpoint = data.wsEndpoint || data.ws || '';
            
            if (!wsEndpoint) {
                // Try alternative: Get remote debugging URL
                const statusResponse = await fetch(`${GOLOGIN_API_URL}/browser/${id}/status`, {
                    method: 'GET',
                    headers: this.getHeaders()
                });
                
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    if (statusData.wsEndpoint) {
                        this.runningProfiles.set(id, { wsEndpoint: statusData.wsEndpoint });
                        console.log(`[GOLOGIN-CLIENT] Profile started successfully`);
                        console.log(`[GOLOGIN-CLIENT] WebSocket endpoint: ${statusData.wsEndpoint}`);
                        return {
                            success: true,
                            wsEndpoint: statusData.wsEndpoint
                        };
                    }
                }
                
                throw new Error('Failed to get WebSocket endpoint from GoLogin');
            }

            this.runningProfiles.set(id, { wsEndpoint });
            console.log(`[GOLOGIN-CLIENT] Profile started successfully`);
            console.log(`[GOLOGIN-CLIENT] WebSocket endpoint: ${wsEndpoint}`);

            return {
                success: true,
                wsEndpoint
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

        try {
            console.log(`[GOLOGIN-CLIENT] Stopping profile: ${id}`);
            
            // Note: stop endpoint does NOT use v2
            const response = await fetch(`${GOLOGIN_API_URL}/browser/${id}/stop`, {
                method: 'POST',
                headers: this.getHeaders()
            });

            // Remove from running profiles cache
            this.runningProfiles.delete(id);

            if (!response.ok && response.status !== 404) {
                throw new Error(`HTTP error: ${response.status}`);
            }

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

            // Check running status
            const cached = this.runningProfiles.get(id);
            if (cached) {
                return {
                    success: true,
                    profile,
                    isRunning: true,
                    wsEndpoint: cached.wsEndpoint
                };
            }

            // Check via API
            try {
                const statusResponse = await fetch(`${GOLOGIN_API_URL}/browser/${id}/status`, {
                    method: 'GET',
                    headers: this.getHeaders()
                });

                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    const isRunning = statusData.status === 'running' || !!statusData.wsEndpoint;
                    
                    if (isRunning && statusData.wsEndpoint) {
                        this.runningProfiles.set(id, { wsEndpoint: statusData.wsEndpoint });
                    }

                    return {
                        success: true,
                        profile,
                        isRunning,
                        wsEndpoint: statusData.wsEndpoint
                    };
                }
            } catch {
                // Status endpoint might not exist or profile not running
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
        
        // Check cache first
        const cached = this.runningProfiles.get(id || '');
        if (cached) {
            return cached.wsEndpoint;
        }

        const status = await this.getProfileStatus(id);
        return status.isRunning ? (status.wsEndpoint || null) : null;
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
}

// Export singleton instance for convenience
export const goLoginClient = new GoLoginClient();

