/**
 * GoLogin API Client
 * 
 * This module provides a TypeScript client for interacting with the GoLogin
 * cloud API. GoLogin is a cloud-based anti-detect browser service.
 * 
 * PREREQUISITES:
 * 1. GoLogin account with API access (Professional plan or higher)
 * 2. Browser profile created in GoLogin dashboard
 * 3. Apollo.io logged in manually via GoLogin browser
 * 4. Cookies/session saved in the profile
 * 5. Proxy configured in the profile (recommended: residential proxy)
 * 
 * ENVIRONMENT VARIABLES:
 * - GOLOGIN_API_TOKEN: API token from GoLogin dashboard (Settings → API)
 * - GOLOGIN_PROFILE_ID: Profile ID to use for scraping
 * 
 * IMPORTANT SETUP STEPS:
 * 1. Create profile in GoLogin dashboard
 * 2. Run the profile manually and log into Apollo.io
 * 3. Close the browser (this saves cookies)
 * 4. Use the API to automate scraping
 * 
 * API DOCUMENTATION:
 * @see https://gologin.com/docs/api-reference/introduction/quickstart
 * @see docs/GOLOGIN_SETUP.md for setup instructions
 */

/** GoLogin API base URL */
const GOLOGIN_API_URL = 'https://api.gologin.com';

