import { describe, it, expect } from "vitest";
import { utilityTools } from "@/lib/tools/utility";

/**
 * Unit test for a representative tool's execute fn. Tools expose `execute`
 * directly (AI SDK `tool({...})`). We invoke it with a minimal options arg.
 */
type ExecFn = (
  args: Record<string, unknown>,
  opts: { toolCallId: string; messages: [] }
) => Promise<unknown>;

function exec(tool: unknown): ExecFn {
  const e = (tool as { execute?: ExecFn }).execute;
  if (!e) throw new Error("tool has no execute fn");
  return e;
}

const OPTS = { toolCallId: "test", messages: [] as [] };

describe("calculate tool (S1/S3)", () => {
  it("evaluates a valid expression", async () => {
    const res = (await exec(utilityTools.calculate)(
      { expression: "(128 * 12) + 47" },
      OPTS
    )) as { result?: number };
    expect(res.result).toBe(1583);
  });

  it("returns a uniform error for unsupported characters", async () => {
    const res = (await exec(utilityTools.calculate)(
      { expression: "alert(1)" },
      OPTS
    )) as { error?: string };
    expect(res.error).toBeTruthy();
  });

  it("returns an error for non-finite results", async () => {
    const res = (await exec(utilityTools.calculate)(
      { expression: "1/0" },
      OPTS
    )) as { error?: string };
    expect(res.error).toBeTruthy();
  });
});
