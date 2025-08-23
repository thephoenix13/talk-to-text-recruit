
-- 1) Create a profiles table to store the recruiter's phone number
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

-- 2) Enable Row Level Security
alter table public.profiles enable row level security;

-- 3) RLS policies: users can manage only their own profile
drop policy if exists "Profiles select own" on public.profiles;
create policy "Profiles select own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

drop policy if exists "Profiles delete own" on public.profiles;
create policy "Profiles delete own"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);
