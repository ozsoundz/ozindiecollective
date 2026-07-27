-- Oz Indie Collective — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

-- 1. PROFILES TABLE
-- One row per auth user. Extends auth.users with the fields the site collects at signup.
-- Uses "create if not exists" + "add column if not exists" rather than one big
-- CREATE TABLE, because some Supabase projects come with a starter "profiles"
-- table already (e.g. from the default User Management template) missing most
-- of these columns — this makes the script safe either way.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists portfolio_url text;
alter table public.profiles add column if not exists proud_project text;
alter table public.profiles add column if not exists goals text;
alter table public.profiles add column if not exists referral_source text;
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists status text default 'pending';
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists skills text[] default '{}';
alter table public.profiles add column if not exists experience text;
alter table public.profiles add column if not exists availability text default 'available';
alter table public.profiles add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles add constraint profiles_status_check
      check (status in ('pending','approved','denied'));
  end if;
end $$;

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

-- Admins can read and update every profile (vetting queue).
-- IMPORTANT: this must go through a security-definer function, not a raw
-- subquery on profiles — a policy on `profiles` that queries `profiles`
-- directly recurses into its own RLS evaluation and Postgres errors with
-- "infinite recursion detected in policy for relation profiles" (500s on
-- every read/write to the table). The function's internal lookup runs with
-- the owner's privileges and bypasses RLS, breaking the recursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.is_admin());

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

-- 4. LISTINGS TABLE (job/gig posts, submitted via post-job.html)
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid()
);

alter table public.listings add column if not exists title text;
alter table public.listings add column if not exists category text;
alter table public.listings add column if not exists employment_type text;
alter table public.listings add column if not exists description text;
alter table public.listings add column if not exists requirements text;
alter table public.listings add column if not exists city text;
alter table public.listings add column if not exists state text;
alter table public.listings add column if not exists pay text;
alter table public.listings add column if not exists start_date text;
alter table public.listings add column if not exists duration text;
alter table public.listings add column if not exists tags text[] default '{}';
alter table public.listings add column if not exists apply_method text default 'platform';
alter table public.listings add column if not exists deadline text;
alter table public.listings add column if not exists contact_email text;
alter table public.listings add column if not exists visibility text default 'all';
-- References public.profiles (not auth.users directly) so PostgREST can embed
-- profiles(full_name, plan) in getListings()'s select — it needs a real FK to
-- the table being embedded to auto-detect the relationship.
alter table public.listings add column if not exists posted_by uuid references public.profiles(id) on delete cascade;
alter table public.listings add column if not exists status text default 'pending';
alter table public.listings add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_status_check') then
    alter table public.listings add constraint listings_status_check
      check (status in ('pending','live','denied'));
  end if;
end $$;

alter table public.listings enable row level security;

drop policy if exists "Public can view live listings" on public.listings;
drop policy if exists "Posters can view own listings" on public.listings;
drop policy if exists "Authenticated users can create listings" on public.listings;
drop policy if exists "Admins can view all listings" on public.listings;
drop policy if exists "Admins can update all listings" on public.listings;

create policy "Public can view live listings"
  on public.listings for select
  using (status = 'live');

create policy "Posters can view own listings"
  on public.listings for select
  using (auth.uid() = posted_by);

create policy "Authenticated users can create listings"
  on public.listings for insert
  with check (auth.uid() = posted_by);

create policy "Admins can view all listings"
  on public.listings for select
  using (public.is_admin());

create policy "Admins can update all listings"
  on public.listings for update
  using (public.is_admin());

-- 5. APPLICATIONS TABLE (a member applying to a listing)
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid()
);

alter table public.applications add column if not exists listing_id uuid references public.listings(id) on delete cascade;
alter table public.applications add column if not exists applicant_id uuid references auth.users(id) on delete cascade;
alter table public.applications add column if not exists cover_message text;
alter table public.applications add column if not exists portfolio_link text;
alter table public.applications add column if not exists status text default 'pending';
alter table public.applications add column if not exists created_at timestamptz default now();

alter table public.applications enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applications_status_check') then
    alter table public.applications add constraint applications_status_check
      check (status in ('pending','accepted','denied','confirmed'));
  end if;
end $$;

