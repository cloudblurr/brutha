import { z } from "zod";

/**
 * Server environment validation.
 *
 * Fail fast with a clear, actionable message when required configuration is
 * missing or malformed, instead of surfacing a confusing runtime error deep in
 * a request. Optional integrations (email) are validated only for shape.
 *
 * Required:
 *   PUTER_AUTH_TOKEN                 — Puter account token; powers Grok inference.
 *   NEXT_PUBLIC_SUPABASE_URL         — Supabase project URL.
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY    — Supabase anon/public key.
 *
 * Server-only Supabase keys (SUPABASE_SERVICE_ROLE_KEY) are validated where
 * used (admin client / Edge Function), not required for every request.
 */
const envSchema = z.object({
  // Required: BRUTHA's inference runs on xAI Grok served via Puter.js; the
  // Puter account auth token authenticates those calls.
  PUTER_AUTH_TOKEN: z
    .string({ message: "PUTER_AUTH_TOKEN is required" })
    .min(1, "PUTER_AUTH_TOKEN must not be empty"),

  // Optional: only needed if you point image generation at xAI directly.
  XAI_API_KEY: z.string().optional(),

  // Required: Supabase connection (public values, safe to expose to the client).
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ message: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" })
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY must not be empty"),

  // Optional model + tuning knobs.
  XAI_MODEL: z.string().min(1).optional(),
  XAI_IMAGE_MODEL: z.string().min(1).optional(),
  AGENT_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(100).optional(),

  // Optional service-role key (server-only; never exposed to the browser).
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Optional which OAuth providers to surface in the UI (comma-separated).
  NEXT_PUBLIC_AUTH_PROVIDERS: z.string().optional(),

  // Optional email (SMTP). All-or-nothing is enforced softly by the tool.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  TEST_EMAIL_TO: z.string().optional(),
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
