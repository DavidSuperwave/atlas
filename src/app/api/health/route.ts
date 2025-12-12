import { NextResponse } from 'next/server';
import { scrapeQueue, validateEnvironment, validateEnvironmentSync } from '@/lib/scrape-queue';
import { getAllActiveApiKeys } from '@/lib/gologin-api-key-manager';

export const runtime = 'nodejs';

/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring the scrape queue system.
 * Returns:
 * - 200 OK if everything is healthy
 * - 503 Service Unavailable if there are critical issues
 * 
 * Use this endpoint for:
 * - Railway health checks
 * - Uptime monitoring
 * - Debugging queue issues
 */
export async function GET() {
    const startTime = Date.now();
    
    // Get queue status
    const queueStatus = scrapeQueue.getStatus();
    
    // Validate environment (use sync for quick health check)
    const envValidation = validateEnvironmentSync();
    
    // Get API key count for multi-key status
    let apiKeyCount = 0;
    try {
        const activeKeys = await getAllActiveApiKeys();
        apiKeyCount = activeKeys.length;
    } catch {
        // Ignore errors - just report 0
    }
    
    // Determine overall health
    const isHealthy = envValidation.valid && 
        (queueStatus.isGoLoginMode ? queueStatus.processorStarted : true);
    
    // Build response
    const response = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB',
        },
        queue: {
            processorStarted: queueStatus.processorStarted,
            isProcessing: queueStatus.isProcessing,
            currentScrapeId: queueStatus.currentScrapeId,
            scraperMode: queueStatus.scraperMode,
            isGoLoginMode: queueStatus.isGoLoginMode,
        },
        environment: {
            valid: envValidation.valid,
            mode: process.env.SCRAPER_MODE || 'local',
            nodeEnv: process.env.NODE_ENV || 'development',
            hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            hasSupabaseKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
            hasGoLoginToken: !!process.env.GOLOGIN_API_TOKEN,
            hasGoLoginProfile: !!process.env.GOLOGIN_PROFILE_ID,
        },
        apiKeys: {
            count: apiKeyCount,
            hasEnvFallback: !!process.env.GOLOGIN_API_TOKEN,
        },
        checks: {
            supabase: envValidation.valid && !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            scraperMode: !!process.env.SCRAPER_MODE,
            goLoginConfigured: queueStatus.isGoLoginMode 
                ? (apiKeyCount > 0 || !!process.env.GOLOGIN_API_TOKEN)
                : true,
            queueProcessorRunning: queueStatus.isGoLoginMode 
                ? queueStatus.processorStarted 
                : true,
        },
        responseTimeMs: Date.now() - startTime,
    };
    
    // Add warnings if any
    if (envValidation.warnings.length > 0) {
        (response as Record<string, unknown>).warnings = envValidation.warnings;
    }
    
    // Add errors if unhealthy
    if (!isHealthy) {
        (response as Record<string, unknown>).errors = envValidation.errors;
        
        // If processor should be running but isn't, add that as an error
        if (queueStatus.isGoLoginMode && !queueStatus.processorStarted) {
            const errors = (response as Record<string, unknown>).errors as string[] || [];
            errors.push('Queue processor is not running (should be running in GoLogin mode)');
            (response as Record<string, unknown>).errors = errors;
        }
    }
    
    const statusCode = isHealthy ? 200 : 503;
    
    return NextResponse.json(response, { status: statusCode });
}