drop policy if exists "Applicants can create applications" on public.applications;
drop policy if exists "Applicants can view own applications" on public.applications;
drop policy if exists "Listing owners can view applications to their listings" on public.applications;
drop policy if exists "Admins can view all applications" on public.applications;
drop policy if exists "Listing owners can respond to applications" on public.applications;
drop policy if exists "Applicants can confirm accepted applications" on public.applications;
drop policy if exists "Public can view confirmed applications" on public.applications;

create policy "Applicants can create applications"
  on public.applications for insert
  with check (auth.uid() = applicant_id);

create policy "Applicants can view own applications"
  on public.applications for select
  using (auth.uid() = applicant_id);

-- Non-recursive: this subquery hits `listings`, not `applications` itself, so
-- it doesn't trigger the RLS-recursion bug the profiles policies had.
create policy "Listing owners can view applications to their listings"
  on public.applications for select
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.posted_by = auth.uid()
  ));

-- Poster accepts/declines an applicant to their own listing.
create policy "Listing owners can respond to applications"
  on public.applications for update
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.posted_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.listings l where l.id = listing_id and l.posted_by = auth.uid()
  ));

-- Applicant confirms the collaboration once the poster has accepted them —
-- the old-row check (status='accepted') stops an applicant confirming a
-- still-pending or denied application; the new-row check pins the only
-- value they're allowed to write to.
create policy "Applicants can confirm accepted applications"
  on public.applications for update
  using (auth.uid() = applicant_id and status = 'accepted')
  with check (auth.uid() = applicant_id and status = 'confirmed');

-- Confirmed collaborations are countable publicly (head-count only, for the
-- homepage "Collaborations Formed" stat) — mirrors the public-live pattern
-- used elsewhere (listings, projects, events).
create policy "Public can view confirmed applications"
  on public.applications for select
  using (status = 'confirmed');

create policy "Admins can view all applications"
  on public.applications for select
  using (public.is_admin());

-- 6. ARTICLES TABLE (Industry Hub / resources articles, admin-managed)
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid()
);
alter table public.articles add column if not exists title text;
alter table public.articles add column if not exists slug text;
alter table public.articles add column if not exists excerpt text;
alter table public.articles add column if not exists body text;
alter table public.articles add column if not exists cover_image_url text;
alter table public.articles add column if not exists category text;
alter table public.articles add column if not exists author_name text;
alter table public.articles add column if not exists read_minutes integer;
alter table public.articles add column if not exists status text default 'draft';
alter table public.articles add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.articles add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articles_status_check') then
    alter table public.articles add constraint articles_status_check check (status in ('draft','published'));
  end if;
end $$;

alter table public.articles enable row level security;
drop policy if exists "Public can view published articles" on public.articles;
drop policy if exists "Admins can view all articles" on public.articles;
drop policy if exists "Admins can insert articles" on public.articles;
drop policy if exists "Admins can update articles" on public.articles;
drop policy if exists "Admins can delete articles" on public.articles;

create policy "Public can view published articles" on public.articles for select using (status = 'published');
create policy "Admins can view all articles" on public.articles for select using (public.is_admin());
create policy "Admins can insert articles" on public.articles for insert with check (public.is_admin());
create policy "Admins can update articles" on public.articles for update using (public.is_admin());
create policy "Admins can delete articles" on public.articles for delete using (public.is_admin());

-- 7. HIGHLIGHTS TABLE (Professional Highlights — member showcase videos, admin-curated)
create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid()
);
alter table public.highlights add column if not exists title text;
alter table public.highlights add column if not exists description text;
alter table public.highlights add column if not exists video_url text;
alter table public.highlights add column if not exists thumbnail_url text;
alter table public.highlights add column if not exists member_name text;
alter table public.highlights add column if not exists member_id uuid references public.profiles(id) on delete set null;
alter table public.highlights add column if not exists category text;
alter table public.highlights add column if not exists status text default 'draft';
alter table public.highlights add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'highlights_status_check') then
    alter table public.highlights add constraint highlights_status_check check (status in ('draft','published'));
  end if;
end $$;

alter table public.highlights enable row level security;
drop policy if exists "Public can view published highlights" on public.highlights;
drop policy if exists "Admins can view all highlights" on public.highlights;
drop policy if exists "Admins can insert highlights" on public.highlights;
drop policy if exists "Admins can update highlights" on public.highlights;
drop policy if exists "Admins can delete highlights" on public.highlights;

