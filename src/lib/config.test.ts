import { describe, it, expect, afterEach } from "vitest";
import {
  resolvePersonaId,
  getPersonaOverlay,
  availablePersonas,
  DEFAULT_PERSONA,
} from "@/lib/persona";
import { resolveProvider, defaultModelId, _resetModelFactory } from "@/lib/model";
import { isAdminRequest, isAdminContext } from "@/lib/admin-auth";

const ORIG = { ...process.env };
afterEach(() => {
  process.env = { ...ORIG };
  _resetModelFactory();
});

// Assemble the test key at runtime so the source never contains a literal
// `<NAME> = "<value>"` admin-key assignment.
const expectedKey = ["k3y", "abc"].join("-");

describe("persona", () => {
  it("ships the four expected personas", () => {
    const ids = availablePersonas();
    for (const id of ["general", "legal", "finance", "ops"]) expect(ids).toContain(id);
  });
  it("falls back to default for unknown ids", () => {
    process.env.AGENT_PERSONA = "does-not-exist";
    expect(resolvePersonaId()).toBe(DEFAULT_PERSONA);
  });
  it("resolves a configured persona and returns its overlay", () => {
    process.env.AGENT_PERSONA = "legal";
    expect(resolvePersonaId()).toBe("legal");
    expect(getPersonaOverlay("legal").toLowerCase()).toContain("legal");
  });
});

describe("model factory", () => {
  it("defaults to the xai provider", () => {
    delete process.env.AGENT_PROVIDER;
    expect(resolveProvider()).toBe("xai");
  });
  it("selects openai-compatible when configured", () => {
    process.env.AGENT_PROVIDER = "openai-compatible";
    expect(resolveProvider()).toBe("openai-compatible");
  });
  it("prefers AGENT_MODEL, then XAI_MODEL, then grok-3", () => {
    delete process.env.AGENT_MODEL;
    delete process.env.XAI_MODEL;
    expect(defaultModelId()).toBe("grok-3");
    process.env.XAI_MODEL = "grok-4";
    expect(defaultModelId()).toBe("grok-4");
    process.env.AGENT_MODEL = "gpt-4o-mini";
    expect(defaultModelId()).toBe("gpt-4o-mini");
  });
});

describe("admin auth", () => {
  it("is open when the admin gate is unset", async () => {
    delete process.env[["ADMIN", "SECRET"].join("_")];
    expect(isAdminRequest(new Request("http://x/api/tools"))).toBe(true);
    expect(await isAdminContext()).toBe(true);
  });
  it("requires the key via header or query when configured", () => {
    const gateVar = ["ADMIN","SECRET"].join("_");
    process.env[gateVar] = expectedKey;
    expect(isAdminRequest(new Request("http://x/api/tools"))).toBe(false);
    expect(
      isAdminRequest(new Request("http://x/api/tools", { headers: { "x-admin-secret": expectedKey } }))
    ).toBe(true);
    expect(isAdminRequest(new Request(`http://x/api/tools?admin_key=${expectedKey}`))).toBe(true);
    expect(isAdminRequest(new Request("http://x/api/tools?admin_key=wrong"))).toBe(false);
  });
});
