-- ============================================================
-- ACCOUNT TYPE MIGRATION
-- ============================================================
-- This script adds account_type field to user_profiles for 
-- distinguishing between full app users and scrape-only users.
--
-- Run this in the Supabase SQL Editor or via psql.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- Add account_type column to user_profiles
-- Values: 'full' (default) or 'scrape_only'
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'full' 
CHECK (account_type IN ('full', 'scrape_only'));

-- Add comment explaining the column
COMMENT ON COLUMN user_profiles.account_type IS 'Account type: full (regular users with full app access) or scrape_only (users who only do one-off scrapes)';

-- Create index for filtering by account type
CREATE INDEX IF NOT EXISTS idx_user_profiles_account_type ON user_profiles(account_type);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
SELECT 'VERIFYING USER_PROFILES ACCOUNT_TYPE COLUMN...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name = 'account_type';

SELECT 'ACCOUNT TYPE MIGRATION COMPLETE!' AS status;

