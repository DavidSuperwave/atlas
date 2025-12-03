-- Migration: Add scraper_mode column to scrapes table
-- This tracks which scraper (local or dolphin) was used for each scrape

-- Add scraper_mode column to scrapes table
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS scraper_mode TEXT;

-- Add comment for documentation
COMMENT ON COLUMN scrapes.scraper_mode IS 'Scraper mode used: local or dolphin';

-- Optional: Add api_key_used column to leads table for enrichment tracking
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS api_key_used TEXT;

COMMENT ON COLUMN leads.api_key_used IS 'Which API key was used for email verification';

-- Create index for querying by scraper mode (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_scrapes_scraper_mode ON scrapes(scraper_mode);

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'scrapes' AND column_name = 'scraper_mode';

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'leads' AND column_name = 'api_key_used';


