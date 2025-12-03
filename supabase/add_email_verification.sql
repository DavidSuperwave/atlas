-- Email Verification System Migration
-- Run this after the credit system migration

-- Create email_verification_jobs table
create table if not exists email_verification_jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references user_profiles(id) on delete cascade not null,
  filename text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  total_emails integer not null default 0,
  processed_emails integer not null default 0,
  valid_count integer not null default 0,
  catchall_count integer not null default 0,
  invalid_count integer not null default 0,
  credits_used integer not null default 0,
  remove_duplicates boolean not null default true,
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone
);

-- Create email_verification_results table
create table if not exists email_verification_results (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references email_verification_jobs(id) on delete cascade not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'valid', 'catchall', 'invalid', 'error')),
  mx_record text,
  message text,
  code text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  verified_at timestamp with time zone
);

-- Create indexes for performance
create index if not exists idx_email_verification_jobs_user_id on email_verification_jobs(user_id);
create index if not exists idx_email_verification_jobs_status on email_verification_jobs(status);
create index if not exists idx_email_verification_jobs_created_at on email_verification_jobs(created_at);
create index if not exists idx_email_verification_results_job_id on email_verification_results(job_id);
create index if not exists idx_email_verification_results_status on email_verification_results(status);

-- Enable Row Level Security
alter table email_verification_jobs enable row level security;
alter table email_verification_results enable row level security;

-- RLS Policies for email_verification_jobs
create policy "Users can view their own verification jobs"
  on email_verification_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own verification jobs"
  on email_verification_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own verification jobs"
  on email_verification_jobs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own verification jobs"
  on email_verification_jobs for delete
  using (auth.uid() = user_id);

-- RLS Policies for email_verification_results
create policy "Users can view results for their own jobs"
  on email_verification_results for select
  using (
    exists (
      select 1 from email_verification_jobs
      where email_verification_jobs.id = email_verification_results.job_id
      and email_verification_jobs.user_id = auth.uid()
    )
  );

create policy "Users can insert results for their own jobs"
  on email_verification_results for insert
  with check (
    exists (
      select 1 from email_verification_jobs
      where email_verification_jobs.id = email_verification_results.job_id
      and email_verification_jobs.user_id = auth.uid()
    )
  );

create policy "Users can update results for their own jobs"
  on email_verification_results for update
  using (
    exists (
      select 1 from email_verification_jobs
      where email_verification_jobs.id = email_verification_results.job_id
      and email_verification_jobs.user_id = auth.uid()
    )
  );

-- Function to update job stats when results change
create or replace function update_verification_job_stats()
returns trigger as $$
begin
  update email_verification_jobs
  set 
    processed_emails = (
      select count(*) from email_verification_results 
      where job_id = NEW.job_id and status != 'pending'
    ),
    valid_count = (
      select count(*) from email_verification_results 
      where job_id = NEW.job_id and status = 'valid'
    ),
    catchall_count = (
      select count(*) from email_verification_results 
      where job_id = NEW.job_id and status = 'catchall'
    ),
    invalid_count = (
      select count(*) from email_verification_results 
      where job_id = NEW.job_id and status = 'invalid'
    ),
    updated_at = now()
  where id = NEW.job_id;
  
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger to update stats when results are updated
drop trigger if exists on_verification_result_update on email_verification_results;
create trigger on_verification_result_update
  after update on email_verification_results
  for each row
  when (OLD.status is distinct from NEW.status)
  execute procedure update_verification_job_stats();


