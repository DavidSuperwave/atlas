-- ============================================================
-- ACCOUNT DISABLING MIGRATION
-- ============================================================
-- This script adds the ability to disable user accounts.
-- Disabled users will be prevented from accessing the application.
--
-- Run this in the Supabase SQL Editor or via psql.
-- ============================================================

-- Add is_disabled column to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT false NOT NULL;

-- Add disabled_at timestamp column
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP WITH TIME ZONE;

-- Add disabled_by column to track which admin disabled the account
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Create index on is_disabled for performance (frequently queried)
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_disabled ON user_profiles(is_disabled);

-- Add comment explaining the columns
COMMENT ON COLUMN user_profiles.is_disabled IS 'Whether the user account is disabled';
COMMENT ON COLUMN user_profiles.disabled_at IS 'Timestamp when the account was disabled';
COMMENT ON COLUMN user_profiles.disabled_by IS 'Admin user who disabled the account';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify columns were added successfully

SELECT 'VERIFYING USER_PROFILES COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name IN ('is_disabled', 'disabled_at', 'disabled_by')
ORDER BY column_name;

SELECT 'MIGRATION COMPLETE!' AS status;

