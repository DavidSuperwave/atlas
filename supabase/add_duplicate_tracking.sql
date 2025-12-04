-- Migration to allow duplicate leads and add duplicate tracking
-- This removes the global unique constraint and adds columns to track duplicates

-- ============================================================================
-- DIAGNOSTIC: Check table structure (run this first to verify column names)
-- ============================================================================
-- Uncomment the line below to see what columns exist in your leads table:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position;

-- ============================================================================
-- STEP 1: Add duplicate tracking columns
-- ============================================================================

-- Add columns to track duplicates
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS original_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 2: Drop the global unique constraint
-- ============================================================================

-- The constraint name might vary, so we try multiple common names
DO $$ 
BEGIN
    -- Try dropping by the most common constraint name patterns
    ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_first_name_last_name_company_name_key;
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_first_name_last_name_company_name_unique;
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

-- Also try to drop any unnamed unique constraint on these columns
-- by finding and dropping it dynamically
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'leads'
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 3;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE leads DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Create index for efficient duplicate lookups
-- ============================================================================

-- Create an index for fast duplicate lookups (case-insensitive)
-- Handle NULL values by using COALESCE to convert NULL to empty string
-- First verify columns exist, then create index dynamically
DO $$
BEGIN
    -- Check if columns exist
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = 'leads' 
        AND column_name IN ('first_name', 'last_name', 'company_name')
        GROUP BY table_name
        HAVING COUNT(*) = 3
    ) THEN
        -- Create index using dynamic SQL
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_duplicate_lookup 
                 ON public.leads (
                     LOWER(TRIM(COALESCE(first_name, ''''::text))), 
                     LOWER(TRIM(COALESCE(last_name, ''''::text))), 
                     LOWER(TRIM(COALESCE(company_name, ''''::text)))
                 )';
        RAISE NOTICE 'Duplicate lookup index created successfully';
    ELSE
        RAISE WARNING 'Columns first_name, last_name, or company_name do not exist in leads table. Skipping index creation.';
        RAISE WARNING 'Please verify your table structure with: SELECT column_name FROM information_schema.columns WHERE table_name = ''leads''';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not create duplicate lookup index. Error: %', SQLERRM;
    RAISE WARNING 'Please check that columns first_name, last_name, and company_name exist in the leads table.';
END $$;

-- Create index for original_lead_id for reverse lookups
CREATE INDEX IF NOT EXISTS idx_leads_original_lead_id ON leads(original_lead_id);

-- Create index for is_duplicate for filtering
CREATE INDEX IF NOT EXISTS idx_leads_is_duplicate ON leads(is_duplicate);

-- ============================================================================
-- STEP 4: Add comment explaining the duplicate tracking system
-- ============================================================================

COMMENT ON COLUMN leads.is_duplicate IS 'True if this lead was scraped when a lead with the same name/company already existed';
COMMENT ON COLUMN leads.original_lead_id IS 'References the original lead if this is a duplicate';

