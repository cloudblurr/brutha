# Deploying BRUTHA (Grok Agent)

## ⚠️ Why NOT Vercel
This app is a **stateful, long-lived Node server**:
- `better-sqlite3` writes the database to `./data/agent.db`
- file uploads + generated images are written to `./data/uploads`
- `instrumentation.ts` resumes background workers on boot
- in-process workers run after the HTTP response is sent

Vercel serverless functions have a **read-only filesystem** (only `/tmp`, which
is ephemeral and per-invocation) and **no long-lived process**. So on Vercel,
every route that touches the DB returns **500**:
`/api/workers`, `/api/settings/email`, `/api/upload`, plus anything using
contacts/notes/tasks. This is the cause of the 500s seen on the Vercel link.

Fix = deploy on a platform with a persistent disk + a real server process.

---

## Option A — Render (recommended, Blueprint included)
1. Push this repo to GitHub (already on `cloudblurr/grok-agent`).
2. Render dashboard → **New → Blueprint** → select the repo. It reads
   `render.yaml` (Docker runtime + a 5 GB persistent disk mounted at
   `/app/data` + auto-generated `AUTH_SECRET`).
3. Set the one secret it can't generate: **`XAI_API_KEY`** (dashboard → the
   service → Environment).
4. Deploy. First boot runs DB migrations automatically (schema v5).
5. App is at `https://brutha.onrender.com` (or your chosen name).

The persistent disk at `/app/data` is the whole trick — it keeps the SQLite DB
and uploads across restarts/redeploys. Without it they'd reset every deploy.

> Note: Render's **free** tier has no persistent disk; you need **Starter**
> ($7/mo) or higher for the disk. Free web services also cold-start/sleep.

---

## Option B — Railway
1. Railway → New Project → Deploy from GitHub repo.
2. It detects the Dockerfile. Add a **Volume** mounted at `/app/data`.
3. Variables: set `XAI_API_KEY` and `AUTH_SECRET` (generate with
   `openssl rand -base64 32`). Optionally `XAI_MODEL=grok-3`.
4. Deploy. Railway gives you a public URL.

---

## Option C — Fly.io
1. `fly launch` (uses the Dockerfile). Decline the managed Postgres prompt.
2. Create a volume: `fly volumes create brutha_data --size 5`.
3. In `fly.toml`, mount it:
   ```toml
   [mounts]
     source = "brutha_data"
     destination = "/app/data"
   ```
4. Secrets: `fly secrets set XAI_API_KEY=... AUTH_SECRET=$(openssl rand -base64 32)`.
5. `fly deploy`.

---

## Option D — Any VM / Docker host (most control)
```bash
# On the server, with the repo checked out:
export XAI_API_KEY=your-key
docker compose up -d --build       # uses docker-compose.yml (named volume brutha-data)
```
`docker-compose.yml` already mounts a persistent volume at `/app/data`.

---

## Required environment variables (all platforms)
| Var            | Required | Notes |
|----------------|----------|-------|
| `XAI_API_KEY`  | ✅       | xAI key — the agent won't run without it |
| `AUTH_SECRET`  | ✅       | `openssl rand -base64 32` (Render auto-generates) |
| `AUTH_TRUST_HOST` | ✅ on most PaaS | set `true` so Auth.js trusts the proxy host |
| `XAI_MODEL`    | ⬜       | defaults to `grok-3` |
| `AUTH_URL`     | ⬜       | pin to your deploy URL if OAuth redirects misbehave |
| `AUTH_GITHUB_ID/SECRET`, `AUTH_GOOGLE_ID/SECRET` | ⬜ | enable OAuth; otherwise email/password works |
| `SMTP_*`       | ⬜       | enable the email-sending tool |

> Local `.env.local` is gitignored and is **NOT** uploaded to any platform.
> Every var above must be set in the platform's dashboard/secrets.

## Verifying a deploy
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR_URL/api/workers
# expect 200 with {"workers":[]}  (NOT 500)
curl -s https://YOUR_URL/api/settings/email
# expect 200 JSON
```
If these are 200, the persistent-disk + env-var setup is correct.
