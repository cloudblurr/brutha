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
create policy "uploads: read own"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "uploads: insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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
