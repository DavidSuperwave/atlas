/**
 * GoLogin Status API Endpoint
 * 
 * This endpoint provides status information about the GoLogin
 * browser configuration and profile health. Useful for:
 * - Monitoring if GoLogin is properly configured
 * - Checking profile connection status
 * - Debugging configuration issues
 * - Admin dashboard integration
 * 
 * GET /api/scrape/gologin-status
 * Returns:
 * - GoLogin availability
 * - Current scraper mode
 * - Profile status (if configured)
 * - Configuration validation
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { goLoginClient } from '@/lib/gologin-client';
import { getBrowserManagerForProfile } from '@/lib/browser-manager-gologin';
import { getScraperMode, getScraperStatus, validateScraperConfig } from '@/lib/scraper';

export const runtime = 'nodejs';

export async function GET() {
    try {
        // Auth check
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get scraper status and configuration
        const scraperStatus = getScraperStatus();
        const configValidation = await validateScraperConfig();

        // Get GoLogin specific status
        const goLoginAvailable = await goLoginClient.isAvailable();
        
        let profileStatus = null;
        let profileList = null;
        let browserStatus = null;

        if (goLoginAvailable) {
            // Get profile status if profile ID is configured
            const profileId = goLoginClient.getProfileId();
            if (profileId) {
                const status = await goLoginClient.getProfileStatus(profileId);
                profileStatus = {
                    id: profileId,
                    found: status.success && status.profile !== null,
                    isRunning: status.isRunning,
                    name: status.profile?.name || 'Unknown',
                    wsEndpoint: status.wsEndpoint || null
                };
            }

            // Get list of available profiles
            const profiles = await goLoginClient.listProfiles();
            if (profiles.success) {
                profileList = profiles.profiles.map(p => ({
                    id: p.id,
                    name: p.name,
                    browserType: p.browserType
                }));
            }

            // Get browser manager status if in gologin mode and profile is configured
            if (scraperStatus.mode === 'gologin' && goLoginClient.getProfileId()) {
                const manager = getBrowserManagerForProfile(goLoginClient.getProfileId()!);
                browserStatus = await manager.getStatus();
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            
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
            
            // GoLogin status
            gologin: {
                available: goLoginAvailable,
                configured: goLoginClient.isConfigured(),
                profileId: goLoginClient.getProfileId(),
                profileStatus,
                profileList,
                browserStatus
            },
            
            // Environment variables (masked for security)
            environment: {
                SCRAPER_MODE: process.env.SCRAPER_MODE || '(not set, defaults to local)',
                GOLOGIN_API_TOKEN: process.env.GOLOGIN_API_TOKEN ? '(configured)' : '(not set)',
                GOLOGIN_PROFILE_ID: process.env.GOLOGIN_PROFILE_ID ? '(configured)' : '(not set)'
            }
        });

    } catch (error) {
        console.error('[GOLOGIN-STATUS] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

/**
 * POST /api/scrape/gologin-status
 * 
 * Actions:
 * - start: Start the configured profile
 * - stop: Stop the configured profile
 * - restart: Restart the configured profile
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
            return NextResponse.json({ error: 'Action is required' }, { status: 400 });
        }

        const targetProfileId = profileId || goLoginClient.getProfileId();
        if (!targetProfileId && action !== 'list') {
            return NextResponse.json({ 
                error: 'Profile ID is required. Set GOLOGIN_PROFILE_ID environment variable or provide profileId in request.' 
            }, { status: 400 });
        }

        switch (action) {
            case 'start': {
                const result = await goLoginClient.startProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'start',
                    profileId: targetProfileId,
                    wsEndpoint: result.wsEndpoint,
                    error: result.error
                });
            }

            case 'stop': {
                const result = await goLoginClient.stopProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'stop',
                    profileId: targetProfileId,
                    error: result.error
                });
            }

            case 'restart': {
                // Stop first, then start
                await goLoginClient.stopProfile(targetProfileId);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                const result = await goLoginClient.startProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'restart',
                    profileId: targetProfileId,
                    wsEndpoint: result.wsEndpoint,
                    error: result.error
                });
            }

            case 'list': {
                const profiles = await goLoginClient.listProfiles();
                return NextResponse.json({
                    success: profiles.success,
                    action: 'list',
                    profiles: profiles.profiles,
                    total: profiles.total
                });
            }

            case 'status': {
                const status = await goLoginClient.getProfileStatus(targetProfileId);
                return NextResponse.json({
                    success: status.success,
                    action: 'status',
                    profileId: targetProfileId,
                    isRunning: status.isRunning,
                    profile: status.profile,
                    wsEndpoint: status.wsEndpoint,
                    error: status.error
                });
            }

            default:
                return NextResponse.json({ 
                    error: `Unknown action: ${action}. Valid actions: start, stop, restart, list, status` 
                }, { status: 400 });
        }

    } catch (error) {
        console.error('[GOLOGIN-STATUS] Action error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

