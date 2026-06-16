// BRUTHA — run-worker Edge Function (Deno / Supabase Functions).
//
// Triggered by the `workers_dispatch` Postgres trigger (or invoked manually)
// with a JSON body `{ "workerId": "<uuid>" }`. It executes the queued worker's
// task against xAI's Grok served via Puter.js (OpenAI-compatible API), updating
// progress on the row and writing the final result (or error) so the UI — which
// subscribes via Realtime — reflects completion.
//
// Runs with the service-role key (bypasses RLS) so it can update any worker
// row, but it always preserves each worker's `owner`. Deploy with:
//   supabase functions deploy run-worker
// and set the secrets:
//   supabase secrets set PUTER_AUTH_TOKEN=... XAI_MODEL=x-ai/grok-4-1-fast
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by the
// platform at runtime.

import { createClient } from "jsr:@supabase/supabase-js@2";

interface WorkerRow {
  id: string;
  owner: string;
  title: string;
  task: string;
  status: string;
}

// Grok via Puter's OpenAI-compatible endpoint.
const PUTER_BASE = "https://api.puter.com/puterai/openai/v1";

Deno.serve(async (req) => {
  let workerId: string | undefined;
  try {
    const body = await req.json();
    workerId = body?.workerId;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!workerId) return json({ error: "Missing workerId." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const puterToken = Deno.env.get("PUTER_AUTH_TOKEN");
  const model = Deno.env.get("XAI_MODEL") ?? "x-ai/grok-4-1-fast";

  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase env not configured." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load the worker. Only proceed if it's still queued (idempotency guard).
  const { data: worker, error: loadErr } = await admin
    .from("workers")
    .select("id, owner, title, task, status")
    .eq("id", workerId)
    .maybeSingle<WorkerRow>();

  if (loadErr || !worker) {
    return json({ error: `Worker ${workerId} not found.` }, 404);
  }
  if (worker.status !== "queued") {
    return json({ ok: true, skipped: `status=${worker.status}` }, 200);
  }

  await admin
    .from("workers")
    .update({ status: "running", progress: "Starting…" })
    .eq("id", worker.id);

  if (!puterToken) {
    await admin
      .from("workers")
      .update({
        status: "error",
        error: "PUTER_AUTH_TOKEN is not configured for the run-worker function.",
        progress: null,
      })
      .eq("id", worker.id);
    return json({ error: "PUTER_AUTH_TOKEN not set." }, 500);
  }

  try {
    await admin
      .from("workers")
      .update({ progress: "Thinking…" })
      .eq("id", worker.id);

    const res = await fetch(`${PUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${puterToken}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are BRUTHA, a capable AI assistant running a background job. " +
              "Complete the user's task thoroughly and return a clear, self-contained result.",
          },
          { role: "user", content: worker.task },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Puter/Grok API ${res.status}: ${detail.slice(0, 500)}`);
    }

    const data = await res.json();
    const text: string =
      data?.choices?.[0]?.message?.content?.trim() || "(no output)";

    await admin
      .from("workers")
      .update({ status: "done", result: text, progress: null, error: null })
      .eq("id", worker.id);

    return json({ ok: true, id: worker.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin
      .from("workers")
      .update({ status: "error", error: message, progress: null })
      .eq("id", worker.id);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
