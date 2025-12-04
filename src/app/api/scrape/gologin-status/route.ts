/**
 * GoLogin Status API Endpoint
 * 
 * This endpoint provides comprehensive status information about the GoLogin
 * browser configuration and profile health. Essential for:
 * - Monitoring if GoLogin is properly configured
 * - Checking profile connection status
 * - Debugging configuration issues
 * - Admin dashboard integration
 * - Testing connection before scraping
 * 
 * GET /api/scrape/gologin-status
 * Returns:
 * - GoLogin availability and API health
 * - Current scraper mode
 * - Profile status (if configured)
 * - Configuration validation with errors/warnings
 * - Diagnostic information
 * 
 * POST /api/scrape/gologin-status
 * Actions:
 * - start: Start the configured profile
 * - stop: Stop the configured profile
 * - restart: Restart the configured profile
 * - list: List all available profiles
 * - status: Get detailed profile status
 * - validate: Run full configuration validation
 * - test: Test browser connection
 * - diagnose: Get full diagnostic report
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { goLoginClient } from '@/lib/gologin-client';
import { getBrowserManagerForProfile } from '@/lib/browser-manager-gologin';
import { getScraperMode, getScraperStatus, validateScraperConfig } from '@/lib/scraper';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow longer timeout for connection tests

export async function GET() {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[GOLOGIN-STATUS] Fetching status...');

        // Get scraper status and configuration
        const scraperStatus = getScraperStatus();
        const configValidation = await validateScraperConfig();

        // Get GoLogin specific status
        const goLoginAvailable = await goLoginClient.isAvailable();
        
        let profileStatus = null;
        let profileList = null;
        let browserStatus = null;
        let configurationValidation = null;

        // Run detailed validation
        try {
            configurationValidation = await goLoginClient.validateConfiguration();
        } catch (validationError) {
            console.error('[GOLOGIN-STATUS] Validation error:', validationError);
        }

        if (goLoginAvailable) {
            // Get profile status if profile ID is configured
            const profileId = goLoginClient.getProfileId();
            if (profileId) {
                try {
                    const status = await goLoginClient.getProfileStatus(profileId);
                    profileStatus = {
                        id: profileId,
                        found: status.success && status.profile !== null,
                        isRunning: status.isRunning,
                        name: status.profile?.name || 'Unknown',
                        wsEndpoint: status.wsEndpoint || null,
                        hasProxy: !!(status.profile?.proxy && status.profile.proxy.mode !== 'none')
                    };
                } catch (statusError) {
                    console.error('[GOLOGIN-STATUS] Profile status error:', statusError);
                    profileStatus = {
                        id: profileId,
                        found: false,
                        isRunning: false,
                        error: statusError instanceof Error ? statusError.message : 'Failed to get status'
                    };
                }
            }

            // Get list of available profiles
            try {
                const profiles = await goLoginClient.listProfiles();
                if (profiles.success) {
                    profileList = profiles.profiles.map(p => ({
                        id: p.id,
                        name: p.name,
                        browserType: p.browserType
                    }));
                }
            } catch (listError) {
                console.error('[GOLOGIN-STATUS] List profiles error:', listError);
            }

            // Get browser manager status if in gologin mode and profile is configured
            if (scraperStatus.mode === 'gologin' && goLoginClient.getProfileId()) {
                try {
                    const manager = getBrowserManagerForProfile(goLoginClient.getProfileId()!);
                    browserStatus = await manager.getStatus();
                } catch (browserError) {
                    console.error('[GOLOGIN-STATUS] Browser status error:', browserError);
                }
            }
        }

        // Determine overall health status
        const health = {
            status: 'unknown' as 'healthy' | 'degraded' | 'unhealthy' | 'unknown',
            issues: [] as string[]
        };

        if (!process.env.GOLOGIN_API_TOKEN) {
            health.status = 'unhealthy';
            health.issues.push('GOLOGIN_API_TOKEN not configured');
        } else if (!goLoginAvailable) {
            health.status = 'unhealthy';
            health.issues.push('GoLogin API not available - check token validity');
        } else if (!process.env.GOLOGIN_PROFILE_ID) {
            health.status = 'degraded';
            health.issues.push('GOLOGIN_PROFILE_ID not set - using database assignments');
        } else if (profileStatus && !profileStatus.found) {
            health.status = 'unhealthy';
            health.issues.push('Configured profile not found');
        } else if (profileStatus && !profileStatus.hasProxy) {
            health.status = 'degraded';
            health.issues.push('Profile has no proxy configured - recommended for anti-detection');
        } else {
            health.status = 'healthy';
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            
            // Overall health
            health,
            
            // Scraper configuration
            scraper: {
                mode: scraperStatus.mode,
                modeSource: scraperStatus.modeSource,
                isGoLoginConfigured: scraperStatus.isGoLoginConfigured,
                isDolphinConfigured: scraperStatus.isDolphinConfigured
            },
            
            // Configuration validation
            configuration: {
                valid: configValidation.valid,
                warnings: configValidation.warnings,
                errors: configValidation.errors
            },
            
            // Detailed GoLogin validation
            validation: configurationValidation ? {
                valid: configurationValidation.valid,
                apiTokenValid: configurationValidation.apiTokenValid,
                profileConfigured: configurationValidation.profileConfigured,
                profileExists: configurationValidation.profileExists,
                errors: configurationValidation.errors,
                warnings: configurationValidation.warnings,
                suggestions: configurationValidation.suggestions
            } : null,
            
            // GoLogin status
            gologin: {
                available: goLoginAvailable,
                configured: goLoginClient.isConfigured(),
                hasApiToken: goLoginClient.hasApiToken(),
                profileId: goLoginClient.getProfileId(),
                profileStatus,
                profileList,
                profileCount: profileList?.length || 0,
                browserStatus
            },
            
            // Environment variables (masked for security)
            environment: {
                SCRAPER_MODE: process.env.SCRAPER_MODE || '(not set, defaults to local)',
                GOLOGIN_API_TOKEN: process.env.GOLOGIN_API_TOKEN 
                    ? `(configured, ${process.env.GOLOGIN_API_TOKEN.length} chars)` 
                    : '(not set)',
                GOLOGIN_PROFILE_ID: process.env.GOLOGIN_PROFILE_ID || '(not set)',
                GOLOGIN_DEBUG: process.env.GOLOGIN_DEBUG || 'false'
            },
            
            // Quick reference for next steps
            nextSteps: health.status !== 'healthy' ? getNextSteps(health.issues) : []
        });

    } catch (error) {
        console.error('[GOLOGIN-STATUS] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
            health: {
                status: 'unhealthy',
                issues: ['Status check failed: ' + (error instanceof Error ? error.message : 'Unknown error')]
            }
        }, { status: 500 });
    }
}

/**
 * Get actionable next steps based on issues
 */
