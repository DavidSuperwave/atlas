-- Migration: Drop name-based unique constraint
-- 
-- This removes the unique constraint on (first_name, last_name, company_name)
-- because we now detect duplicates by EMAIL after enrichment instead.
--
-- Rationale:
-- - Names are not unique identifiers ("John Smith" could be different people)
-- - Email IS unique and definitive
-- - Duplicate detection by email happens after enrichment
-- - This allows leads to be inserted immediately without blocking
--
-- Run this in Supabase SQL Editor

-- Drop the unique constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_first_name_last_name_company_name_key;

-- Also try alternative constraint names that might exist
DO $$ 
BEGIN
    ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_first_name_last_name_company_name_unique;
EXCEPTION WHEN undefined_object THEN
    NULL;
END $$;

-- Verify the constraint was dropped
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'leads'::regclass 
AND contype = 'u';

-- Add index on email for faster duplicate lookups during enrichment
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;

-- Show success message
SELECT 'Unique constraint dropped successfully. Leads can now be inserted without name-based duplicate checking.' as result;

