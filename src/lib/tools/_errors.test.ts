import { describe, it, expect } from "vitest";
import { isToolError, toolError, safeTool, errMsg } from "@/lib/tools/_errors";

describe("tool error helpers", () => {
  it("toolError builds the uniform shape", () => {
    expect(toolError("boom")).toEqual({ error: "boom" });
    expect(toolError("boom", { x: 1 })).toEqual({
      error: "boom",
      details: { x: 1 },
    });
  });

  it("isToolError detects the shape", () => {
    expect(isToolError({ error: "x" })).toBe(true);
    expect(isToolError({ error: 1 })).toBe(false);
    expect(isToolError({ ok: true })).toBe(false);
    expect(isToolError(null)).toBe(false);
  });

  it("errMsg extracts a message from various values", () => {
    expect(errMsg(new Error("nope"))).toBe("nope");
    expect(errMsg("plain")).toBe("plain");
    expect(errMsg({ a: 1 })).toContain("a");
  });

  it("safeTool converts throws into uniform errors", async () => {
    const ok = await safeTool("t", async () => 42);
    expect(ok).toBe(42);

    const bad = await safeTool("myTool", async () => {
      throw new Error("kaboom");
    });
    expect(isToolError(bad)).toBe(true);
    expect((bad as { error: string }).error).toContain("myTool failed");
    expect((bad as { error: string }).error).toContain("kaboom");
  });
});
