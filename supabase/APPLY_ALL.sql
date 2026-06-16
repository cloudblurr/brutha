-- BRUTHA — combined Supabase schema (run once in the SQL Editor).
-- Project: lthswvnveoazzwqkgimc
-- Paste into Supabase Dashboard > SQL Editor > New query > Run.
-- After applying, store the service-role key in Vault:
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- Then deploy the Edge Function:  supabase functions deploy run-worker

-- ====== 20260616000001_initial_schema.sql ======
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
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'workers'
  ) then
    alter publication supabase_realtime add table public.workers;
  end if;
end $$;

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


-- ====== 20260616000002_storage_and_dispatch.sql ======
-- ============================================================================
-- BRUTHA — Storage bucket + worker dispatch trigger
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Storage: a single private "uploads" bucket. Files are namespaced per user as
-- `<user_id>/<uuid>__<safeName>` so RLS can scope access by the first path
-- segment. Replaces the old ./data/uploads local filesystem.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  15728640, -- 15 MB, matches MAX_UPLOAD_BYTES
  array[
    'image/png','image/jpeg','image/webp','image/gif',
    'application/pdf','text/plain','text/markdown','text/csv',
    'application/json','text/html','text/xml','application/xml',
    'text/javascript','application/javascript','text/x-python'
  ]
)
on conflict (id) do nothing;

-- RLS on storage.objects: a user may read/write/delete only objects whose first
-- path segment equals their user id.
drop policy if exists "uploads: read own" on storage.objects;
create policy "uploads: read own"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "uploads: insert own" on storage.objects;
create policy "uploads: insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "uploads: delete own" on storage.objects;
create policy "uploads: delete own"
  on storage.objects for delete
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Worker dispatch: when a worker row is INSERTed (status 'queued'), call the
-- run-worker Edge Function over HTTP so the job executes serverlessly. This is
-- the Supabase-native replacement for Temporal/setImmediate.
--
-- Requires the pg_net extension (available on Supabase). The service-role key
-- is read from Supabase Vault (managed Postgres roles cannot set custom GUCs
-- via ALTER DATABASE, so the older app.settings.* approach is not usable on
-- hosted projects). Store the key once with:
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- The project URL is not secret, so it is hardcoded below — update it if you
-- fork this schema onto a different Supabase project.
-- ----------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.dispatch_worker()
returns trigger
language plpgsql
security definer set search_path = public, extensions, vault
as $$
declare
  edge_url text := 'https://lthswvnveoazzwqkgimc.supabase.co';
  svc_key  text;
begin
  select decrypted_secret into svc_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if svc_key is null then
    -- Not configured (e.g. local without the vault secret). Leave the row
    -- queued; it can be picked up manually or by `supabase functions serve`.
    -- Don't fail the insert.
    raise notice 'dispatch_worker: vault secret service_role_key missing; worker % left queued', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := edge_url || '/functions/v1/run-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := jsonb_build_object('workerId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists workers_dispatch on public.workers;
create trigger workers_dispatch
  after insert on public.workers
  for each row
  when (new.status = 'queued')
  execute function public.dispatch_worker();

-- ----------------------------------------------------------------------------
-- Full-text search RPC for notes (scoped by RLS automatically). Lets the app
-- run a ranked websearch query without embedding SQL in the client.
-- ----------------------------------------------------------------------------
create or replace function public.search_notes(q text, max_results int default 10)
returns table (id bigint, title text, content text, created_at timestamptz)
language sql stable
as $$
  select n.id, n.title, n.content, n.created_at
  from public.notes n
  where n.owner = auth.uid()
    and n.search @@ websearch_to_tsquery('english', q)
  order by ts_rank(n.search, websearch_to_tsquery('english', q)) desc
  limit greatest(1, max_results);
$$;

