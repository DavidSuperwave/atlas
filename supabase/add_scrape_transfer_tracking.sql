-- ============================================================
-- SCRAPE TRANSFER TRACKING MIGRATION
-- ============================================================
-- This script adds the transferred_from_scrape_id field to scrapes
-- for tracking which admin scrape was used to transfer results.
--
-- Run this in the Supabase SQL Editor or via psql.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- Add transferred_from_scrape_id column to scrapes
-- Links to the admin's scrape that was used to transfer leads
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS transferred_from_scrape_id UUID REFERENCES scrapes(id) ON DELETE SET NULL;

-- Add transferred_at column to track when results were transferred
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

-- Add transferred_leads_count to track how many leads were transferred
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS transferred_leads_count INTEGER DEFAULT 0;

-- Create index for filtering/querying transferred scrapes
CREATE INDEX IF NOT EXISTS idx_scrapes_transferred_from ON scrapes(transferred_from_scrape_id);

-- Add comments explaining the columns
COMMENT ON COLUMN scrapes.transferred_from_scrape_id IS 'The admin scrape that was used to transfer leads to this scrape request';
COMMENT ON COLUMN scrapes.transferred_at IS 'Timestamp when leads were transferred to this scrape';
COMMENT ON COLUMN scrapes.transferred_leads_count IS 'Number of leads transferred from admin scrape';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT 'VERIFYING SCRAPES TRANSFER TRACKING COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'scrapes' 
AND column_name IN ('transferred_from_scrape_id', 'transferred_at', 'transferred_leads_count')
ORDER BY column_name;

SELECT 'SCRAPE TRANSFER TRACKING MIGRATION COMPLETE!' AS status;

