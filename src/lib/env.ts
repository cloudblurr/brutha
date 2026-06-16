import { z } from "zod";

/**
 * Server environment validation (S5).
 *
 * Fail fast with a clear, actionable message when required configuration is
 * missing or malformed, instead of surfacing a confusing runtime error deep in
 * a request. Optional integrations (email, Temporal) are validated only for
 * shape, never required.
 */
const envSchema = z.object({
  // Required: the agent cannot run without an xAI key.
  XAI_API_KEY: z
    .string({ message: "XAI_API_KEY is required" })
    .min(1, "XAI_API_KEY must not be empty"),

  // Optional model + tuning knobs.
  XAI_MODEL: z.string().min(1).optional(),
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(100).optional(),
  AGENT_STEP_WARN: z.coerce.number().int().min(1).max(100).optional(),

  // Optional provider abstraction (route through any OpenAI-compatible API).
  AGENT_PROVIDER: z.enum(["xai", "openai-compatible"]).optional(),
  AGENT_MODEL: z.string().min(1).optional(),
  AGENT_BASE_URL: z.string().url().optional(),
  AGENT_API_KEY: z.string().optional(),
  AGENT_PERSONA: z.string().optional(),

  // Optional admin gate for /admin/tools + /api/tools.
  ADMIN_SECRET: z.string().optional(),

  // Optional email (SMTP). All-or-nothing is enforced softly by the tool.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  TEST_EMAIL_TO: z.string().optional(),

  // Optional Temporal durable execution.
  TEMPORAL_ADDRESS: z.string().optional(),
  TEMPORAL_NAMESPACE: z.string().optional(),
  TEMPORAL_API_KEY: z.string().optional(),
  TEMPORAL_TASK_QUEUE: z.string().optional(),
  AGENT_DURABLE: z.enum(["0", "1"]).optional(),

  // Optional authentication (Auth.js). All optional so the app runs with zero
  // config (dev credentials fallback). Set AUTH_SECRET in production.
  AUTH_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_ALLOW_DEV_LOGIN: z.enum(["0", "1"]).optional(),

  // Optional Web Push (installable-PWA notifications). When VAPID keys are set
  // the app can push reminders/alerts/worker-completion to subscribed devices;
  // without them the feature reports "not configured" and nothing else breaks.
  // Generate keys with: `npx tsx scripts/vapid-gen.ts` (or the /api/push route).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

/**
 * Validate `process.env` against the schema. Throws a descriptive error listing
 * every problem if validation fails. Result is cached after the first call.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill in the required values.`
    );
  }
  cached = parsed.data;
  return cached;
}

/**
 * Non-throwing check used by request handlers that want to return a clean HTTP
 * error instead of crashing. Returns the first error message, or null if valid.
 */
export function getEnvError(env: NodeJS.ProcessEnv = process.env): string | null {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) return null;
  const first = parsed.error.issues[0];
  return first ? `${first.path.join(".") || "env"}: ${first.message}` : "Invalid environment.";
}
