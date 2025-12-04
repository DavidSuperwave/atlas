-- ============================================================
-- USER APPROVAL SYSTEM MIGRATION
-- ============================================================
-- This script adds approval functionality to user accounts.
-- Users must be approved by an admin before they can access the platform.
--
-- Run this in the Supabase SQL Editor or via psql.
-- ============================================================

-- Add is_approved column to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- Add approved_at timestamp column
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Add approved_by column to track which admin approved the user
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Create index on is_approved for performance (frequently queried in middleware)
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_approved ON user_profiles(is_approved);

-- Add comments explaining the columns
COMMENT ON COLUMN user_profiles.is_approved IS 'Whether the user account has been approved by an admin';
COMMENT ON COLUMN user_profiles.approved_at IS 'Timestamp when the account was approved';
COMMENT ON COLUMN user_profiles.approved_by IS 'Admin user who approved the account';

-- ============================================================
-- AUTO-APPROVE EXISTING USERS
-- ============================================================
-- Grandfather in all existing users who have completed onboarding

UPDATE user_profiles 
SET is_approved = true, 
    approved_at = COALESCE(onboarding_completed_at, created_at, NOW())
WHERE onboarding_completed = true 
  AND is_approved IS NOT TRUE;

-- Also approve any users who were created before the onboarding system
-- (they wouldn't have onboarding_completed set but should still be approved)
UPDATE user_profiles 
SET is_approved = true, 
    approved_at = COALESCE(created_at, NOW())
WHERE onboarding_completed IS NULL 
  AND is_approved IS NOT TRUE
  AND created_at < NOW() - INTERVAL '1 day';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify columns were added successfully

SELECT 'VERIFYING USER_PROFILES APPROVAL COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name IN ('is_approved', 'approved_at', 'approved_by')
ORDER BY column_name;

SELECT 'CHECKING APPROVAL STATUS...' AS status;
SELECT 
    COUNT(*) FILTER (WHERE is_approved = true) AS approved_users,
    COUNT(*) FILTER (WHERE is_approved = false OR is_approved IS NULL) AS pending_users,
    COUNT(*) AS total_users
FROM user_profiles;

SELECT 'MIGRATION COMPLETE!' AS status;

