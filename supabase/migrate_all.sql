-- ============================================================
-- CONSOLIDATED MIGRATION SCRIPT
-- ============================================================
-- This script combines all pending migrations in the correct order.
-- Safe to run multiple times (uses IF NOT EXISTS clauses).
--
-- Run this in the Supabase SQL Editor or via psql.
--
-- Migration order:
-- 1. Credit System (creates user_profiles, adds user_id to scrapes/leads)
-- 2. Campaign Fields (adds name, tags to scrapes)
-- 3. Scraper Mode (adds scraper_mode to scrapes)
-- 4. GoLogin Profiles (creates gologin tables, adds gologin_profile_id to scrapes)
-- 5. Duplicate Tracking (adds is_duplicate, original_lead_id to leads, removes unique constraint)
-- ============================================================

-- ============================================================
-- PART 1: CREDIT SYSTEM
-- ============================================================
-- Source: add_credit_system.sql
-- Creates user_profiles table and adds user_id to scrapes/leads

-- Create users profile table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  credits_balance integer default 0 not null,
  is_admin boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create credit_transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references user_profiles(id) on delete cascade not null,
  amount integer not null, -- positive for top-ups, negative for usage
  type text not null check (type in ('topup', 'usage', 'refund')),
  description text,
  lead_id uuid references leads(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add user_id to scrapes table
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS user_id uuid references user_profiles(id) on delete set null;

-- Add user_id and credits_used to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS user_id uuid references user_profiles(id) on delete set null,
ADD COLUMN IF NOT EXISTS credits_used integer default 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_scrapes_user_id ON scrapes(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
DO $$ BEGIN
  CREATE POLICY "Users can view their own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own profile (except credits and admin)"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for credit_transactions
DO $$ BEGIN
  CREATE POLICY "Users can view their own transactions"
    ON credit_transactions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert transactions"
    ON credit_transactions FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for scrapes
DO $$ BEGIN
  CREATE POLICY "Users can view their own scrapes"
    ON scrapes FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all scrapes"
    ON scrapes FOR SELECT
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
  CREATE POLICY "Users can insert their own scrapes"
    ON scrapes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own scrapes"
    ON scrapes FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update all scrapes"
    ON scrapes FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for leads
DO $$ BEGIN
  CREATE POLICY "Users can view their own leads"
    ON leads FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can view all leads"
    ON leads FOR SELECT
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
  CREATE POLICY "Users can insert their own leads"
    ON leads FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own leads"
    ON leads FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update all leads"
    ON leads FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update credits balance (called by application)
CREATE OR REPLACE FUNCTION public.update_credits(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text default null,
  p_lead_id uuid default null
)
RETURNS integer AS $$
DECLARE
  new_balance integer;
BEGIN
  -- Update the balance
  UPDATE user_profiles 
  SET credits_balance = credits_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credits_balance INTO new_balance;
  
  -- Log the transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, lead_id)
  VALUES (p_user_id, p_amount, p_type, p_description, p_lead_id);
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART 2: CAMPAIGN FIELDS
-- ============================================================
-- Source: add_campaign_fields.sql
-- Adds name and tags columns to scrapes table

ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Create index on tags for faster filtering
CREATE INDEX IF NOT EXISTS idx_scrapes_tags ON scrapes USING GIN (tags);


-- ============================================================
-- PART 3: SCRAPER MODE
-- ============================================================
-- Source: add_scraper_mode.sql
-- Adds scraper_mode column to track which scraper was used

ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS scraper_mode TEXT;

COMMENT ON COLUMN scrapes.scraper_mode IS 'Scraper mode used: local, dolphin, or gologin';

-- Add api_key_used column to leads table for enrichment tracking
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS api_key_used TEXT;

COMMENT ON COLUMN leads.api_key_used IS 'Which API key was used for email verification';

-- Create index for querying by scraper mode
CREATE INDEX IF NOT EXISTS idx_scrapes_scraper_mode ON scrapes(scraper_mode);


-- ============================================================
-- PART 4: GOLOGIN PROFILES
-- ============================================================
-- Source: add_gologin_profiles.sql
-- Creates gologin profile management tables

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


-- ============================================================
-- PART 5: DUPLICATE TRACKING
-- ============================================================
-- Source: add_duplicate_tracking.sql
-- Allows duplicate leads and tracks them for analytics

-- Add columns to track duplicates
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS original_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

-- Drop the global unique constraint (try multiple common constraint names)
DO $$ 
BEGIN
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

-- Drop any unnamed unique constraint on these columns
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

-- Create index for efficient duplicate lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_leads_duplicate_lookup 
ON leads (LOWER(TRIM(first_name)), LOWER(TRIM(last_name)), LOWER(TRIM(company_name)));

-- Create index for original_lead_id for reverse lookups
CREATE INDEX IF NOT EXISTS idx_leads_original_lead_id ON leads(original_lead_id);

-- Create index for is_duplicate for filtering
CREATE INDEX IF NOT EXISTS idx_leads_is_duplicate ON leads(is_duplicate);

-- Add comments explaining the duplicate tracking system
COMMENT ON COLUMN leads.is_duplicate IS 'True if this lead was scraped when a lead with the same name/company already existed';
COMMENT ON COLUMN leads.original_lead_id IS 'References the original lead if this is a duplicate';


-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify all columns were added successfully

SELECT 'VERIFYING SCRAPES TABLE COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'scrapes' 
AND column_name IN ('user_id', 'name', 'tags', 'scraper_mode', 'gologin_profile_id')
ORDER BY column_name;

SELECT 'VERIFYING LEADS TABLE COLUMNS...' AS status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'leads' 
AND column_name IN ('user_id', 'credits_used', 'api_key_used', 'is_duplicate', 'original_lead_id')
ORDER BY column_name;

SELECT 'VERIFYING TABLES CREATED...' AS status;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_profiles', 'credit_transactions', 'gologin_profiles', 'user_gologin_profiles')
ORDER BY table_name;

SELECT 'MIGRATION COMPLETE!' AS status;

