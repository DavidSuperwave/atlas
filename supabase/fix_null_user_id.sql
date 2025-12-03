-- Migration to fix RLS security issue with null user_id records
-- This migration updates the RLS policies and handles existing null user_id records

-- ============================================================================
-- STEP 1: Drop existing policies that allow null user_id access
-- ============================================================================

-- Drop old scrapes policies
drop policy if exists "Users can view their own scrapes" on scrapes;
drop policy if exists "Users can insert their own scrapes" on scrapes;
drop policy if exists "Users can update their own scrapes" on scrapes;

-- Drop old leads policies
drop policy if exists "Users can view their own leads" on leads;
drop policy if exists "Users can insert their own leads" on leads;
drop policy if exists "Users can update their own leads" on leads;

-- ============================================================================
-- STEP 2: Enable RLS on scrapes and leads if not already enabled
-- ============================================================================

alter table scrapes enable row level security;
alter table leads enable row level security;

-- ============================================================================
-- STEP 3: Create new secure RLS policies for scrapes
-- ============================================================================

-- Users can only view their own scrapes (no null user_id access)
create policy "Users can view their own scrapes"
  on scrapes for select
  using (auth.uid() = user_id);

-- Admins can view all scrapes (including those with null user_id)
create policy "Admins can view all scrapes"
  on scrapes for select
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

-- Users can insert their own scrapes
create policy "Users can insert their own scrapes"
  on scrapes for insert
  with check (auth.uid() = user_id);

-- Users can update their own scrapes
create policy "Users can update their own scrapes"
  on scrapes for update
  using (auth.uid() = user_id);

-- Admins can update all scrapes
create policy "Admins can update all scrapes"
  on scrapes for update
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

-- ============================================================================
-- STEP 4: Create new secure RLS policies for leads
-- ============================================================================

-- Users can only view their own leads (no null user_id access)
create policy "Users can view their own leads"
  on leads for select
  using (auth.uid() = user_id);

-- Admins can view all leads (including those with null user_id)
create policy "Admins can view all leads"
  on leads for select
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

-- Users can insert their own leads
create policy "Users can insert their own leads"
  on leads for insert
  with check (auth.uid() = user_id);

-- Users can update their own leads
create policy "Users can update their own leads"
  on leads for update
  using (auth.uid() = user_id);

-- Admins can update all leads
create policy "Admins can update all leads"
  on leads for update
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

-- ============================================================================
-- STEP 5: Handle existing null user_id records
-- ============================================================================

-- Option A: Assign null user_id scrapes/leads to a specific admin user
-- Assigning to admin user: 41c8872d-5b2d-4895-a968-db027e7f1ae4

UPDATE scrapes 
SET user_id = '41c8872d-5b2d-4895-a968-db027e7f1ae4'
WHERE user_id IS NULL;

UPDATE leads 
SET user_id = '41c8872d-5b2d-4895-a968-db027e7f1ae4'
WHERE user_id IS NULL;

-- Option B: Delete orphaned records (use with caution!)
-- Uncomment if you want to delete records with null user_id:
--
-- DELETE FROM leads WHERE user_id IS NULL;
-- DELETE FROM scrapes WHERE user_id IS NULL;

-- Option C: Keep null user_id records (only visible to admins via admin policy)
-- This is the default behavior with the new policies above.
-- Admins can see all records, regular users only see their own.

-- ============================================================================
-- VERIFICATION QUERIES (run these to check the state of your data)
-- ============================================================================

-- Check how many scrapes have null user_id:
-- SELECT COUNT(*) as null_user_scrapes FROM scrapes WHERE user_id IS NULL;

-- Check how many leads have null user_id:
-- SELECT COUNT(*) as null_user_leads FROM leads WHERE user_id IS NULL;

-- List scrapes with null user_id:
-- SELECT id, url, status, created_at FROM scrapes WHERE user_id IS NULL;