function getNextSteps(issues: string[]): string[] {
    const steps: string[] = [];
    
    for (const issue of issues) {
        if (issue.includes('GOLOGIN_API_TOKEN')) {
            steps.push('Get your API token from GoLogin: Settings → API');
            steps.push('Add to environment: GOLOGIN_API_TOKEN=your-token');
        } else if (issue.includes('API not available')) {
            steps.push('Verify your API token is correct');
            steps.push('Check your GoLogin subscription includes API access');
            steps.push('Test: curl -H "Authorization: Bearer TOKEN" https://api.gologin.com/browser/v2');
        } else if (issue.includes('GOLOGIN_PROFILE_ID')) {
            steps.push('Get profile ID from GoLogin dashboard URL');
            steps.push('Add to environment: GOLOGIN_PROFILE_ID=your-profile-id');
        } else if (issue.includes('not found')) {
            steps.push('Verify the profile ID is correct');
            steps.push('Check the profile exists in GoLogin dashboard');
        } else if (issue.includes('proxy')) {
            steps.push('Configure a residential proxy in your GoLogin profile');
            steps.push('Datacenter proxies are more likely to be detected');
        }
    }
    
    return steps;
}

/**
 * POST /api/scrape/gologin-status
 * 
 * Actions:
 * - start: Start the configured profile
 * - stop: Stop the configured profile
 * - restart: Restart the configured profile
 * - list: List all available profiles
 * - status: Get detailed profile status
 * - validate: Run full configuration validation
 * - test: Test browser connection (starts, connects, disconnects)
 * - diagnose: Get full diagnostic report
 */
