/**
 * Dolphin Anty API Client
 * 
 * This module provides a TypeScript client for interacting with the Dolphin Anty
 * local API. Dolphin Anty must be running on the local machine for this client to work.
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
 * API DOCUMENTATION:
 * @see https://help.dolphin-anty.com/en/
 * @see docs/DOLPHIN_ANTY_SETUP.md for setup instructions
 */

/** Default Dolphin Anty local API URL */
const DEFAULT_API_URL = 'http://localhost:3001';

/**
 * Dolphin Anty profile information
 */
export interface DolphinProfile {
    id: string;
    name: string;
    status: 'stopped' | 'running' | 'error';
    notes?: string;
    tags?: string[];
    proxy?: {
        type: string;
        host: string;
        port: number;
    };
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Response when starting a profile
 * Contains the WebSocket endpoint for Puppeteer connection
 */
export interface ProfileStartResponse {
    success: boolean;
    automation: {
        /** WebSocket endpoint for Puppeteer connection */
        wsEndpoint: string;
        /** Port for the browser debugging */
        port: number;
    };
    profile?: DolphinProfile;
    error?: string;
}

/**
 * Response for profile status check
 */
export interface ProfileStatusResponse {
    success: boolean;
    profile: DolphinProfile;
    isRunning: boolean;
    wsEndpoint?: string;
    error?: string;
}

/**
 * Response for listing profiles
 */
export interface ProfileListResponse {
    success: boolean;
    data: DolphinProfile[];
    total: number;
}

/**
 * Dolphin Anty API Client
 * 
 * Provides methods to interact with Dolphin Anty's local API for
 * managing browser profiles and obtaining WebSocket endpoints for
 * Puppeteer automation.
 */
export class DolphinAntyClient {
    private apiUrl: string;
    private profileId: string | null;

    /**
     * Create a new Dolphin Anty client
     * 
     * @param apiUrl - API base URL (defaults to env var or localhost:3001)
     * @param profileId - Profile ID to use (defaults to env var)
     */
    constructor(apiUrl?: string, profileId?: string) {
        this.apiUrl = apiUrl || process.env.DOLPHIN_ANTY_API_URL || DEFAULT_API_URL;
        this.profileId = profileId || process.env.DOLPHIN_ANTY_PROFILE_ID || null;
        
        console.log(`[DOLPHIN-CLIENT] Initialized with API URL: ${this.apiUrl}`);
        if (this.profileId) {
            console.log(`[DOLPHIN-CLIENT] Using profile ID: ${this.profileId}`);
        }
    }