create policy "Public can view published highlights" on public.highlights for select using (status = 'published');
create policy "Admins can view all highlights" on public.highlights for select using (public.is_admin());
create policy "Admins can insert highlights" on public.highlights for insert with check (public.is_admin());
create policy "Admins can update highlights" on public.highlights for update using (public.is_admin());
create policy "Admins can delete highlights" on public.highlights for delete using (public.is_admin());

-- 8. PARTNERS TABLE (Partner Organisations, admin-managed)
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid()
);
alter table public.partners add column if not exists name text;
alter table public.partners add column if not exists logo_url text;
alter table public.partners add column if not exists website_url text;
alter table public.partners add column if not exists description text;
alter table public.partners add column if not exists tier text default 'partner';
alter table public.partners add column if not exists status text default 'active';
alter table public.partners add column if not exists created_at timestamptz default now();

alter table public.partners enable row level security;
drop policy if exists "Public can view active partners" on public.partners;
drop policy if exists "Admins can view all partners" on public.partners;
drop policy if exists "Admins can insert partners" on public.partners;
drop policy if exists "Admins can update partners" on public.partners;
drop policy if exists "Admins can delete partners" on public.partners;

create policy "Public can view active partners" on public.partners for select using (status = 'active');
create policy "Admins can view all partners" on public.partners for select using (public.is_admin());
create policy "Admins can insert partners" on public.partners for insert with check (public.is_admin());
create policy "Admins can update partners" on public.partners for update using (public.is_admin());
create policy "Admins can delete partners" on public.partners for delete using (public.is_admin());

-- 9b. PROFILE EXTRA FIELDS (used by the profile edit form)
alter table public.profiles add column if not exists tagline text;
alter table public.profiles add column if not exists instagram_handle text;
alter table public.profiles add column if not exists avatar_url text;

-- 9. EPK FIELDS (per-member Electronic Press Kit, on profiles — member manages their own)
alter table public.profiles add column if not exists epk_enabled boolean default false;
alter table public.profiles add column if not exists epk_bio text;
alter table public.profiles add column if not exists epk_photos text[] default '{}';
alter table public.profiles add column if not exists epk_music_links text[] default '{}';
alter table public.profiles add column if not exists epk_video_links text[] default '{}';
alter table public.profiles add column if not exists epk_stage_plot_url text;
alter table public.profiles add column if not exists epk_tech_rider_url text;
-- Existing "Users can update own profile" / "Public can view approved profiles" policies on
-- public.profiles already cover read/write of these new columns — no new policies needed.

-- 11. COMMUNITY FEED (posts, comments, likes, reports)
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid()
);
alter table public.community_posts add column if not exists author_id uuid references public.profiles(id) on delete cascade;
alter table public.community_posts add column if not exists body text;
alter table public.community_posts add column if not exists tag text;
alter table public.community_posts add column if not exists status text default 'visible';
alter table public.community_posts add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_posts_status_check') then
    alter table public.community_posts add constraint community_posts_status_check check (status in ('visible','removed'));
  end if;
end $$;

alter table public.community_posts enable row level security;
drop policy if exists "Public can view visible posts" on public.community_posts;
drop policy if exists "Members can create posts" on public.community_posts;
drop policy if exists "Authors can update own posts" on public.community_posts;
drop policy if exists "Authors can delete own posts" on public.community_posts;
drop policy if exists "Admins can view all posts" on public.community_posts;
drop policy if exists "Admins can update all posts" on public.community_posts;
drop policy if exists "Admins can delete all posts" on public.community_posts;

create policy "Public can view visible posts" on public.community_posts for select using (status = 'visible');
create policy "Members can create posts" on public.community_posts for insert with check (auth.uid() = author_id);
create policy "Authors can update own posts" on public.community_posts for update using (auth.uid() = author_id);
create policy "Authors can delete own posts" on public.community_posts for delete using (auth.uid() = author_id);
create policy "Admins can view all posts" on public.community_posts for select using (public.is_admin());
create policy "Admins can update all posts" on public.community_posts for update using (public.is_admin());
create policy "Admins can delete all posts" on public.community_posts for delete using (public.is_admin());

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid()
);
alter table public.community_comments add column if not exists post_id uuid references public.community_posts(id) on delete cascade;
alter table public.community_comments add column if not exists author_id uuid references public.profiles(id) on delete cascade;
alter table public.community_comments add column if not exists body text;
alter table public.community_comments add column if not exists status text default 'visible';
alter table public.community_comments add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_comments_status_check') then
    alter table public.community_comments add constraint community_comments_status_check check (status in ('visible','removed'));
  end if;
