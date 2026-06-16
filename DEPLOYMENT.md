# Deploying BRUTHA (Grok Agent)

BRUTHA is now **stateless**: auth, data (Postgres), file storage, and background
workers all live in **Supabase**. There is no SQLite file, no local upload
directory, and no in-process worker loop to keep alive — so it deploys cleanly to
any Node host **including Vercel** (the old "no Vercel" constraint is gone).

## 1. Provision Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema. Either:
   - **SQL Editor**: paste `supabase/APPLY_ALL.sql` and Run, **or**
   - **CLI**: `supabase link --project-ref <ref>` then `supabase db push`.
3. Store the service-role key in Vault so the worker-dispatch trigger can call
   the Edge Function (run once, in the SQL Editor):
   ```sql
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   > If you fork onto a different project, also update the hardcoded `edge_url`
   > in `public.dispatch_worker()` (migration 2) to your project URL.
4. Deploy the background-worker Edge Function and give it your Puter token:
   ```bash
   supabase functions deploy run-worker
   supabase secrets set PUTER_AUTH_TOKEN=***   # XAI_MODEL optional (x-ai/grok-4-1-fast)
   ```
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## 2. Configure the app environment

Copy `.env.example` to `.env.local` (local) or set these in your host's
dashboard. The first four are **required**:

| Var                              | Required | Notes                                              |
|----------------------------------|----------|----------------------------------------------------|
| `PUTER_AUTH_TOKEN`               | ✅       | Puter token — powers Grok inference (the agent won't run without it) |
| `NEXT_PUBLIC_SUPABASE_URL`       | ✅       | Project URL (Settings → API)                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | ✅       | Public anon/publishable key (RLS protects data)    |
| `SUPABASE_SERVICE_ROLE_KEY`      | ✅       | **Server-only**, bypasses RLS — never expose       |
| `NEXT_PUBLIC_AUTH_PROVIDERS`     | ⬜       | e.g. `github,google` to show OAuth buttons         |
| `XAI_MODEL`                      | ⬜       | Grok model via Puter; defaults to `x-ai/grok-4-1-fast` |
| `XAI_API_KEY`                    | ⬜       | Only needed to enable the image-generation tool    |
| `SMTP_*`                         | ⬜       | enables the email-sending tool                     |

> `.env.local` is gitignored and is **NOT** uploaded to any platform. Every var
> above must be set in the platform's dashboard/secrets.

## 3. Deploy the Next.js app

The app is a standard Next.js 16 server with no persistent-disk requirement.

- **Vercel / Netlify**: import the repo, set the env vars above, deploy.
- **Render / Railway / Fly / Docker**: the included `Dockerfile` and
  `docker-compose.yml` still work; no volume is needed anymore.

### Supabase Auth redirect URLs

In Supabase → Authentication → URL Configuration, set:
- **Site URL**: your deployed origin (e.g. `https://brutha.example.com`)
- **Redirect URLs**: add `<origin>/auth/callback`

For OAuth, enable the provider in the Supabase dashboard and set
`NEXT_PUBLIC_AUTH_PROVIDERS` so the buttons appear.

## Verifying a deploy

Sign in (email/password auto-creates an account), then:
```bash
# While signed in (cookies), the workers API returns the user's list:
curl -s https://YOUR_URL/api/workers          # expect {"workers":[]} for a new user
```
Ask BRUTHA to "save a note", then "search my notes" — data round-trips through
Supabase Postgres under Row Level Security. Ask it to do something "in the
background" to enqueue a worker; the `run-worker` Edge Function executes it and
the Workers panel updates live via Realtime.