    /**
     * Check if Dolphin Anty is running and accessible
     * 
     * @returns true if Dolphin Anty API is accessible
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.apiUrl}/browser_profiles`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch (error) {
            console.error('[DOLPHIN-CLIENT] Dolphin Anty is not available:', error);
            return false;
        }
    }

    /**
     * List all browser profiles
     * 
     * @param page - Page number (default: 1)
     * @param limit - Items per page (default: 50)
     * @returns List of profiles
     */
    async listProfiles(page: number = 1, limit: number = 50): Promise<ProfileListResponse> {
        try {
            const response = await fetch(
                `${this.apiUrl}/browser_profiles?page=${page}&limit=${limit}`,
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            return {
                success: true,
                data: data.data || [],
                total: data.total || 0
            };
        } catch (error) {
            console.error('[DOLPHIN-CLIENT] Error listing profiles:', error);
            return {
                success: false,
                data: [],
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
    async getProfile(profileId?: string): Promise<DolphinProfile | null> {
        const id = profileId || this.profileId;
        if (!id) {
            throw new Error('Profile ID is required');
        }

        try {
            const response = await fetch(`${this.apiUrl}/browser_profiles/${id}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            return data.data || null;
        } catch (error) {
            console.error(`[DOLPHIN-CLIENT] Error getting profile ${id}:`, error);
            return null;
        }
    }

    /**
     * Start a browser profile
     * 
     * This launches the browser profile in Dolphin Anty and returns
     * the WebSocket endpoint for Puppeteer connection.
     * 
     * @param profileId - Profile ID to start (uses default if not provided)
     * @returns Start response with WebSocket endpoint
     */
    async startProfile(profileId?: string): Promise<ProfileStartResponse> {
        const id = profileId || this.profileId;
        if (!id) {
            return {
                success: false,
                automation: { wsEndpoint: '', port: 0 },
                error: 'Profile ID is required. Set DOLPHIN_ANTY_PROFILE_ID environment variable.'
            };
        }

        try {
            console.log(`[DOLPHIN-CLIENT] Starting profile: ${id}`);
            
            const response = await fetch(`${this.apiUrl}/browser_profiles/${id}/start?automation=1`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            if (data.success === false || data.error) {
                return {
                    success: false,
                    automation: { wsEndpoint: '', port: 0 },
                    error: data.error || 'Unknown error starting profile'
                };
            }

            // Extract WebSocket endpoint from response
            const wsEndpoint = data.automation?.wsEndpoint || data.wsEndpoint || '';
            const port = data.automation?.port || data.port || 0;

            console.log(`[DOLPHIN-CLIENT] Profile started successfully`);
            console.log(`[DOLPHIN-CLIENT] WebSocket endpoint: ${wsEndpoint}`);

            return {
                success: true,
                automation: { wsEndpoint, port }
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[DOLPHIN-CLIENT] Error starting profile ${id}:`, errorMessage);
            return {
                success: false,
                automation: { wsEndpoint: '', port: 0 },
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
            console.log(`[DOLPHIN-CLIENT] Stopping profile: ${id}`);
            
            const response = await fetch(`${this.apiUrl}/browser_profiles/${id}/stop`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            console.log(`[DOLPHIN-CLIENT] Profile stopped successfully`);
            
            return {
                success: data.success !== false
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[DOLPHIN-CLIENT] Error stopping profile ${id}:`, errorMessage);
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
    async getProfileStatus(profileId?: string): Promise<ProfileStatusResponse> {
        const id = profileId || this.profileId;
        if (!id) {
            return {
                success: false,
                profile: { id: '', name: '', status: 'stopped' },
                isRunning: false,
                error: 'Profile ID is required'
            };
        }

        try {
            // First get the profile info
            const profile = await this.getProfile(id);
            if (!profile) {
                return {
                    success: false,
                    profile: { id, name: 'Unknown', status: 'stopped' },
                    isRunning: false,
                    error: 'Profile not found'
                };
            }

            // Check if it's running by trying to get active browsers
            const activeResponse = await fetch(`${this.apiUrl}/browser_profiles/active`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            let isRunning = false;
            let wsEndpoint: string | undefined;

            if (activeResponse.ok) {
                const activeData = await activeResponse.json();
                const activeProfile = activeData.data?.find((p: any) => p.id === id);
                if (activeProfile) {
                    isRunning = true;
                    wsEndpoint = activeProfile.wsEndpoint || activeProfile.automation?.wsEndpoint;
                }
            }

            return {
                success: true,
                profile: { ...profile, status: isRunning ? 'running' : 'stopped' },
                isRunning,
                wsEndpoint
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[DOLPHIN-CLIENT] Error getting profile status:`, errorMessage);
            return {
                success: false,
                profile: { id: id || '', name: 'Unknown', status: 'error' },
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
        const status = await this.getProfileStatus(profileId);
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
            console.log('[DOLPHIN-CLIENT] Profile already running, reusing connection');
            return existingEndpoint;
        }

        // Start the profile
        const startResult = await this.startProfile(id);
        if (!startResult.success || !startResult.automation.wsEndpoint) {
            throw new Error(startResult.error || 'Failed to start profile');
        }

        return startResult.automation.wsEndpoint;
    }

    /**
     * Set the default profile ID
     * 
     * @param profileId - Profile ID to use as default
     */
    setProfileId(profileId: string): void {
        this.profileId = profileId;
        console.log(`[DOLPHIN-CLIENT] Default profile ID set to: ${profileId}`);
    }

    /**
     * Get the current default profile ID
     */
    getProfileId(): string | null {
        return this.profileId;
    }
}

// Export singleton instance for convenience
export const dolphinAntyClient = new DolphinAntyClient();