export async function POST(request: Request) {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action, profileId } = await request.json();

        if (!action) {
            return NextResponse.json({ 
                error: 'Action is required',
                validActions: ['start', 'stop', 'restart', 'list', 'status', 'validate', 'test', 'diagnose']
            }, { status: 400 });
        }

        console.log(`[GOLOGIN-STATUS] Action: ${action}, ProfileId: ${profileId || '(default)'}`);

        const targetProfileId = profileId || goLoginClient.getProfileId();
        
        // Actions that don't require a profile ID
        const noProfileRequired = ['list', 'validate', 'diagnose'];
        
        if (!targetProfileId && !noProfileRequired.includes(action)) {
            return NextResponse.json({ 
                error: 'Profile ID is required. Set GOLOGIN_PROFILE_ID environment variable or provide profileId in request.',
                suggestion: 'Use action "list" to see available profiles, or "validate" to check configuration.'
            }, { status: 400 });
        }

        switch (action) {
            case 'start': {
                console.log(`[GOLOGIN-STATUS] Starting profile ${targetProfileId}...`);
                const result = await goLoginClient.startProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'start',
                    profileId: targetProfileId,
                    wsEndpoint: result.wsEndpoint || null,
                    error: result.error || null,
                    message: result.success 
                        ? 'Profile started successfully' 
                        : `Failed to start profile: ${result.error}`
                });
            }

            case 'stop': {
                console.log(`[GOLOGIN-STATUS] Stopping profile ${targetProfileId}...`);
                const result = await goLoginClient.stopProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'stop',
                    profileId: targetProfileId,
                    error: result.error || null,
                    message: result.success ? 'Profile stopped successfully' : `Failed to stop: ${result.error}`
                });
            }

            case 'restart': {
                console.log(`[GOLOGIN-STATUS] Restarting profile ${targetProfileId}...`);
                // Stop first
                await goLoginClient.stopProfile(targetProfileId);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
                
                // Then start
                const result = await goLoginClient.startProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'restart',
                    profileId: targetProfileId,
                    wsEndpoint: result.wsEndpoint || null,
                    error: result.error || null,
                    message: result.success 
                        ? 'Profile restarted successfully' 
                        : `Failed to restart: ${result.error}`
                });
            }

            case 'list': {
                console.log(`[GOLOGIN-STATUS] Listing profiles...`);
                const profiles = await goLoginClient.listProfiles();
                return NextResponse.json({
                    success: profiles.success,
                    action: 'list',
                    profiles: profiles.profiles.map(p => ({
                        id: p.id,
                        name: p.name,
                        browserType: p.browserType,
                        os: p.os
                    })),
                    total: profiles.total,
                    message: profiles.success 
                        ? `Found ${profiles.total} profile(s)` 
                        : 'Failed to list profiles'
                });
            }

            case 'status': {
                console.log(`[GOLOGIN-STATUS] Getting status for profile ${targetProfileId}...`);
                const status = await goLoginClient.getProfileStatus(targetProfileId);
                return NextResponse.json({
                    success: status.success,
                    action: 'status',
                    profileId: targetProfileId,
                    isRunning: status.isRunning,
                    profile: status.profile,
                    wsEndpoint: status.wsEndpoint || null,
                    error: status.error || null
                });
            }

            case 'validate': {
                console.log(`[GOLOGIN-STATUS] Running configuration validation...`);
                const validation = await goLoginClient.validateConfiguration();
                return NextResponse.json({
                    success: validation.valid,
                    action: 'validate',
                    validation: {
                        valid: validation.valid,
                        apiTokenValid: validation.apiTokenValid,
                        profileConfigured: validation.profileConfigured,
                        profileExists: validation.profileExists,
                        canListProfiles: validation.canListProfiles
                    },
                    profileInfo: validation.profileInfo || null,
                    errors: validation.errors,
                    warnings: validation.warnings,
                    suggestions: validation.suggestions,
                    message: validation.valid 
                        ? 'Configuration is valid' 
                        : `Configuration has ${validation.errors.length} error(s)`
                });
            }

            case 'test': {
                console.log(`[GOLOGIN-STATUS] Testing connection for profile ${targetProfileId}...`);
                const manager = getBrowserManagerForProfile(targetProfileId!);
                const testResult = await manager.testConnection();
                return NextResponse.json({
                    success: testResult.success,
                    action: 'test',
                    profileId: targetProfileId,
                    wsEndpoint: testResult.wsEndpoint || null,
                    error: testResult.error || null,
                    message: testResult.message
                });
            }

            case 'diagnose': {
                console.log(`[GOLOGIN-STATUS] Running full diagnostics...`);
                const diagnosticReport = await goLoginClient.getDiagnosticReport();
                const validation = await goLoginClient.validateConfiguration();
                
                let browserDiagnostics = null;
                if (targetProfileId) {
                    try {
                        const manager = getBrowserManagerForProfile(targetProfileId);
                        browserDiagnostics = await manager.getDiagnostics();
                    } catch (e) {
                        browserDiagnostics = { error: e instanceof Error ? e.message : 'Failed to get browser diagnostics' };
                    }
                }
                
                return NextResponse.json({
                    success: true,
                    action: 'diagnose',
                    timestamp: new Date().toISOString(),
                    report: diagnosticReport,
                    validation,
                    browserDiagnostics,
                    environment: {
                        SCRAPER_MODE: process.env.SCRAPER_MODE || 'local',
                        GOLOGIN_API_TOKEN: process.env.GOLOGIN_API_TOKEN ? 'SET' : 'NOT SET',
                        GOLOGIN_PROFILE_ID: process.env.GOLOGIN_PROFILE_ID || 'NOT SET',
                        GOLOGIN_DEBUG: process.env.GOLOGIN_DEBUG || 'false',
                        NODE_ENV: process.env.NODE_ENV || 'development'
                    }
                });
            }

            default:
                return NextResponse.json({ 
                    error: `Unknown action: ${action}`,
                    validActions: ['start', 'stop', 'restart', 'list', 'status', 'validate', 'test', 'diagnose']
                }, { status: 400 });
        }

    } catch (error) {
        console.error('[GOLOGIN-STATUS] Action error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

