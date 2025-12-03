/**
 * Shared types for all scraper implementations
 * 
 * This file contains type definitions used by all scraper implementations:
 * - Local Chrome (browser-manager-local.ts)
 * - Dolphin Anty (browser-manager-dolphin.ts)
 * - GoLogin (browser-manager-gologin.ts)
 * 
 * All scraper implementations must use these types to ensure compatibility with:
 * - Database schema (leads table)
 * - Enrichment system
 * - PlusVibe integration
 * - UI components
 * 
 * @see docs/ARCHITECTURE.md for system design documentation
 */

/**
 * Represents a lead scraped from Apollo
 * 
 * All fields map directly to the `leads` database table columns.
 * Both scraper implementations (local and Dolphin Anty) must return
 * this exact structure to maintain downstream compatibility.
 */
export type ScrapedLead = {
    /** Contact's first name */
    first_name: string;
    /** Contact's last name */
    last_name: string;
    /** Job title/position */
    title: string;
    /** Company name */
    company_name: string;
    /** Company LinkedIn URL */
    company_linkedin: string;
    /** Geographic location */
    location: string;
    /** Company size (employee count range) */
    company_size: string;
    /** Industry/sector */
    industry: string;
    /** Company website URL */
    website: string;
    /** Keywords/tags associated with the lead */
    keywords: string[];
    /** Email address (optional - often populated during enrichment) */
    email?: string;
    /** Phone numbers (optional) */
    phone_numbers?: string[];
    /** Personal LinkedIn URL (optional) */
    linkedin_url?: string;
};

/**
 * Represents an error that occurred during scraping
 * 
 * Used for tracking and debugging scraping issues on a per-row basis.
 */
export type ScrapeError = {
    /** Row number where the error occurred */
    row: number;
    /** Error message description */
    message: string;
    /** ISO timestamp when the error occurred */
    timestamp: string;
};

/**
 * Scraper mode configuration
 * 
 * Determines which scraper implementation to use:
 * - 'local': Uses local Chrome browser with remote debugging (default)
 * - 'dolphin': Uses Dolphin Anty anti-detect browser (local installation)
 * - 'gologin': Uses GoLogin cloud anti-detect browser (recommended)
 * 
 * Set via SCRAPER_MODE environment variable.
 */
export type ScraperMode = 'local' | 'dolphin' | 'gologin';

/**
 * Common scraper interface
 * 
 * All scraper implementations must implement this function signature
 * to ensure compatibility with the factory pattern.
 */
export type ScraperFunction = (url: string, pages?: number) => Promise<ScrapedLead[]>;


