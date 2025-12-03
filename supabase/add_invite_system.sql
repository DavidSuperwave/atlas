-- ============================================================
-- INVITE SYSTEM MIGRATION
-- ============================================================
-- This script adds tables for invite-only authentication system
-- and access request management.
--
-- Run this in the Supabase SQL Editor or via psql.
-- ============================================================

-- Create invites table for admin-sent invitations
CREATE TABLE IF NOT EXISTS invites (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  token text not null unique,
  invited_by uuid references user_profiles(id) on delete set null,
  used_at timestamp with time zone,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);

-- Create access_requests table for landing page form submissions
CREATE TABLE IF NOT EXISTS access_requests (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  intent text,
  telegram_username text,
  wants_immediate_start boolean default false,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references user_profiles(id) on delete set null,
  reviewed_at timestamp with time zone,
  invite_id uuid references invites(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for access_requests
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON access_requests(created_at);

-- Enable Row Level Security
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invites
-- Only admins can view/manage invites
DO $$ BEGIN
  CREATE POLICY "Admins can view all invites"
    ON invites FOR SELECT
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
  CREATE POLICY "Admins can insert invites"
    ON invites FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can update invites"
    ON invites FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can manage invites (for API routes)
DO $$ BEGIN
  CREATE POLICY "Service role can manage invites"
    ON invites FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for access_requests
-- Anyone can submit access requests (public insert)
DO $$ BEGIN
  CREATE POLICY "Anyone can submit access requests"
    ON access_requests FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only admins can view access requests
DO $$ BEGIN
  CREATE POLICY "Admins can view all access requests"
    ON access_requests FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can update access requests
DO $$ BEGIN
  CREATE POLICY "Admins can update access requests"
    ON access_requests FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can manage access requests (for API routes)
DO $$ BEGIN
  CREATE POLICY "Service role can manage access requests"
    ON access_requests FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comment explaining the tables
COMMENT ON TABLE invites IS 'Stores admin-sent invitations for new users';
COMMENT ON TABLE access_requests IS 'Stores access request submissions from landing page';

