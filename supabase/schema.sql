-- Create scrapes table
create table if not exists scrapes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  url text not null,
  status text not null default 'pending', -- pending, running, completed, failed
  filters jsonb,
  total_leads integer default 0,
  error_details jsonb -- Store error information when scrape fails
);

-- Create leads table
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  scrape_id uuid references scrapes(id),
  first_name text,
  last_name text,
  email text,
  title text,
  company_name text,
  company_linkedin text,
  location text,
  company_size text,
  industry text,
  website text,
  keywords text[],
  verification_status text default 'pending', -- pending, valid, catchall, invalid
  verification_data jsonb,
  unique(first_name, last_name, company_name) -- Prevent duplicates
);
