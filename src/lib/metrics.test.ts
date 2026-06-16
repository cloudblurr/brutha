import { describe, it, expect, beforeEach } from "vitest";
import { increment, getCounter, snapshotMetrics, resetMetrics, Metric } from "@/lib/metrics";

describe("metrics counters", () => {
  beforeEach(() => resetMetrics());

  it("increments by 1 by default and by n when given", () => {
    increment("a");
    increment("a");
    increment("b", 5);
    expect(getCounter("a")).toBe(2);
    expect(getCounter("b")).toBe(5);
  });

  it("returns 0 for an unset counter", () => {
    expect(getCounter("never")).toBe(0);
  });

  it("snapshots all counters as a plain object", () => {
    increment(Metric.temporalFallback);
    increment(Metric.chatRequests, 3);
    const snap = snapshotMetrics();
    expect(snap[Metric.temporalFallback]).toBe(1);
    expect(snap[Metric.chatRequests]).toBe(3);
  });

  it("resets all counters", () => {
    increment("x", 9);
    resetMetrics();
    expect(getCounter("x")).toBe(0);
    expect(snapshotMetrics()).toEqual({});
  });
});