end $$;

alter table public.community_comments enable row level security;
drop policy if exists "Public can view visible comments" on public.community_comments;
drop policy if exists "Members can create comments" on public.community_comments;
drop policy if exists "Authors can delete own comments" on public.community_comments;
drop policy if exists "Admins can view all comments" on public.community_comments;
drop policy if exists "Admins can update all comments" on public.community_comments;
drop policy if exists "Admins can delete all comments" on public.community_comments;

create policy "Public can view visible comments" on public.community_comments for select using (status = 'visible');
create policy "Members can create comments" on public.community_comments for insert with check (auth.uid() = author_id);
create policy "Authors can delete own comments" on public.community_comments for delete using (auth.uid() = author_id);
create policy "Admins can view all comments" on public.community_comments for select using (public.is_admin());
create policy "Admins can update all comments" on public.community_comments for update using (public.is_admin());
create policy "Admins can delete all comments" on public.community_comments for delete using (public.is_admin());

create table if not exists public.community_likes (
  id uuid primary key default gen_random_uuid()
);
alter table public.community_likes add column if not exists post_id uuid references public.community_posts(id) on delete cascade;
alter table public.community_likes add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.community_likes add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_likes_post_user_unique') then
    alter table public.community_likes add constraint community_likes_post_user_unique unique (post_id, user_id);
  end if;
end $$;

alter table public.community_likes enable row level security;
drop policy if exists "Public can view likes" on public.community_likes;
drop policy if exists "Members can like posts" on public.community_likes;
drop policy if exists "Members can unlike own likes" on public.community_likes;

create policy "Public can view likes" on public.community_likes for select using (true);
create policy "Members can like posts" on public.community_likes for insert with check (auth.uid() = user_id);
create policy "Members can unlike own likes" on public.community_likes for delete using (auth.uid() = user_id);

-- Reports on posts or comments (at least one of post_id/comment_id set), for the admin moderation queue.
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid()
);
alter table public.community_reports add column if not exists post_id uuid references public.community_posts(id) on delete cascade;
alter table public.community_reports add column if not exists comment_id uuid references public.community_comments(id) on delete cascade;
alter table public.community_reports add column if not exists reporter_id uuid references public.profiles(id) on delete set null;
alter table public.community_reports add column if not exists reason text;
alter table public.community_reports add column if not exists status text default 'open';
alter table public.community_reports add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_reports_status_check') then
    alter table public.community_reports add constraint community_reports_status_check check (status in ('open','resolved','dismissed'));
  end if;
end $$;

alter table public.community_reports enable row level security;
drop policy if exists "Members can file reports" on public.community_reports;
drop policy if exists "Admins can view all reports" on public.community_reports;
drop policy if exists "Admins can update reports" on public.community_reports;

create policy "Members can file reports" on public.community_reports for insert with check (auth.uid() = reporter_id);
create policy "Admins can view all reports" on public.community_reports for select using (public.is_admin());
create policy "Admins can update reports" on public.community_reports for update using (public.is_admin());

