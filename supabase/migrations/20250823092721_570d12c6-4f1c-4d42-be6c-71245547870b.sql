
-- Enable gen_random_uuid if not already enabled
create extension if not exists "pgcrypto";

-- Reusable updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Candidates table
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null, -- do not FK to auth.users per best practices
  full_name text not null,
  phone text not null,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger candidates_set_updated_at
before update on public.candidates
for each row execute function public.set_updated_at();

-- Calls table
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null, -- owner of the call
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  twilio_call_sid text unique, -- populated after initiating the call
  status text not null default 'initiated', -- initiated | ringing | in-progress | completed | failed | no-answer | busy | canceled
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text, -- secure URL to the audio
  transcript text, -- full transcript
  summary text, -- optional GPT summary
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calls_candidate_id_idx on public.calls(candidate_id);
create index if not exists calls_recruiter_id_idx on public.calls(recruiter_id);
create index if not exists calls_twilio_call_sid_idx on public.calls(twilio_call_sid);

create trigger calls_set_updated_at
before update on public.calls
for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.candidates enable row level security;
alter table public.calls enable row level security;

-- Candidates policies (owner = recruiter_id)
drop policy if exists "Candidates select own" on public.candidates;
create policy "Candidates select own"
  on public.candidates
  for select
  using (recruiter_id = auth.uid());

drop policy if exists "Candidates insert own" on public.candidates;
create policy "Candidates insert own"
  on public.candidates
  for insert
  with check (recruiter_id = auth.uid());

drop policy if exists "Candidates update own" on public.candidates;
create policy "Candidates update own"
  on public.candidates
  for update
  using (recruiter_id = auth.uid());

drop policy if exists "Candidates delete own" on public.candidates;
create policy "Candidates delete own"
  on public.candidates
  for delete
  using (recruiter_id = auth.uid());

-- Calls policies (owner = recruiter_id)
drop policy if exists "Calls select own" on public.calls;
create policy "Calls select own"
  on public.calls
  for select
  using (recruiter_id = auth.uid());

drop policy if exists "Calls insert own" on public.calls;
create policy "Calls insert own"
  on public.calls
  for insert
  with check (recruiter_id = auth.uid());

drop policy if exists "Calls update own" on public.calls;
create policy "Calls update own"
  on public.calls
  for update
  using (recruiter_id = auth.uid());

drop policy if exists "Calls delete own" on public.calls;
create policy "Calls delete own"
  on public.calls
  for delete
  using (recruiter_id = auth.uid());
