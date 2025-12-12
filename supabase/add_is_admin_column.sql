-- ============================================================
-- ADD IS_ADMIN COLUMN TO USER_PROFILES
-- ============================================================
-- Run this FIRST if your user_profiles table doesn't have is_admin
-- ============================================================

-- Add is_admin column if it doesn't exist
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN user_profiles.is_admin IS 'Whether the user has admin privileges';

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin) WHERE is_admin = true;

-- Verification
SELECT 'VERIFYING IS_ADMIN COLUMN...' AS status;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name = 'is_admin';

SELECT 'IS_ADMIN COLUMN MIGRATION COMPLETE!' AS status;









