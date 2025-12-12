-- GoLogin Multi-API Key Support
-- This migration adds support for multiple GoLogin API keys for horizontal scaling
-- 
-- Architecture:
-- - Multiple API keys can be stored in gologin_api_keys table
-- - Each profile belongs to one API key
-- - Each API key can have its own queue worker for parallel scraping
-- 
-- Safe to run multiple times (uses IF NOT EXISTS and DO blocks)

-- ============================================================================
-- NEW TABLE: gologin_api_keys
-- ============================================================================
-- Stores GoLogin API keys for multi-account support
CREATE TABLE IF NOT EXISTS gologin_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,                              -- Display name ("Production Key 1")
    api_token TEXT NOT NULL,                         -- The actual GoLogin API token
    is_active BOOLEAN DEFAULT true,                  -- Whether this key can be used
    is_default BOOLEAN DEFAULT false,                -- Only one key should be default
    max_concurrent_scrapes INTEGER DEFAULT 1,        -- How many scrapes can run on this key
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for finding active/default keys
CREATE INDEX IF NOT EXISTS idx_gologin_api_keys_active ON gologin_api_keys(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_gologin_api_keys_default ON gologin_api_keys(is_default) WHERE is_default = true;

-- Ensure only one default key (using partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gologin_api_keys_single_default 
ON gologin_api_keys(is_default) WHERE is_default = true;

-- ============================================================================
-- MODIFY TABLE: gologin_profiles
-- ============================================================================
-- Add api_key_id column to link profiles to their parent API key
ALTER TABLE gologin_profiles 
ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES gologin_api_keys(id) ON DELETE SET NULL;

-- Index for looking up profiles by API key
CREATE INDEX IF NOT EXISTS idx_gologin_profiles_api_key_id ON gologin_profiles(api_key_id);

-- ============================================================================
-- MODIFY TABLE: browser_sessions
-- ============================================================================
-- Add api_key_id column to track which API key a session is using
ALTER TABLE browser_sessions 
ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES gologin_api_keys(id) ON DELETE SET NULL;

-- Index for finding active sessions by API key
CREATE INDEX IF NOT EXISTS idx_browser_sessions_api_key_active 
ON browser_sessions(api_key_id, status) WHERE status = 'active';

-- ============================================================================
-- MODIFY TABLE: scrapes
-- ============================================================================
-- Add gologin_api_key_id column to track which API key was used for a scrape
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS gologin_api_key_id UUID REFERENCES gologin_api_keys(id) ON DELETE SET NULL;

-- ============================================================================
-- ROW LEVEL SECURITY: gologin_api_keys
-- ============================================================================
ALTER TABLE gologin_api_keys ENABLE ROW LEVEL SECURITY;

-- Admins can manage API keys
DO $$ BEGIN
  CREATE POLICY "Admins can manage gologin_api_keys" ON gologin_api_keys
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

-- Service role has full access (for backend operations)
DO $$ BEGIN
  CREATE POLICY "Service role full access to gologin_api_keys" ON gologin_api_keys
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_gologin_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_gologin_api_keys_updated_at ON gologin_api_keys;
CREATE TRIGGER update_gologin_api_keys_updated_at
    BEFORE UPDATE ON gologin_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_gologin_api_keys_updated_at();

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL ON gologin_api_keys TO authenticated;
GRANT ALL ON gologin_api_keys TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE gologin_api_keys IS 'Stores GoLogin API keys for multi-account horizontal scaling';
COMMENT ON COLUMN gologin_api_keys.api_token IS 'The GoLogin API token - keep secure';
COMMENT ON COLUMN gologin_api_keys.is_default IS 'Only one key can be default, used as fallback';
COMMENT ON COLUMN gologin_api_keys.max_concurrent_scrapes IS 'Limit concurrent scrapes per key (usually 1)';
COMMENT ON COLUMN gologin_profiles.api_key_id IS 'Which GoLogin API key this profile belongs to';
COMMENT ON COLUMN browser_sessions.api_key_id IS 'Which GoLogin API key this session is using';
COMMENT ON COLUMN scrapes.gologin_api_key_id IS 'Which GoLogin API key was used for this scrape';