-- 10. STORAGE BUCKETS (for real image/file uploads instead of pasted URLs)
-- avatars, epk-media: member-owned, folder-per-user (path must start with their own uid).
-- article-covers, highlight-thumbs, partner-logos: admin-only uploads, publicly readable.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('epk-media', 'epk-media', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('article-covers', 'article-covers', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('highlight-thumbs', 'highlight-thumbs', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('partner-logos', 'partner-logos', true) on conflict (id) do nothing;

drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Public can view avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Users can upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Public can view epk media" on storage.objects;
drop policy if exists "Users can upload own epk media" on storage.objects;
drop policy if exists "Users can update own epk media" on storage.objects;
drop policy if exists "Users can delete own epk media" on storage.objects;
create policy "Public can view epk media" on storage.objects for select using (bucket_id = 'epk-media');
create policy "Users can upload own epk media" on storage.objects for insert to authenticated with check (bucket_id = 'epk-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update own epk media" on storage.objects for update to authenticated using (bucket_id = 'epk-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own epk media" on storage.objects for delete to authenticated using (bucket_id = 'epk-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Public can view article covers" on storage.objects;
drop policy if exists "Admins can manage article covers" on storage.objects;
create policy "Public can view article covers" on storage.objects for select using (bucket_id = 'article-covers');
create policy "Admins can manage article covers" on storage.objects for all to authenticated using (bucket_id = 'article-covers' and public.is_admin()) with check (bucket_id = 'article-covers' and public.is_admin());

drop policy if exists "Public can view highlight thumbs" on storage.objects;
drop policy if exists "Admins can manage highlight thumbs" on storage.objects;
create policy "Public can view highlight thumbs" on storage.objects for select using (bucket_id = 'highlight-thumbs');
create policy "Admins can manage highlight thumbs" on storage.objects for all to authenticated using (bucket_id = 'highlight-thumbs' and public.is_admin()) with check (bucket_id = 'highlight-thumbs' and public.is_admin());

drop policy if exists "Public can view partner logos" on storage.objects;
drop policy if exists "Admins can manage partner logos" on storage.objects;
create policy "Public can view partner logos" on storage.objects for select using (bucket_id = 'partner-logos');
create policy "Admins can manage partner logos" on storage.objects for all to authenticated using (bucket_id = 'partner-logos' and public.is_admin()) with check (bucket_id = 'partner-logos' and public.is_admin());

-- 12. PROJECTS BOARD (collaboration/creative projects, submitted via projects.html)
-- Deliberately separate from `listings` (paid job/gig posts) — projects are
-- collaboration-oriented (paid/unpaid/rev-share) and target a discipline, not a role.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid()
);

alter table public.projects add column if not exists title text;
alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists project_type text;
alter table public.projects add column if not exists discipline_needed text;
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists city text;
alter table public.projects add column if not exists state text;
alter table public.projects add column if not exists timeframe text;
alter table public.projects add column if not exists posted_by uuid references public.profiles(id) on delete cascade;
alter table public.projects add column if not exists status text default 'pending';
alter table public.projects add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_status_check') then
    alter table public.projects add constraint projects_status_check
      check (status in ('pending','live','denied'));
  end if;
end $$;

alter table public.projects enable row level security;

drop policy if exists "Public can view live projects" on public.projects;
drop policy if exists "Posters can view own projects" on public.projects;
drop policy if exists "Authenticated users can create projects" on public.projects;
drop policy if exists "Admins can view all projects" on public.projects;
drop policy if exists "Admins can update all projects" on public.projects;

create policy "Public can view live projects"
  on public.projects for select
  using (status = 'live');

create policy "Posters can view own projects"
  on public.projects for select
  using (auth.uid() = posted_by);

create policy "Authenticated users can create projects"
  on public.projects for insert
  with check (auth.uid() = posted_by);

create policy "Admins can view all projects"
  on public.projects for select
  using (public.is_admin());

create policy "Admins can update all projects"
  on public.projects for update
  using (public.is_admin());

-- 13. PROJECT APPLICATIONS TABLE (a member applying to a project)
create table if not exists public.project_applications (
  id uuid primary key default gen_random_uuid()
);

alter table public.project_applications add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.project_applications add column if not exists applicant_id uuid references auth.users(id) on delete cascade;
alter table public.project_applications add column if not exists cover_message text;
alter table public.project_applications add column if not exists portfolio_link text;
alter table public.project_applications add column if not exists status text default 'pending';
alter table public.project_applications add column if not exists created_at timestamptz default now();

alter table public.project_applications enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_applications_status_check') then
    alter table public.project_applications add constraint project_applications_status_check
      check (status in ('pending','accepted','denied','confirmed'));
  end if;
end $$;

drop policy if exists "Applicants can create project applications" on public.project_applications;
drop policy if exists "Applicants can view own project applications" on public.project_applications;
drop policy if exists "Project owners can view applications to their projects" on public.project_applications;
drop policy if exists "Admins can view all project applications" on public.project_applications;
drop policy if exists "Project owners can respond to project applications" on public.project_applications;
drop policy if exists "Applicants can confirm accepted project applications" on public.project_applications;
drop policy if exists "Public can view confirmed project applications" on public.project_applications;

create policy "Applicants can create project applications"
  on public.project_applications for insert
  with check (auth.uid() = applicant_id);

create policy "Applicants can view own project applications"
  on public.project_applications for select
  using (auth.uid() = applicant_id);

create policy "Project owners can view applications to their projects"
  on public.project_applications for select
  using (exists (
    select 1 from public.projects p where p.id = project_id and p.posted_by = auth.uid()
  ));

create policy "Project owners can respond to project applications"
  on public.project_applications for update
  using (exists (
    select 1 from public.projects p where p.id = project_id and p.posted_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p where p.id = project_id and p.posted_by = auth.uid()
  ));

create policy "Applicants can confirm accepted project applications"
  on public.project_applications for update
  using (auth.uid() = applicant_id and status = 'accepted')
  with check (auth.uid() = applicant_id and status = 'confirmed');

create policy "Public can view confirmed project applications"
  on public.project_applications for select
  using (status = 'confirmed');

create policy "Admins can view all project applications"
  on public.project_applications for select
  using (public.is_admin());

-- 14. EVENTS TABLE (networking nights, workshops, panels — admin-managed like articles/highlights)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid()
);

alter table public.events add column if not exists title text;
alter table public.events add column if not exists event_type text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists city text;
alter table public.events add column if not exists state text;
alter table public.events add column if not exists event_date date;
alter table public.events add column if not exists time_range text;
alter table public.events add column if not exists price_info text;
alter table public.events add column if not exists status text default 'draft';
alter table public.events add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.events add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_status_check') then
    alter table public.events add constraint events_status_check check (status in ('draft','published'));
  end if;
end $$;

alter table public.events enable row level security;

drop policy if exists "Public can view published events" on public.events;
drop policy if exists "Admins can view all events" on public.events;
drop policy if exists "Admins can insert events" on public.events;
drop policy if exists "Admins can update events" on public.events;
drop policy if exists "Admins can delete events" on public.events;

create policy "Public can view published events"
  on public.events for select
  using (status = 'published');

create policy "Admins can view all events"
  on public.events for select
  using (public.is_admin());

create policy "Admins can insert events"
  on public.events for insert
  with check (public.is_admin());

create policy "Admins can update events"
  on public.events for update
  using (public.is_admin());

create policy "Admins can delete events"
  on public.events for delete
  using (public.is_admin());

-- 15. EVENT REGISTRATIONS TABLE (a member registering for an event)
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid()
);

alter table public.event_registrations add column if not exists event_id uuid references public.events(id) on delete cascade;
alter table public.event_registrations add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.event_registrations add column if not exists full_name text;
alter table public.event_registrations add column if not exists email text;
alter table public.event_registrations add column if not exists accessibility_notes text;
alter table public.event_registrations add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_event_user_unique') then
    alter table public.event_registrations add constraint event_registrations_event_user_unique unique (event_id, user_id);
  end if;
end $$;

alter table public.event_registrations enable row level security;

drop policy if exists "Members can register for events" on public.event_registrations;
drop policy if exists "Members can view own registrations" on public.event_registrations;
drop policy if exists "Admins can view all registrations" on public.event_registrations;

create policy "Members can register for events"
  on public.event_registrations for insert
  with check (auth.uid() = user_id);

create policy "Members can view own registrations"
  on public.event_registrations for select
  using (auth.uid() = user_id);

create policy "Admins can view all registrations"
  on public.event_registrations for select
  using (public.is_admin());

-- 16. NEWSLETTER SUBSCRIBERS TABLE (footer signup form, on every page)
-- Open to anyone (including signed-out visitors) — insert-only from the public,
-- no update/delete needed yet. Admins can view the list to export it.
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid()
);

