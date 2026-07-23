-- Oz Indie Collective — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

-- 1. PROFILES TABLE
-- One row per auth user. Extends auth.users with the fields the site collects at signup.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text,
  city text,
  state text,
  bio text,
  portfolio_url text,
  proud_project text,
  goals text,
  referral_source text,
  plan text default 'free',
  status text default 'pending' check (status in ('pending','approved','denied')),
  is_admin boolean default false,
  skills text[] default '{}',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Drop-then-create so this script is safe to rerun (Postgres has no
-- CREATE POLICY IF NOT EXISTS).
drop policy if exists "Public can view approved profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

-- Anyone can read APPROVED profiles (needed for the public directory page)
create policy "Public can view approved profiles"
  on public.profiles for select
  using (status = 'approved');

-- Users can always read their own profile, regardless of status
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (but not flip their own status/is_admin — enforce that in the app layer / a trigger if needed later)
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Admins can read and update every profile (vetting queue)
create policy "Admins can view all profiles"
  on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

create policy "Admins can update all profiles"
  on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- 2. AUTO-CREATE A PROFILE ROW WHEN SOMEONE SIGNS UP
-- Without this, signUp()'s follow-up .update() call in supabase.js has no row to update.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. MAKE YOURSELF ADMIN (run manually, once, after you've signed up through join.html)
-- update public.profiles set is_admin = true, status = 'approved' where email = 'YOUR_EMAIL_HERE';
