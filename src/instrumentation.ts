/**
 * Next.js Instrumentation - Server Initialization
 * 
 * This file runs once when the Next.js server starts.
 * It's the proper place to initialize long-running processes like the scrape queue.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    console.log('[INSTRUMENTATION] ========================================');
    console.log('[INSTRUMENTATION] register() called');
    console.log(`[INSTRUMENTATION] NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}`);
    console.log('[INSTRUMENTATION] ========================================');
    
    // Only run on the server (not edge runtime)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        console.log('[INSTRUMENTATION] Server starting (nodejs runtime)...');
        
        // Check if we're in GoLogin mode
        const scraperMode = process.env.SCRAPER_MODE?.toLowerCase();
        const isGoLoginMode = scraperMode === 'gologin';
        
        console.log(`[INSTRUMENTATION] SCRAPER_MODE: ${process.env.SCRAPER_MODE || '(not set)'}`);
        console.log(`[INSTRUMENTATION] GOLOGIN_CLOUD_MODE: ${process.env.GOLOGIN_CLOUD_MODE || '(not set)'}`);
        console.log(`[INSTRUMENTATION] Is GoLogin mode: ${isGoLoginMode}`);
        
        if (isGoLoginMode) {
            // Dynamically import and start the queue processor
            // This ensures it only starts once when the server boots
            try {
                const { scrapeQueue } = await import('./lib/scrape-queue');
                
                // Give Next.js a moment to fully initialize
                setTimeout(() => {
                    if (!scrapeQueue.isProcessorStarted()) {
                        console.log('[INSTRUMENTATION] Starting scrape queue processor...');
                        scrapeQueue.startProcessor();
                    } else {
                        console.log('[INSTRUMENTATION] Scrape queue processor already running');
                    }
                }, 3000);
            } catch (error) {
                console.error('[INSTRUMENTATION] Failed to start scrape queue:', error);
            }
        } else {
            console.log('[INSTRUMENTATION] Not in GoLogin mode, skipping queue processor auto-start');
        }
    }
}

