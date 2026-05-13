-- Optional: run this migration only if you want a public.profiles table
-- linked to auth.users (e.g. for display_name, avatar_url).
-- Basic auth works without this.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users can read and update their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Allow insert for the same user (e.g. on signup from app or trigger)
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Optional: trigger to create a profile row on signup (run as superuser / in dashboard)
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path = public
-- as $$
-- begin
--   insert into public.profiles (id, display_name)
--   values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
--   return new;
-- end;
-- $$;
-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row execute function public.handle_new_user();