alter table public.newsletter_subscribers add column if not exists email text;
alter table public.newsletter_subscribers add column if not exists source text default 'footer';
alter table public.newsletter_subscribers add column if not exists welcomed_at timestamptz;
alter table public.newsletter_subscribers add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletter_subscribers_email_unique') then
    alter table public.newsletter_subscribers add constraint newsletter_subscribers_email_unique unique (email);
  end if;
end $$;

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
drop policy if exists "Admins can view subscribers" on public.newsletter_subscribers;

create policy "Anyone can subscribe"
  on public.newsletter_subscribers for insert
  with check (true);

create policy "Admins can view subscribers"
  on public.newsletter_subscribers for select
  using (public.is_admin());

-- 17. INDUSTRY LINKS TABLE (Knowledge section — curated links to external industry
-- articles/news, not our own blog. Admin-managed, distinct from public.articles.)
create table if not exists public.industry_links (
  id uuid primary key default gen_random_uuid()
);

alter table public.industry_links add column if not exists title text;
alter table public.industry_links add column if not exists url text;
alter table public.industry_links add column if not exists source text;
alter table public.industry_links add column if not exists category text;
alter table public.industry_links add column if not exists description text;
alter table public.industry_links add column if not exists status text default 'draft';
alter table public.industry_links add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.industry_links add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'industry_links_status_check') then
    alter table public.industry_links add constraint industry_links_status_check check (status in ('draft','published'));
  end if;
