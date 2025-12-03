-- Add error_details column to scrapes table for storing failure information
ALTER TABLE scrapes 
ADD COLUMN IF NOT EXISTS error_details jsonb;


