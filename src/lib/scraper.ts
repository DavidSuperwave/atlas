/**
 * Scraper Factory - Selects and delegates to appropriate scraper implementation
 * 
 * This module acts as the central entry point for all scraping operations.
 * It automatically selects the correct scraper based on the SCRAPER_MODE
 * environment variable and maintains backward compatibility with existing code.
 * 
 * ENVIRONMENT VARIABLES:
 * - SCRAPER_MODE: 'local' | 'dolphin' | 'gologin' (default: 'local')
 * 
 * SCRAPER MODES:
 * - 'local': Uses local Chrome browser with remote debugging (original implementation)
 * - 'dolphin': Uses Dolphin Anty anti-detect browser (requires local installation)
 * - 'gologin': Uses GoLogin cloud anti-detect browser (recommended for production)
 * 
 * MULTI-PROFILE SUPPORT (GoLogin):
 * - Pass userId to scrapeApollo() to use user's assigned profile
 * - Falls back to GOLOGIN_PROFILE_ID env var if no assignment
 * 
 * API COMPATIBILITY:
 * - Import: `import { scrapeApollo, ScrapedLead } from '@/lib/scraper'`
 * - Function signature: `scrapeApollo(url: string, pages?: number, userId?: string): Promise<ScrapedLead[]>`
 * - All existing code continues to work without modification
 * 
 * CONFLICT PREVENTION:
 * - Only one scraper mode should be active at a time
 * - Factory validates environment to prevent dual usage
 * 
 * @see docs/ARCHITECTURE.md for system design documentation
 * @see docs/MIGRATION.md for switching between modes
 * @see docs/GOLOGIN_SETUP.md for GoLogin setup instructions
 */

import { ScrapedLead, ScrapeError, ScraperMode } from './scraper-types';
import { BrowserManagerLocal } from './browser-manager-local';

// Use dynamic imports to avoid loading unnecessary modules and their side effects
// This prevents the Dolphin client from being initialized when using GoLogin mode

// Re-export types for backward compatibility
// This allows existing code to continue using: import { ScrapedLead } from '@/lib/scraper'
export type { ScrapedLead, ScrapeError, ScraperMode };

/**
 * Extended scraper function type that supports optional userId
 */
export type ScraperFunctionWithUser = (url: string, pages?: number, userId?: string) => Promise<ScrapedLead[]>;

/**
 * Get the current scraper mode from environment
 * Defaults to 'local' if not set
 */
export function getScraperMode(): ScraperMode {
    const mode = process.env.SCRAPER_MODE?.toLowerCase();
    if (mode === 'dolphin') {
        return 'dolphin';
    }
    if (mode === 'gologin') {
        return 'gologin';
    }
    return 'local';
}

/**
 * Check for potential conflicts between scraper modes
 * 
 * This function detects situations that could cause issues:
 * - Dolphin/GoLogin mode selected but local Chrome is running
 * - Local mode but Dolphin profile is active (future)
 * 
 * @param mode - The intended scraper mode
 * @returns Object with conflict status and warning message
 */
async function checkForConflicts(mode: ScraperMode): Promise<{ hasConflict: boolean; warning?: string }> {
    if (mode === 'dolphin' || mode === 'gologin') {
        // Check if local Chrome debugging port is in use
        const localManager = BrowserManagerLocal.getInstance();
        const chromeRunning = await localManager.isChromeRunning();
        
        if (chromeRunning) {
            return {
                hasConflict: true,
                warning: `WARNING: Local Chrome with debugging is running while using ${mode} mode. ` +
                         'This may cause conflicts. Consider closing Chrome or switching to local mode.'
            };
        }
    }
    
    // GoLogin is cloud-based, no local conflicts to check
    
    return { hasConflict: false };
}

/**
 * Get the appropriate scraper function based on current mode
 * Uses dynamic imports to avoid loading unnecessary modules
 * 
 * @returns The scraper function for the configured mode
 */
export async function getScraper(): Promise<ScraperFunctionWithUser> {
    const mode = getScraperMode();
    console.log(`[SCRAPER-FACTORY] Using scraper mode: ${mode}`);
    
    switch (mode) {
        case 'gologin':
            // Validate GoLogin configuration
            if (!process.env.GOLOGIN_API_TOKEN) {
                throw new Error(
                    'GoLogin scraper is not configured. ' +
                    'Please set GOLOGIN_API_TOKEN environment variable. ' +
                    'See docs/GOLOGIN_SETUP.md for setup instructions.'
                );
            }
            // Note: GOLOGIN_PROFILE_ID is now optional (can use database assignments)
            const { scrapeApollo: scrapeApolloGoLogin } = await import('./scraper-gologin');
            return scrapeApolloGoLogin;
            
        case 'dolphin':
            // Validate Dolphin configuration
            if (!process.env.DOLPHIN_ANTY_PROFILE_ID) {
                throw new Error(
                    'Dolphin Anty scraper is not configured. ' +
                    'Please set DOLPHIN_ANTY_PROFILE_ID environment variable. ' +
                    'See docs/DOLPHIN_ANTY_SETUP.md for setup instructions.'
                );
            }
            // Dolphin scraper doesn't support userId, wrap it
            const { scrapeApollo: scrapeApolloDolphin } = await import('./scraper-dolphin');
            return (url: string, pages?: number, _userId?: string) => 
                scrapeApolloDolphin(url, pages);
            
        case 'local':
        default:
            // Local scraper doesn't support userId, wrap it
            const { scrapeApollo: scrapeApolloLocal } = await import('./scraper-local');
            return (url: string, pages?: number, _userId?: string) => 
                scrapeApolloLocal(url, pages);
    }
}

