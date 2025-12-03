-- Add MailTester enrichment fields to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS email_validity text,
ADD COLUMN IF NOT EXISTS mx_record text,
ADD COLUMN IF NOT EXISTS inbox_type text,
ADD COLUMN IF NOT EXISTS phone_numbers text[],
ADD COLUMN IF NOT EXISTS provider text,
ADD COLUMN IF NOT EXISTS linkedin_url text;