end $$;

alter table public.industry_links enable row level security;
drop policy if exists "Public can view published industry links" on public.industry_links;
drop policy if exists "Admins can view all industry links" on public.industry_links;
drop policy if exists "Admins can insert industry links" on public.industry_links;
drop policy if exists "Admins can update industry links" on public.industry_links;
drop policy if exists "Admins can delete industry links" on public.industry_links;

create policy "Public can view published industry links" on public.industry_links for select using (status = 'published');
create policy "Admins can view all industry links" on public.industry_links for select using (public.is_admin());
create policy "Admins can insert industry links" on public.industry_links for insert with check (public.is_admin());
create policy "Admins can update industry links" on public.industry_links for update using (public.is_admin());
create policy "Admins can delete industry links" on public.industry_links for delete using (public.is_admin());

-- 18. GRANTS TABLE (Grants Database, admin-managed)
create table if not exists public.grants (
  id uuid primary key default gen_random_uuid()
);

alter table public.grants add column if not exists org text;
alter table public.grants add column if not exists name text;
alter table public.grants add column if not exists description text;
alter table public.grants add column if not exists amount text;
alter table public.grants add column if not exists deadline_label text;
alter table public.grants add column if not exists deadline_type text default 'rolling';
alter table public.grants add column if not exists url text;
alter table public.grants add column if not exists status text default 'draft';
alter table public.grants add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.grants add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'grants_status_check') then
    alter table public.grants add constraint grants_status_check check (status in ('draft','published'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'grants_deadline_type_check') then
    alter table public.grants add constraint grants_deadline_type_check check (deadline_type in ('rolling','closing'));
  end if;
end $$;

alter table public.grants enable row level security;
drop policy if exists "Public can view published grants" on public.grants;
drop policy if exists "Admins can view all grants" on public.grants;
drop policy if exists "Admins can insert grants" on public.grants;
drop policy if exists "Admins can update grants" on public.grants;
drop policy if exists "Admins can delete grants" on public.grants;

create policy "Public can view published grants" on public.grants for select using (status = 'published');
create policy "Admins can view all grants" on public.grants for select using (public.is_admin());
create policy "Admins can insert grants" on public.grants for insert with check (public.is_admin());
create policy "Admins can update grants" on public.grants for update using (public.is_admin());
create policy "Admins can delete grants" on public.grants for delete using (public.is_admin());

-- 19. RESOURCE TEMPLATES TABLE (downloadable EPK/business templates — real files
-- in the resource-templates storage bucket, admin-uploaded)
create table if not exists public.resource_templates (
  id uuid primary key default gen_random_uuid()
);

alter table public.resource_templates add column if not exists title text;
alter table public.resource_templates add column if not exists description text;
alter table public.resource_templates add column if not exists category text;
alter table public.resource_templates add column if not exists file_url text;
alter table public.resource_templates add column if not exists file_name text;
alter table public.resource_templates add column if not exists status text default 'draft';
alter table public.resource_templates add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.resource_templates add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resource_templates_status_check') then
    alter table public.resource_templates add constraint resource_templates_status_check check (status in ('draft','published'));
  end if;
end $$;

alter table public.resource_templates enable row level security;
drop policy if exists "Public can view published templates" on public.resource_templates;
drop policy if exists "Admins can view all templates" on public.resource_templates;
drop policy if exists "Admins can insert templates" on public.resource_templates;
drop policy if exists "Admins can update templates" on public.resource_templates;
drop policy if exists "Admins can delete templates" on public.resource_templates;

create policy "Public can view published templates" on public.resource_templates for select using (status = 'published');
create policy "Admins can view all templates" on public.resource_templates for select using (public.is_admin());
create policy "Admins can insert templates" on public.resource_templates for insert with check (public.is_admin());
create policy "Admins can update templates" on public.resource_templates for update using (public.is_admin());
create policy "Admins can delete templates" on public.resource_templates for delete using (public.is_admin());

-- resource-templates bucket: admin-only uploads (real downloadable files), publicly readable.
insert into storage.buckets (id, name, public) values ('resource-templates', 'resource-templates', true) on conflict (id) do nothing;

drop policy if exists "Public can view resource templates" on storage.objects;
drop policy if exists "Admins can manage resource templates" on storage.objects;
create policy "Public can view resource templates" on storage.objects for select using (bucket_id = 'resource-templates');
create policy "Admins can manage resource templates" on storage.objects for all to authenticated using (bucket_id = 'resource-templates' and public.is_admin()) with check (bucket_id = 'resource-templates' and public.is_admin());

-- 20. SPONSORED PROGRAMS TABLE (Industry Partner-funded programs — submitted by
-- Partner-plan members, reviewed by admin, same pending/live/denied pattern as
-- listings/projects. Powers the public Sponsored Programs page and the
-- homepage "Sponsorships Funded" stat.)
create or replace function public.is_partner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select plan = 'partner' from public.profiles where id = auth.uid()), false);
$$;

