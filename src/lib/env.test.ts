import { describe, it, expect } from "vitest";
import { getEnvError } from "@/lib/env";

describe("env validation (S5)", () => {
  it("reports an error when XAI_API_KEY is missing", () => {
    const err = getEnvError({} as unknown as NodeJS.ProcessEnv);
    expect(err).toBeTruthy();
    expect(err).toMatch(/XAI_API_KEY/);
  });

  it("passes when XAI_API_KEY is present", () => {
    const err = getEnvError({
      XAI_API_KEY: "test-key",
    } as unknown as NodeJS.ProcessEnv);
    expect(err).toBeNull();
  });

  it("rejects an out-of-range temperature", () => {
    const err = getEnvError({
      XAI_API_KEY: "k",
      AGENT_TEMPERATURE: "9",
    } as unknown as NodeJS.ProcessEnv);
    expect(err).toBeTruthy();
  });
});
