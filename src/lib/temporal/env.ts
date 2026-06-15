/**
 * Temporal connection configuration.
 *
 * All connection details come from the environment so that NOTHING secret is
 * committed to the repo. The Temporal Cloud API key in particular must only
 * ever be supplied via `.env.local` / process env — never hard-coded.
 *
 * Supported env vars:
 *   TEMPORAL_ADDRESS    - host:port of the namespace gRPC endpoint
 *                         e.g. brutha.m7tl8.tmprl.cloud:7233
 *   TEMPORAL_NAMESPACE  - the namespace, e.g. brutha.m7tl8
 *   TEMPORAL_API_KEY    - Temporal Cloud API key (JWT). SECRET. Never commit.
 *   TEMPORAL_TASK_QUEUE - task queue name (default: brutha-agent)
 *   TEMPORAL_TLS        - "true" to force TLS even without an API key
 *                         (Cloud requires TLS; local dev server does not)
 */

export interface TemporalEnv {
  address: string;
  namespace: string;
  apiKey?: string;
  taskQueue: string;
  /** Whether the connection should use TLS. */
  tls: boolean;
  /** True when pointed at Temporal Cloud (api key present). */
  isCloud: boolean;
}

export const DEFAULT_TASK_QUEUE = "brutha-agent";

/**
 * Read and validate Temporal connection settings from the environment.
 * Falls back to a local dev server (localhost:7233 / "default") when no
 * Cloud address is configured.
 */
export function getTemporalEnv(): TemporalEnv {
  const apiKey = process.env.TEMPORAL_API_KEY?.trim() || undefined;
  const address =
    process.env.TEMPORAL_ADDRESS?.trim() || "localhost:7233";
  const namespace =
    process.env.TEMPORAL_NAMESPACE?.trim() || "default";
  const taskQueue =
    process.env.TEMPORAL_TASK_QUEUE?.trim() || DEFAULT_TASK_QUEUE;

  const isCloud = Boolean(apiKey);
  // Cloud always needs TLS; otherwise honor TEMPORAL_TLS, default off for local.
  const tls =
    isCloud || process.env.TEMPORAL_TLS?.trim().toLowerCase() === "true";

  return { address, namespace, apiKey, taskQueue, tls, isCloud };
}

/**
 * Human-readable summary of the connection target with the secret REDACTED.
 * Safe to log.
 */
export function describeTemporalEnv(env: TemporalEnv = getTemporalEnv()): string {
  return [
    `address=${env.address}`,
    `namespace=${env.namespace}`,
    `taskQueue=${env.taskQueue}`,
    `tls=${env.tls}`,
    `mode=${env.isCloud ? "cloud" : "local"}`,
    `apiKey=${env.apiKey ? "<set>" : "<none>"}`,
  ].join(" ");
}
