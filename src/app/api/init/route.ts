import { NextResponse } from 'next/server';
import { scrapeQueue, validateEnvironment } from '@/lib/scrape-queue';

export const runtime = 'nodejs';

/**
 * GET /api/init
 * 
 * Initializes the scrape queue processor and returns status information.
 * This endpoint can be called:
 * - By Railway on startup as a health check
 * - Manually to verify the system is running
 * - To diagnose configuration issues
 */
export async function GET() {
    console.log('[INIT-API] Initialization endpoint called');
    
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate environment
    const envValidation = validateEnvironment();
    errors.push(...envValidation.errors);
    warnings.push(...envValidation.warnings);
    
    // Get current queue status
    const queueStatus = scrapeQueue.getStatus();
    
    // Try to start the processor if not already running and we're in GoLogin mode
    let processorStarted = queueStatus.processorStarted;
    if (!processorStarted && queueStatus.isGoLoginMode) {
        console.log('[INIT-API] Queue processor not started, attempting to start...');
        try {
            scrapeQueue.startProcessor();
            processorStarted = true;
            console.log('[INIT-API] Queue processor started successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Failed to start queue processor: ${errorMessage}`);
            console.error('[INIT-API] Failed to start queue processor:', error);
        }
    }
    
    // Build masked environment info (don't expose actual values)
    const envInfo = {
        SCRAPER_MODE: process.env.SCRAPER_MODE || '(not set)',
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ set' : '✗ MISSING',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ MISSING',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ set' : '✗ MISSING',
        GOLOGIN_API_TOKEN: process.env.GOLOGIN_API_TOKEN ? '✓ set' : '✗ MISSING',
        GOLOGIN_PROFILE_ID: process.env.GOLOGIN_PROFILE_ID ? '✓ set' : '(not set - using database)',
        NODE_ENV: process.env.NODE_ENV || '(not set)',
    };
    
    const elapsedMs = Date.now() - startTime;
    
    const response = {
        success: errors.length === 0,
        message: errors.length === 0 
            ? 'System initialized successfully' 
            : 'System initialization completed with errors',
        timestamp: new Date().toISOString(),
        elapsedMs,
        queue: {
            processorStarted,
            isProcessing: queueStatus.isProcessing,
            currentScrapeId: queueStatus.currentScrapeId,
            isGoLoginMode: queueStatus.isGoLoginMode,
            scraperMode: queueStatus.scraperMode,
        },
        environment: envInfo,
        validation: {
            valid: envValidation.valid,
            errors,
            warnings,
        },
    };
    
    const status = errors.length === 0 ? 200 : 500;
    
    console.log(`[INIT-API] Initialization complete:`, {
        success: response.success,
        processorStarted,
        errors: errors.length,
        warnings: warnings.length,
        elapsedMs,
    });
    
    return NextResponse.json(response, { status });
}

/**
 * POST /api/init
 * 
 * Force restart the queue processor (useful for debugging)
 */
export async function POST() {
    console.log('[INIT-API] Force restart requested');
    
    const errors: string[] = [];
    
    // Validate environment first
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
        return NextResponse.json({
            success: false,
            message: 'Cannot restart - environment validation failed',
            errors: envValidation.errors,
            warnings: envValidation.warnings,
        }, { status: 500 });
    }
    
    // Stop the processor if running
    try {
        scrapeQueue.stopProcessor();
        console.log('[INIT-API] Processor stopped');
    } catch (error) {
        console.error('[INIT-API] Error stopping processor:', error);
    }
    
    // Wait a moment then restart
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start the processor
    try {
        scrapeQueue.startProcessor();
        console.log('[INIT-API] Processor restarted');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to restart processor: ${errorMessage}`);
        console.error('[INIT-API] Failed to restart processor:', error);
    }
    
    const queueStatus = scrapeQueue.getStatus();
    
    return NextResponse.json({
        success: errors.length === 0,
        message: errors.length === 0 ? 'Processor restarted successfully' : 'Restart failed',
        queue: {
            processorStarted: queueStatus.processorStarted,
            isProcessing: queueStatus.isProcessing,
            currentScrapeId: queueStatus.currentScrapeId,
            isGoLoginMode: queueStatus.isGoLoginMode,
            scraperMode: queueStatus.scraperMode,
        },
        errors,
    }, { status: errors.length === 0 ? 200 : 500 });
}

