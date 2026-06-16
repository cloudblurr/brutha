import { getDb } from "@/lib/db";
import { isTemporalEnabled } from "@/lib/temporal/run";
import { getEnvError } from "@/lib/env";
import { withTimeout } from "@/lib/tools/_reliability";

export const runtime = "nodejs";
// Always evaluate fresh; never cache a health probe.
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe.
 *
 * Checks the moving parts a deployment depends on and returns a structured
 * health map. Overall status is:
 *   - "ok"        all checks pass
 *   - "degraded"  a non-critical dependency is down (e.g. an external API)
 *   - "error"     a critical dependency is down (env invalid / SQLite)
 *
 * HTTP status mirrors criticality: 200 for ok/degraded, 503 for error, so a
 * load balancer can route on it while a transient external-API blip doesn't
 * take the instance out of rotation.
 */

type CheckStatus = "ok" | "degraded" | "error" | "skipped";

interface Check {
  status: CheckStatus;
  detail?: string;
  latencyMs?: number;
}

async function timed(fn: () => Promise<void>, ms: number): Promise<Check> {
  const start = Date.now();
  try {
    await withTimeout(fn(), ms);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

function checkEnv(): Check {
  const err = getEnvError();
  return err ? { status: "error", detail: err } : { status: "ok" };
}

function checkSqlite(): Check {
  const start = Date.now();
  try {
    const row = getDb().prepare("SELECT 1 AS ok").get() as { ok?: number } | undefined;
    if (row?.ok !== 1) throw new Error("unexpected SQLite response");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "error",
      detail: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkExternal(name: string, url: string): Promise<Check> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "BRUTHA-health/1.0" },
    });
    return res.ok
      ? { status: "ok", latencyMs: Date.now() - start }
      : { status: "degraded", detail: `${name} HTTP ${res.status}`, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "degraded",
      detail: e instanceof Error ? (e.name === "TimeoutError" ? "timed out" : e.message) : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkTemporal(): Promise<Check> {
  if (!isTemporalEnabled()) return { status: "skipped", detail: "not configured" };
  // Lazy import so the Temporal SDK isn't pulled in when durable mode is off.
  const { createTemporalClient } = await import("@/lib/temporal/client");
  return timed(async () => {
    const { connection } = await createTemporalClient();
    await connection.close();
  }, 4000);
}

export async function GET() {
  const env = checkEnv();
  const sqlite = checkSqlite();
  const [temporal, openMeteo, wikipedia] = await Promise.all([
    checkTemporal(),
    checkExternal("open-meteo", "https://geocoding-api.open-meteo.com/v1/search?name=london&count=1"),
    checkExternal("wikipedia", "https://en.wikipedia.org/api/rest_v1/page/summary/Test"),
  ]);

  const checks = { env, sqlite, temporal, openMeteo, wikipedia } as const;

  const hasCriticalError = env.status === "error" || sqlite.status === "error" || temporal.status === "error";
  const hasDegraded = Object.values(checks).some((c) => c.status === "degraded");

  const status: "ok" | "degraded" | "error" = hasCriticalError
    ? "error"
    : hasDegraded
      ? "degraded"
      : "ok";

  return new Response(
    JSON.stringify({ status, time: new Date().toISOString(), checks }, null, 2),
    {
      status: status === "error" ? 503 : 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    }
  );
}
