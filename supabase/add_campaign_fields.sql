-- Add campaign management fields to scrapes table
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE scrapes ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Create index on tags for faster filtering
CREATE INDEX IF NOT EXISTS idx_scrapes_tags ON scrapes USING GIN (tags);


