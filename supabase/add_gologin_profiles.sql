-- GoLogin Multi-Profile Support
-- This migration adds support for multiple GoLogin profiles with admin-managed assignments
-- 
-- Safe to run multiple times (uses IF NOT EXISTS and DO blocks for policies)

-- Table to store GoLogin profiles
CREATE TABLE IF NOT EXISTS gologin_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE, -- GoLogin profile ID from GoLogin dashboard
    name TEXT NOT NULL, -- Display name for the profile
    description TEXT, -- Optional description (e.g., "Client A Apollo Account")
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table to map users to profiles (one profile per user)
CREATE TABLE IF NOT EXISTS user_gologin_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES gologin_profiles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id), -- Admin who assigned it
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id) -- One profile per user
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_gologin_profiles_user_id ON user_gologin_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_gologin_profiles_profile_id ON user_gologin_profiles(profile_id);
CREATE INDEX IF NOT EXISTS idx_gologin_profiles_profile_id ON gologin_profiles(profile_id);

-- Enable RLS
ALTER TABLE gologin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_gologin_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gologin_profiles
-- Uses DO blocks to handle re-runs gracefully
DO $$ BEGIN
  CREATE POLICY "Admins can manage gologin_profiles" ON gologin_profiles
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view active profiles" ON gologin_profiles
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND is_active = true
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for user_gologin_profiles
DO $$ BEGIN
  CREATE POLICY "Admins can manage user_gologin_profiles" ON user_gologin_profiles
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own profile assignment" ON user_gologin_profiles
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_gologin_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_gologin_profiles_updated_at ON gologin_profiles;
CREATE TRIGGER update_gologin_profiles_updated_at
    BEFORE UPDATE ON gologin_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_gologin_profiles_updated_at();

-- Add gologin_profile_id column to scrapes table to track which profile was used
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS gologin_profile_id UUID REFERENCES gologin_profiles(id);
