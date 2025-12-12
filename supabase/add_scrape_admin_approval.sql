-- ============================================================
-- SCRAPE ADMIN APPROVAL MIGRATION
-- ============================================================
-- This script adds the requires_admin_approval field to scrapes
-- for controlling which scrapes need manual admin processing.
--
-- Run this in the Supabase SQL Editor or via psql.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- Add requires_admin_approval column to scrapes
-- When true, scrape won't be processed automatically and needs admin to transfer results
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS requires_admin_approval BOOLEAN DEFAULT false;

-- Add approved_by column to track which admin approved/processed the scrape
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Add approved_at column to track when it was approved
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Create index for filtering by approval status
CREATE INDEX IF NOT EXISTS idx_scrapes_requires_admin_approval ON scrapes(requires_admin_approval);
CREATE INDEX IF NOT EXISTS idx_scrapes_approved_by ON scrapes(approved_by);

-- Add comments explaining the columns
COMMENT ON COLUMN scrapes.requires_admin_approval IS 'When true, scrape requires admin to manually transfer results (for scrape-only users)';
COMMENT ON COLUMN scrapes.approved_by IS 'Admin who approved/processed this scrape';
COMMENT ON COLUMN scrapes.approved_at IS 'Timestamp when the scrape was approved/processed';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT 'VERIFYING SCRAPES ADMIN APPROVAL COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'scrapes' 
AND column_name IN ('requires_admin_approval', 'approved_by', 'approved_at')
ORDER BY column_name;

SELECT 'SCRAPE ADMIN APPROVAL MIGRATION COMPLETE!' AS status;