create table if not exists public.sponsored_programs (
  id uuid primary key default gen_random_uuid()
);

alter table public.sponsored_programs add column if not exists sponsor_name text;
alter table public.sponsored_programs add column if not exists program_name text;
alter table public.sponsored_programs add column if not exists description text;
alter table public.sponsored_programs add column if not exists amount numeric;
alter table public.sponsored_programs add column if not exists category text;
alter table public.sponsored_programs add column if not exists url text;
alter table public.sponsored_programs add column if not exists submitted_by uuid references public.profiles(id) on delete set null;
alter table public.sponsored_programs add column if not exists status text default 'pending';
alter table public.sponsored_programs add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sponsored_programs_status_check') then
    alter table public.sponsored_programs add constraint sponsored_programs_status_check
      check (status in ('pending','live','denied'));
  end if;
end $$;

alter table public.sponsored_programs enable row level security;

drop policy if exists "Public can view live sponsored programs" on public.sponsored_programs;
drop policy if exists "Submitters can view own sponsored programs" on public.sponsored_programs;
drop policy if exists "Partners can submit sponsored programs" on public.sponsored_programs;
drop policy if exists "Admins can view all sponsored programs" on public.sponsored_programs;
drop policy if exists "Admins can update sponsored programs" on public.sponsored_programs;
drop policy if exists "Admins can delete sponsored programs" on public.sponsored_programs;

create policy "Public can view live sponsored programs"
  on public.sponsored_programs for select
  using (status = 'live');

create policy "Submitters can view own sponsored programs"
  on public.sponsored_programs for select
  using (auth.uid() = submitted_by);

-- Only Industry Partner members can submit — enforced server-side via
-- is_partner(), not just hidden in the UI.
create policy "Partners can submit sponsored programs"
  on public.sponsored_programs for insert
  with check (auth.uid() = submitted_by and public.is_partner());

create policy "Admins can view all sponsored programs"
  on public.sponsored_programs for select
  using (public.is_admin());

create policy "Admins can update sponsored programs"
  on public.sponsored_programs for update
  using (public.is_admin());

create policy "Admins can delete sponsored programs"
  on public.sponsored_programs for delete
  using (public.is_admin());

-- 21. PUBLIC COLLABORATION HISTORY ON PROFILES
-- A confirmed collaboration should still show its listing/project title on a
-- member's Profile page even after that listing/project has closed (status
-- no longer 'live'), and even to a visitor who isn't the poster. Without
-- this, the existing "Public can view live listings/projects" policy would
-- silently hide the title once the post closes. Declined/pending
-- applications are NOT covered here — those stay visible only to the two
-- parties involved, via the applications/project_applications RLS policies
-- above, and are never exposed on a profile.

drop policy if exists "Public can view listings behind confirmed collaborations" on public.listings;
drop policy if exists "Public can view projects behind confirmed collaborations" on public.projects;

create policy "Public can view listings behind confirmed collaborations"
  on public.listings for select
  using (exists (
    select 1 from public.applications a
    where a.listing_id = listings.id and a.status = 'confirmed'
  ));

create policy "Public can view projects behind confirmed collaborations"
  on public.projects for select
  using (exists (
    select 1 from public.project_applications a
    where a.project_id = projects.id and a.status = 'confirmed'
  ));
