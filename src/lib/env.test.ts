import { describe, it, expect } from "vitest";
import { getEnvError } from "@/lib/env";

// Minimal set of vars that satisfy the required schema (Puter inference token +
// Supabase connection). XAI_API_KEY is optional now (only for image gen).
const VALID = {
  PUTER_AUTH_TOKEN: "puter-token",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
} as const;

describe("env validation (S5)", () => {
  it("reports an error when PUTER_AUTH_TOKEN is missing", () => {
    const rest = { ...VALID } as Record<string, string>;
    delete rest.PUTER_AUTH_TOKEN;
    const err = getEnvError(rest as unknown as NodeJS.ProcessEnv);
    expect(err).toBeTruthy();
    expect(err).toMatch(/PUTER_AUTH_TOKEN/);
  });

  it("reports an error when Supabase config is missing", () => {
    const err = getEnvError({
      PUTER_AUTH_TOKEN: "puter-token",
    } as unknown as NodeJS.ProcessEnv);
    expect(err).toBeTruthy();
    expect(err).toMatch(/SUPABASE/);
  });

  it("passes when all required vars are present (no xAI key needed)", () => {
    const err = getEnvError({ ...VALID } as unknown as NodeJS.ProcessEnv);
    expect(err).toBeNull();
  });

  it("rejects an out-of-range temperature", () => {
    const err = getEnvError({
      ...VALID,
      AGENT_TEMPERATURE: "9",
    } as unknown as NodeJS.ProcessEnv);
    expect(err).toBeTruthy();
  });
});
