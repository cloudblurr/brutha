-- ============================================================================
-- BRUTHA — initial Supabase schema
-- ============================================================================
-- Replaces the old local SQLite store (contacts / notes / tasks / settings /
-- workers / users). Everything is now Postgres with Row Level Security so each
-- signed-in user can only ever see and mutate their own rows. Auth itself is
-- handled by Supabase Auth (auth.users); we mirror the minimal public profile
-- into public.profiles.
--
-- Per-user ownership: every data table has an `owner` uuid column that defaults
-- to auth.uid(). RLS policies enforce `owner = auth.uid()`. This is the direct
-- replacement for the old text `scope` column.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles — public mirror of auth.users (name, avatar). Auto-provisioned by a
-- trigger on auth.users insert so a row always exists for a signed-in user.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Provision a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- contacts
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists contacts_owner_idx on public.contacts (owner);

alter table public.contacts enable row level security;
drop policy if exists "contacts: all own" on public.contacts;
create policy "contacts: all own" on public.contacts
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- ----------------------------------------------------------------------------
-- notes — with Postgres full-text search (replaces SQLite FTS5)
-- ----------------------------------------------------------------------------
create table if not exists public.notes (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text,
  content    text not null,
  search     tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now()
);
create index if not exists notes_owner_idx  on public.notes (owner);
create index if not exists notes_search_idx on public.notes using gin (search);

alter table public.notes enable row level security;
drop policy if exists "notes: all own" on public.notes;
create policy "notes: all own" on public.notes
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- ----------------------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task       text not null,
  due        text,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tasks_owner_idx on public.tasks (owner);

alter table public.tasks enable row level security;
drop policy if exists "tasks: all own" on public.tasks;
create policy "tasks: all own" on public.tasks
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- ----------------------------------------------------------------------------
-- settings — per-user key/value (e.g. email.from identity)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null,
  value      text not null,
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);

alter table public.settings enable row level security;
drop policy if exists "settings: all own" on public.settings;
create policy "settings: all own" on public.settings
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- ----------------------------------------------------------------------------
-- workers — background agent jobs (replaces Temporal durable workflows).
-- A row inserted with status 'queued' triggers the run-worker Edge Function
-- (see the http trigger below), which executes the agent and writes the result
-- back. The UI subscribes to changes via Supabase Realtime.
-- ----------------------------------------------------------------------------
create table if not exists public.workers (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  task       text not null,
  status     text not null default 'queued'
             check (status in ('queued', 'running', 'done', 'error')),
  result     text,
  error      text,
  progress   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workers_owner_status_idx on public.workers (owner, status);

alter table public.workers enable row level security;
-- Owners can see / create / delete their own workers. Status/result updates are
-- written by the Edge Function using the service-role key (which bypasses RLS),
-- so no broad UPDATE policy is granted to end users.
drop policy if exists "workers: read own" on public.workers;
create policy "workers: read own" on public.workers
  for select using (owner = auth.uid());
drop policy if exists "workers: insert own" on public.workers;
create policy "workers: insert own" on public.workers
  for insert with check (owner = auth.uid());
drop policy if exists "workers: delete own" on public.workers;
create policy "workers: delete own" on public.workers
  for delete using (owner = auth.uid());

-- Make workers part of the Realtime publication so the panel gets live updates.
alter publication supabase_realtime add table public.workers;

-- keep updated_at fresh on any update
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists workers_touch on public.workers;
create trigger workers_touch before update on public.workers
  for each row execute function public.touch_updated_at();
