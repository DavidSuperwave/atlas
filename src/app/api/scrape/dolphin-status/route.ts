/**
 * Dolphin Anty Status API Endpoint
 * 
 * This endpoint provides status information about the Dolphin Anty
 * browser configuration and profile health. Useful for:
 * - Monitoring if Dolphin Anty is running
 * - Checking profile connection status
 * - Debugging configuration issues
 * - Admin dashboard integration
 * 
 * GET /api/scrape/dolphin-status
 * Returns:
 * - Dolphin Anty availability
 * - Current scraper mode
 * - Profile status (if configured)
 * - Configuration validation
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/supabase-server';
import { dolphinAntyClient } from '@/lib/dolphin-anty-client';
import { BrowserManagerDolphin } from '@/lib/browser-manager-dolphin';
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

        // Get Dolphin Anty specific status
        const dolphinAvailable = await dolphinAntyClient.isAvailable();
        
        let profileStatus = null;
        let profileList = null;
        let browserStatus = null;

        if (dolphinAvailable) {
            // Get profile status if profile ID is configured
            const profileId = dolphinAntyClient.getProfileId();
            if (profileId) {
                const status = await dolphinAntyClient.getProfileStatus(profileId);
                profileStatus = {
                    id: profileId,
                    found: status.success,
                    isRunning: status.isRunning,
                    name: status.profile?.name || 'Unknown',
                    wsEndpoint: status.wsEndpoint || null
                };
            }

            // Get list of available profiles
            const profiles = await dolphinAntyClient.listProfiles(1, 10);
            if (profiles.success) {
                profileList = profiles.data.map(p => ({
                    id: p.id,
                    name: p.name,
                    status: p.status
                }));
            }

            // Get browser manager status if in dolphin mode
            if (scraperStatus.mode === 'dolphin') {
                const manager = BrowserManagerDolphin.getInstance();
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
                isDolphinConfigured: scraperStatus.isDolphinConfigured
            },
            
            // Configuration validation
            configuration: {
                valid: configValidation.valid,
                warnings: configValidation.warnings,
                errors: configValidation.errors
            },
            
            // Dolphin Anty status
            dolphin: {
                available: dolphinAvailable,
                apiUrl: process.env.DOLPHIN_ANTY_API_URL || 'http://localhost:3001',
                profileId: dolphinAntyClient.getProfileId(),
                profileStatus,
                profileList,
                browserStatus
            },
            
            // Environment variables (masked for security)
            environment: {
                SCRAPER_MODE: process.env.SCRAPER_MODE || '(not set, defaults to local)',
                DOLPHIN_ANTY_API_URL: process.env.DOLPHIN_ANTY_API_URL || '(not set, defaults to localhost:3001)',
                DOLPHIN_ANTY_PROFILE_ID: process.env.DOLPHIN_ANTY_PROFILE_ID ? '(configured)' : '(not set)'
            }
        });

    } catch (error) {
        console.error('[DOLPHIN-STATUS] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

/**
 * POST /api/scrape/dolphin-status
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

        const targetProfileId = profileId || dolphinAntyClient.getProfileId();
        if (!targetProfileId && action !== 'list') {
            return NextResponse.json({ 
                error: 'Profile ID is required. Set DOLPHIN_ANTY_PROFILE_ID environment variable or provide profileId in request.' 
            }, { status: 400 });
        }

        switch (action) {
            case 'start': {
                const result = await dolphinAntyClient.startProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'start',
                    profileId: targetProfileId,
                    wsEndpoint: result.automation?.wsEndpoint,
                    error: result.error
                });
            }

            case 'stop': {
                const result = await dolphinAntyClient.stopProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'stop',
                    profileId: targetProfileId,
                    error: result.error
                });
            }

            case 'restart': {
                // Stop first, then start
                await dolphinAntyClient.stopProfile(targetProfileId);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                const result = await dolphinAntyClient.startProfile(targetProfileId);
                return NextResponse.json({
                    success: result.success,
                    action: 'restart',
                    profileId: targetProfileId,
                    wsEndpoint: result.automation?.wsEndpoint,
                    error: result.error
                });
            }

            case 'list': {
                const profiles = await dolphinAntyClient.listProfiles(1, 50);
                return NextResponse.json({
                    success: profiles.success,
                    action: 'list',
                    profiles: profiles.data,
                    total: profiles.total
                });
            }

            case 'status': {
                const status = await dolphinAntyClient.getProfileStatus(targetProfileId);
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
        console.error('[DOLPHIN-STATUS] Action error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}