/** Debug mode for verbose API logging */
const DEBUG_API = process.env.GOLOGIN_DEBUG === 'true';

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
     * Extract WebSocket endpoint from various response formats
     * GoLogin API may return the endpoint in different structures
     */
    private extractWsEndpoint(data: any): string | null {
        // Direct properties (most common)
        if (data.wsEndpoint) return data.wsEndpoint;
        if (data.ws) return data.ws;
        if (data.wsUrl) return data.wsUrl;
        if (data.browserWSEndpoint) return data.browserWSEndpoint;
        
        // Nested in 'browser' object
        if (data.browser?.wsEndpoint) return data.browser.wsEndpoint;
        if (data.browser?.ws) return data.browser.ws;
        
        // Nested in 'data' object
        if (data.data?.wsEndpoint) return data.data.wsEndpoint;
        if (data.data?.ws) return data.data.ws;
        
        // Check for port-based WebSocket URL construction
        if (data.port && data.host) {
            return `ws://${data.host}:${data.port}/devtools/browser`;
        }
        if (data.remoteDebuggingPort) {
            const host = data.host || data.remoteDebuggingAddress || 'localhost';
            return `ws://${host}:${data.remoteDebuggingPort}/devtools/browser`;
        }
        
        return null;
    }

    /**
     * Start a browser profile
     * 
     * This launches the browser profile via GoLogin cloud and returns
     * the WebSocket endpoint for Puppeteer connection.
     * 
     * IMPORTANT: Before using this method, ensure:
     * 1. The profile exists in your GoLogin account
     * 2. You have manually logged into Apollo using the GoLogin browser
     * 3. The session/cookies are saved in the profile
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
                error: 'Profile ID is required. Set GOLOGIN_PROFILE_ID environment variable or pass profileId parameter.'
            };
        }

        // Check if already running
        const existing = this.runningProfiles.get(id);
        if (existing) {
            console.log(`[GOLOGIN-CLIENT] Profile ${id} already running, reusing cached endpoint`);
            return {
                success: true,
                wsEndpoint: existing.wsEndpoint
            };
        }

        try {
            console.log(`[GOLOGIN-CLIENT] ========================================`);
            console.log(`[GOLOGIN-CLIENT] Starting profile: ${id}`);
            console.log(`[GOLOGIN-CLIENT] API URL: ${GOLOGIN_API_URL}`);
            console.log(`[GOLOGIN-CLIENT] Token configured: ${this.apiToken ? 'Yes (length: ' + this.apiToken.length + ')' : 'No'}`);
            
            // Step 1: Verify the profile exists
            console.log(`[GOLOGIN-CLIENT] Step 1: Verifying profile exists...`);
            const allProfiles = await this.listProfiles();
            
            if (!allProfiles.success) {
                return {
                    success: false,
                    wsEndpoint: '',
                    error: 'Failed to list profiles. Check your API token is valid and your GoLogin subscription is active.'
                };
            }
            
            const foundProfile = allProfiles.profiles.find(p => p.id === id);
            
            if (!foundProfile) {
                const availableIds = allProfiles.profiles.map(p => p.id);
                const availableNames = allProfiles.profiles.map(p => `${p.name} (${p.id})`);
                
                console.error(`[GOLOGIN-CLIENT] Profile ${id} not found in account!`);
                console.error(`[GOLOGIN-CLIENT] Total profiles found: ${allProfiles.profiles.length}`);
                if (allProfiles.profiles.length > 0) {
                    console.error(`[GOLOGIN-CLIENT] Available profiles:`);
                    availableNames.forEach(name => console.error(`  - ${name}`));
                }
                
                const suggestion = allProfiles.profiles.length > 0 
                    ? `Available profile IDs: ${availableIds.join(', ')}`
                    : 'No profiles found. Create a profile in GoLogin dashboard first.';
                
                return {
                    success: false,
                    wsEndpoint: '',
                    error: `Profile "${id}" not found in your GoLogin account. ${suggestion}`
                };
            }
            
            console.log(`[GOLOGIN-CLIENT] ✓ Profile found: ${foundProfile.name}`);
            
            // Step 2: Try to start the profile with different parameter combinations
            console.log(`[GOLOGIN-CLIENT] Step 2: Starting browser profile...`);
            
            // Try multiple request formats - GoLogin API might expect different parameters
            const startStrategies = [
                // Strategy 1: No body (simple POST)
                { body: undefined, description: 'no body' },
                // Strategy 2: isRemote only
                { body: JSON.stringify({ isRemote: true }), description: 'isRemote: true' },
                // Strategy 3: isRemote with sync (current approach)
                { body: JSON.stringify({ isRemote: true, sync: true }), description: 'isRemote + sync' },
                // Strategy 4: isCloud format (alternative naming)
                { body: JSON.stringify({ isCloud: true }), description: 'isCloud: true' },
            ];
            
            let lastError = '';
            let responseData: any = null;
            
            for (const strategy of startStrategies) {
                try {
                    console.log(`[GOLOGIN-CLIENT] Trying start with ${strategy.description}...`);
                    
                    const startUrl = `${GOLOGIN_API_URL}/browser/${id}/start`;
                    if (DEBUG_API) {
                        console.log(`[GOLOGIN-CLIENT] POST ${startUrl}`);
                        console.log(`[GOLOGIN-CLIENT] Body: ${strategy.body || '(empty)'}`);
                    }
                    
                    const fetchOptions: RequestInit = {
                        method: 'POST',
                        headers: this.getHeaders(),
                    };
                    
                    if (strategy.body) {
                        fetchOptions.body = strategy.body;
                    }
                    
                    const response = await fetch(startUrl, fetchOptions);
                    const responseText = await response.text();
                    
                    if (DEBUG_API) {
                        console.log(`[GOLOGIN-CLIENT] Response status: ${response.status}`);
                        console.log(`[GOLOGIN-CLIENT] Response body: ${responseText.substring(0, 500)}`);
                    }
                    
                    if (!response.ok) {
                        lastError = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
                        console.log(`[GOLOGIN-CLIENT] Strategy "${strategy.description}" failed: ${lastError}`);
                        continue;
                    }
                    
                    // Parse response
                    try {
                        responseData = JSON.parse(responseText);
                        console.log(`[GOLOGIN-CLIENT] ✓ Start request succeeded with "${strategy.description}"`);
                        if (DEBUG_API) {
                            console.log(`[GOLOGIN-CLIENT] Response data:`, JSON.stringify(responseData, null, 2));
                        }
                        break;
                    } catch (parseError) {
                        lastError = `Invalid JSON response: ${responseText.substring(0, 100)}`;
                        console.log(`[GOLOGIN-CLIENT] Strategy "${strategy.description}" returned invalid JSON`);
                        continue;
                    }
                } catch (fetchError) {
                    lastError = fetchError instanceof Error ? fetchError.message : 'Network error';
                    console.log(`[GOLOGIN-CLIENT] Strategy "${strategy.description}" network error: ${lastError}`);
                    continue;
                }
            }
            
            if (!responseData) {
                return {
                    success: false,
                    wsEndpoint: '',
                    error: `Failed to start profile after trying all strategies. Last error: ${lastError}. ` +
                           'Ensure your GoLogin subscription includes API access and the profile is not already running elsewhere.'
                };
            }
            
            // Step 3: Extract WebSocket endpoint from response
            console.log(`[GOLOGIN-CLIENT] Step 3: Extracting WebSocket endpoint...`);
            let wsEndpoint = this.extractWsEndpoint(responseData);
            
            if (!wsEndpoint) {
                console.log(`[GOLOGIN-CLIENT] WebSocket endpoint not in start response, checking status...`);
                
                // Wait a moment for the browser to fully start
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try to get WebSocket endpoint from status endpoint
                try {
                    const statusResponse = await fetch(`${GOLOGIN_API_URL}/browser/${id}/status`, {
                        method: 'GET',
                        headers: this.getHeaders()
                    });
                    
                    if (statusResponse.ok) {
                        const statusData = await statusResponse.json();
                        if (DEBUG_API) {
                            console.log(`[GOLOGIN-CLIENT] Status response:`, JSON.stringify(statusData, null, 2));
                        }
                        wsEndpoint = this.extractWsEndpoint(statusData);
                    }
                } catch (statusError) {
                    console.log(`[GOLOGIN-CLIENT] Could not get status: ${statusError}`);
                }
            }
            
            if (!wsEndpoint) {
                console.error(`[GOLOGIN-CLIENT] Failed to get WebSocket endpoint`);
                console.error(`[GOLOGIN-CLIENT] Start response was:`, JSON.stringify(responseData, null, 2));
                
                return {
                    success: false,
                    wsEndpoint: '',
                    error: 'Profile started but no WebSocket endpoint returned. ' +
                           'The GoLogin API response format may have changed. ' +
                           'Response keys: ' + Object.keys(responseData).join(', ') + '. ' +
                           'Please check GoLogin documentation or contact support.'
                };
            }

            // Success!
            this.runningProfiles.set(id, { wsEndpoint });
            console.log(`[GOLOGIN-CLIENT] ✓ Profile started successfully!`);
            console.log(`[GOLOGIN-CLIENT] ✓ WebSocket endpoint: ${wsEndpoint}`);
            console.log(`[GOLOGIN-CLIENT] ========================================`);

            return {
                success: true,
                wsEndpoint
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[GOLOGIN-CLIENT] ========================================`);
            console.error(`[GOLOGIN-CLIENT] ERROR starting profile ${id}:`);
            console.error(`[GOLOGIN-CLIENT] ${errorMessage}`);
            console.error(`[GOLOGIN-CLIENT] ========================================`);
            
            // Provide helpful suggestions based on error type
            let suggestion = '';
            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
                suggestion = ' Your API token may be invalid or expired. Get a new token from GoLogin Settings → API.';
            } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
                suggestion = ' Your GoLogin plan may not include API access. Upgrade to Professional or higher.';
            } else if (errorMessage.includes('404')) {
                suggestion = ' Profile not found. Verify the profile ID is correct.';
            } else if (errorMessage.includes('429')) {
                suggestion = ' Rate limited. Wait a moment and try again.';
            }
            
            return {
                success: false,
                wsEndpoint: '',
                error: errorMessage + suggestion
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

    /**
     * Check if only API token is configured (profile ID may come from database)
     */
    hasApiToken(): boolean {
        return !!this.apiToken;
    }

    /**
     * Validate the current configuration
     * 
     * Performs comprehensive checks to ensure GoLogin is ready for use.
     * Call this before attempting to scrape to get clear feedback on setup issues.
     * 
     * @returns Validation result with detailed status and suggestions
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
        profileInfo?: {
            id: string;
            name: string;
            hasProxy: boolean;
        };
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const suggestions: string[] = [];
        
        let apiTokenValid = false;
        let canListProfiles = false;
        let profileExists = false;
        let profileInfo: any = undefined;
        
        // Check 1: API token configured
        if (!this.apiToken) {
            errors.push('GOLOGIN_API_TOKEN environment variable is not set');
            suggestions.push('Get your API token from GoLogin dashboard: Settings → API');
        } else {
            // Check 2: API token is valid (can we reach the API?)
            try {
                const response = await fetch(`${GOLOGIN_API_URL}/browser/v2`, {
                    method: 'GET',
                    headers: this.getHeaders(),
                    signal: AbortSignal.timeout(10000)
                });
                
                if (response.ok) {
                    apiTokenValid = true;
                    canListProfiles = true;
                } else if (response.status === 401) {
                    errors.push('API token is invalid or expired');
                    suggestions.push('Generate a new API token in GoLogin Settings → API');
                } else if (response.status === 403) {
                    errors.push('API access is forbidden - subscription may not include API access');
                    suggestions.push('Upgrade to GoLogin Professional plan or higher for API access');
                } else {
                    warnings.push(`API returned unexpected status: ${response.status}`);
                }
            } catch (error) {
                errors.push('Cannot connect to GoLogin API');
                suggestions.push('Check your internet connection and try again');
            }
        }
        
        // Check 3: Profile ID configured
        const profileConfigured = !!this.profileId;
        if (!profileConfigured) {
            warnings.push('GOLOGIN_PROFILE_ID environment variable is not set');
            suggestions.push('Set GOLOGIN_PROFILE_ID or use database profile assignments');
        }
        
        // Check 4: Profile exists (if we can list profiles)
        if (canListProfiles && this.profileId) {
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
                    warnings.push('Profile has no proxy configured');
                    suggestions.push('Configure a residential proxy in the GoLogin profile for better anti-detection');
                }
            } else {
                errors.push(`Profile "${this.profileId}" not found in your account`);
                if (profiles.profiles.length > 0) {
                    suggestions.push(`Available profiles: ${profiles.profiles.map(p => `${p.name} (${p.id})`).join(', ')}`);
                } else {
                    suggestions.push('Create a profile in GoLogin dashboard and configure it with Apollo login');
                }
            }
        }
        
        // Add general setup reminders
        if (profileExists) {
            suggestions.push('Remember: You must manually log into Apollo.io using the GoLogin browser before automation will work');
            suggestions.push('After logging in, close the browser to save the session cookies');
        }
        
        const valid = apiTokenValid && (profileConfigured || true) && (profileExists || !profileConfigured);
        
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
     * Get a diagnostic report for troubleshooting
     * 
     * @returns Formatted diagnostic string
     */
    async getDiagnosticReport(): Promise<string> {
        const validation = await this.validateConfiguration();
        
        const lines: string[] = [
            '=== GoLogin Diagnostic Report ===',
            '',
            `API Token: ${this.apiToken ? `Configured (${this.apiToken.length} chars)` : 'NOT SET'}`,
            `API Token Valid: ${validation.apiTokenValid ? '✓ Yes' : '✗ No'}`,
            `Profile ID: ${this.profileId || 'NOT SET'}`,
            `Profile Exists: ${validation.profileExists ? '✓ Yes' : (validation.profileConfigured ? '✗ No' : 'N/A')}`,
            '',
        ];
        
        if (validation.profileInfo) {
            lines.push(`Profile Name: ${validation.profileInfo.name}`);
            lines.push(`Has Proxy: ${validation.profileInfo.hasProxy ? '✓ Yes' : '✗ No'}`);
            lines.push('');
        }
        
        if (validation.errors.length > 0) {
            lines.push('ERRORS:');
            validation.errors.forEach(e => lines.push(`  ✗ ${e}`));
            lines.push('');
        }
        
        if (validation.warnings.length > 0) {
            lines.push('WARNINGS:');
            validation.warnings.forEach(w => lines.push(`  ⚠ ${w}`));
            lines.push('');
        }
        
        if (validation.suggestions.length > 0) {
            lines.push('SUGGESTIONS:');
            validation.suggestions.forEach(s => lines.push(`  → ${s}`));
            lines.push('');
        }
        
        lines.push('=================================');
        
        return lines.join('\n');
    }
}

// Export singleton instance for convenience
export const goLoginClient = new GoLoginClient();

