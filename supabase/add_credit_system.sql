-- Credit System Migration
-- Run this after the base schema.sql

-- Create users profile table (extends Supabase Auth)
create table if not exists user_profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  credits_balance integer default 0 not null,
  is_admin boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create credit_transactions table
create table if not exists credit_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references user_profiles(id) on delete cascade not null,
  amount integer not null, -- positive for top-ups, negative for usage
  type text not null check (type in ('topup', 'usage', 'refund')),
  description text,
  lead_id uuid references leads(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add user_id to scrapes table
alter table scrapes 
add column if not exists user_id uuid references user_profiles(id) on delete set null;

-- Add user_id and credits_used to leads table
alter table leads 
add column if not exists user_id uuid references user_profiles(id) on delete set null,
add column if not exists credits_used integer default 0;

-- Create indexes for performance
create index if not exists idx_credit_transactions_user_id on credit_transactions(user_id);
create index if not exists idx_credit_transactions_created_at on credit_transactions(created_at);
create index if not exists idx_scrapes_user_id on scrapes(user_id);
create index if not exists idx_leads_user_id on leads(user_id);

-- Enable Row Level Security
alter table user_profiles enable row level security;
alter table credit_transactions enable row level security;

-- RLS Policies for user_profiles
create policy "Users can view their own profile"
  on user_profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile (except credits and admin)"
  on user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- RLS Policies for credit_transactions
create policy "Users can view their own transactions"
  on credit_transactions for select
  using (auth.uid() = user_id);

-- Service role can insert transactions (for the credit system)
create policy "Service role can insert transactions"
  on credit_transactions for insert
  with check (true);

-- RLS Policies for scrapes (update existing)
create policy "Users can view their own scrapes"
  on scrapes for select
  using (auth.uid() = user_id);

create policy "Admins can view all scrapes"
  on scrapes for select
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

create policy "Users can insert their own scrapes"
  on scrapes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own scrapes"
  on scrapes for update
  using (auth.uid() = user_id);

create policy "Admins can update all scrapes"
  on scrapes for update
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

-- RLS Policies for leads (update existing)
create policy "Users can view their own leads"
  on leads for select
  using (auth.uid() = user_id);

create policy "Admins can view all leads"
  on leads for select
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

create policy "Users can insert their own leads"
  on leads for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own leads"
  on leads for update
  using (auth.uid() = user_id);

create policy "Admins can update all leads"
  on leads for update
  using (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
      and user_profiles.is_admin = true
    )
  );

-- Function to automatically create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile on user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update credits balance (called by application)
create or replace function public.update_credits(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text default null,
  p_lead_id uuid default null
)
returns integer as $$
declare
  new_balance integer;
begin
  -- Update the balance
  update user_profiles 
  set credits_balance = credits_balance + p_amount,
      updated_at = now()
  where id = p_user_id
  returning credits_balance into new_balance;
  
  -- Log the transaction
  insert into credit_transactions (user_id, amount, type, description, lead_id)
  values (p_user_id, p_amount, p_type, p_description, p_lead_id);
  
  return new_balance;
end;
$$ language plpgsql security definer;

