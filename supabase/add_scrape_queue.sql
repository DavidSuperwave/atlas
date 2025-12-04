-- Add scrape queue table for sequential scrape processing
-- This prevents concurrent scrapes which could cause:
-- 1. Multiple browser instances trying to start
-- 2. Apollo detection due to concurrent requests
-- 3. Race conditions with shared browser profile

-- Scrape Queue Table
CREATE TABLE IF NOT EXISTS scrape_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_id UUID REFERENCES scrapes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  priority INTEGER DEFAULT 0, -- Higher priority = processed first
  pages_scraped INTEGER DEFAULT 0,
  leads_found INTEGER DEFAULT 0
);

-- Index for efficient queue polling (get next pending scrape)
CREATE INDEX IF NOT EXISTS idx_scrape_queue_status_created 
  ON scrape_queue(status, priority DESC, created_at ASC) 
  WHERE status = 'pending';

-- Index for user's queue items
CREATE INDEX IF NOT EXISTS idx_scrape_queue_user 
  ON scrape_queue(user_id, created_at DESC);

-- Index for scrape lookup
CREATE INDEX IF NOT EXISTS idx_scrape_queue_scrape_id 
  ON scrape_queue(scrape_id);

-- Browser Sessions Table
-- Tracks who is currently using the browser (manual access or scraping)
CREATE TABLE IF NOT EXISTS browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT NOT NULL,
  user_id UUID,
  session_type TEXT NOT NULL, -- 'manual' or 'scrape'
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'error'
  remote_url TEXT, -- For manual sessions (remoteOrbitaUrl)
  ws_endpoint TEXT, -- For scrape sessions (WebSocket URL)
  scrape_id UUID REFERENCES scrapes(id) ON DELETE SET NULL, -- If scraping
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW() -- For detecting stale sessions
);

-- Index for finding active sessions
CREATE INDEX IF NOT EXISTS idx_browser_sessions_active 
  ON browser_sessions(profile_id, status) 
  WHERE status = 'active';

-- Index for user's sessions
CREATE INDEX IF NOT EXISTS idx_browser_sessions_user 
  ON browser_sessions(user_id, started_at DESC);

-- Function to clean up stale browser sessions (older than 30 minutes with no heartbeat)
CREATE OR REPLACE FUNCTION cleanup_stale_browser_sessions()
RETURNS INTEGER AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  UPDATE browser_sessions
  SET status = 'completed', ended_at = NOW()
  WHERE status = 'active'
    AND last_heartbeat < NOW() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for scrape_queue
ALTER TABLE scrape_queue ENABLE ROW LEVEL SECURITY;

-- Users can see their own queue items
CREATE POLICY "Users can view own queue items"
  ON scrape_queue FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own queue items (via API)
CREATE POLICY "Users can insert own queue items"
  ON scrape_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for queue processor)
CREATE POLICY "Service role full access to queue"
  ON scrape_queue FOR ALL
  USING (auth.role() = 'service_role');

-- Add RLS policies for browser_sessions
ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own sessions
CREATE POLICY "Users can view own browser sessions"
  ON browser_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access to browser sessions"
  ON browser_sessions FOR ALL
  USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON scrape_queue TO authenticated;
GRANT ALL ON scrape_queue TO service_role;
GRANT ALL ON browser_sessions TO authenticated;
GRANT ALL ON browser_sessions TO service_role;

-- Comment on tables
COMMENT ON TABLE scrape_queue IS 'Queue for sequential scrape processing - prevents concurrent scrapes';
COMMENT ON TABLE browser_sessions IS 'Tracks active browser sessions for conflict detection';

