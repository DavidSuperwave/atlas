-- Add real-time scraper state tracking fields to scrapes table
-- These fields allow users to see live progress of their scrape

ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS current_page integer DEFAULT 0;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS total_pages integer DEFAULT 1;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS scraper_status text DEFAULT 'queued';
-- scraper_status values: 'queued' | 'navigating' | 'extracting' | 'paginating' | 'completed' | 'failed'
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS rows_extracted integer DEFAULT 0;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS state_updated_at timestamptz;

-- Add comment for documentation
COMMENT ON COLUMN scrapes.scraper_status IS 'Real-time status: queued, navigating, extracting, paginating, completed, failed';
COMMENT ON COLUMN scrapes.current_page IS 'Current page being scraped (1-indexed)';
COMMENT ON COLUMN scrapes.total_pages IS 'Total pages to scrape';
COMMENT ON COLUMN scrapes.rows_extracted IS 'Number of leads extracted so far';
COMMENT ON COLUMN scrapes.state_updated_at IS 'Last time state was updated';