/**
 * Scrape leads from Apollo.io
 * 
 * This is the main entry point for scraping. It automatically selects
 * the appropriate scraper based on SCRAPER_MODE environment variable.
 * 
 * FUNCTION SIGNATURE:
 * @param url - Apollo search URL to scrape
 * @param pages - Number of pages to scrape (default: 1)
 * @param userId - Optional user ID for GoLogin profile lookup
 * @returns Promise<ScrapedLead[]> - Array of scraped leads
 * 
 * @example
 * // Uses local Chrome (default)
 * const leads = await scrapeApollo('https://app.apollo.io/#/people?...', 3);
 * 
 * @example
 * // Uses GoLogin with user's assigned profile
 * const leads = await scrapeApollo('https://app.apollo.io/#/people?...', 3, user.id);
 * 
 * @example
 * // Uses GoLogin with default profile from env var
 * const leads = await scrapeApollo('https://app.apollo.io/#/people?...', 3);
 */
export async function scrapeApollo(url: string, pages: number = 1, userId?: string): Promise<ScrapedLead[]> {
    const mode = getScraperMode();
    
    // Check for potential conflicts
    const { hasConflict, warning } = await checkForConflicts(mode);
    if (hasConflict && warning) {
        console.warn(`[SCRAPER-FACTORY] ${warning}`);
    }
    
    // Log scraper mode for debugging
    console.log(`[SCRAPER-FACTORY] ========================================`);
    console.log(`[SCRAPER-FACTORY] Scraper Mode: ${mode.toUpperCase()}`);
    console.log(`[SCRAPER-FACTORY] URL: ${url}`);
    console.log(`[SCRAPER-FACTORY] Pages: ${pages}`);
    console.log(`[SCRAPER-FACTORY] User ID: ${userId || '(none)'}`);
    console.log(`[SCRAPER-FACTORY] ========================================`);
    
    // Get and execute the appropriate scraper (using dynamic import)
    const scraper = await getScraper();
    return scraper(url, pages, userId);
}

/**
 * Validate scraper configuration
 * 
 * Useful for checking if the scraper is properly configured
 * before attempting to scrape.
 * 
 * @returns Object with validation status and any warnings
 */
export async function validateScraperConfig(): Promise<{
    valid: boolean;
    mode: ScraperMode;
    warnings: string[];
    errors: string[];
}> {
    const mode = getScraperMode();
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Check for conflicts
    const { hasConflict, warning } = await checkForConflicts(mode);
    if (hasConflict && warning) {
        warnings.push(warning);
    }
    
    // Validate GoLogin configuration if in GoLogin mode
    if (mode === 'gologin') {
        if (!process.env.GOLOGIN_API_TOKEN) {
            errors.push('GOLOGIN_API_TOKEN environment variable is not set');
        }
        // GOLOGIN_PROFILE_ID is optional when using database assignments
        if (!process.env.GOLOGIN_PROFILE_ID) {
            warnings.push('GOLOGIN_PROFILE_ID environment variable is not set. Using database profile assignments or user assignments.');
        }
    }
    
    // Validate Dolphin configuration if in Dolphin mode
    if (mode === 'dolphin') {
        if (!process.env.DOLPHIN_ANTY_API_URL) {
            errors.push('DOLPHIN_ANTY_API_URL environment variable is not set');
        }
        if (!process.env.DOLPHIN_ANTY_PROFILE_ID) {
            errors.push('DOLPHIN_ANTY_PROFILE_ID environment variable is not set');
        }
    }
    
    return {
        valid: errors.length === 0,
        mode,
        warnings,
        errors
    };
}

/**
 * Get scraper status information
 * 
 * Returns current scraper configuration and status.
 * Useful for debugging and admin dashboards.
 */
export function getScraperStatus(): {
    mode: ScraperMode;
    modeSource: 'environment' | 'default';
    isDolphinConfigured: boolean;
    isGoLoginConfigured: boolean;
    hasGoLoginFallback: boolean;
} {
    const envMode = process.env.SCRAPER_MODE?.toLowerCase();
    
    return {
        mode: getScraperMode(),
        modeSource: envMode ? 'environment' : 'default',
        isDolphinConfigured: !!(
            process.env.DOLPHIN_ANTY_API_URL &&
            process.env.DOLPHIN_ANTY_PROFILE_ID
        ),
        isGoLoginConfigured: !!(
            process.env.GOLOGIN_API_TOKEN
        ),
        hasGoLoginFallback: !!(
            process.env.GOLOGIN_PROFILE_ID
        )
    };
}
