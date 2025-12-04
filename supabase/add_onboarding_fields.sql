-- ============================================================
-- ONBOARDING FIELDS MIGRATION
-- ============================================================
-- This script adds fields to user_profiles for the onboarding flow.
--
-- Run this in the Supabase SQL Editor or via psql.
-- ============================================================

-- Add name column to user_profiles if it doesn't exist
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add onboarding-related columns to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS has_apollo_account boolean;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp with time zone;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS requested_credits_plan text;

-- Add comments explaining the columns
COMMENT ON COLUMN user_profiles.name IS 'User''s full name';
COMMENT ON COLUMN user_profiles.has_apollo_account IS 'Whether the user has their own Apollo account';
COMMENT ON COLUMN user_profiles.onboarding_completed IS 'Whether the user has completed the onboarding flow';
COMMENT ON COLUMN user_profiles.onboarding_completed_at IS 'Timestamp when onboarding was completed';
COMMENT ON COLUMN user_profiles.requested_credits_plan IS 'The credit plan requested during onboarding (starter, pro, enterprise)';

-- Create index for onboarding status (for admin queries)
CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding ON user_profiles(onboarding_completed);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify columns were added successfully

SELECT 'VERIFYING USER_PROFILES ONBOARDING COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name IN ('name', 'has_apollo_account', 'onboarding_completed', 'onboarding_completed_at', 'requested_credits_plan')
ORDER BY column_name;

SELECT 'MIGRATION COMPLETE!' AS status;

