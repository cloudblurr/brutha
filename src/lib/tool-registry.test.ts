import { describe, it, expect } from "vitest";
import {
  getAllTools,
  getToolManifest,
  registerTool,
  toolCategories,
} from "@/lib/tool-registry";

describe("tool registry (S8/S11)", () => {
  it("composes built-in tools across categories", () => {
    const all = getAllTools();
    expect(Object.keys(all).length).toBeGreaterThan(20);
    expect(all).toHaveProperty("calculate");
    expect(all).toHaveProperty("getWeather");
  });

  it("manifest totals match the composed tool count", () => {
    const manifest = getToolManifest();
    const builtinCount = Object.values(toolCategories).reduce(
      (n, m) => n + Object.keys(m).length,
      0
    );
    expect(manifest.total).toBe(builtinCount + manifest.plugins.length);
    expect(manifest.categories.utility.length).toBeGreaterThan(0);
  });

  it("registerTool rejects collisions with built-ins", () => {
    expect(() =>
      registerTool("calculate", {} as never)
    ).toThrow(/already registered/);
  });
});
