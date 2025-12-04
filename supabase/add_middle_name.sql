-- Add middle_name column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS middle_name text;

