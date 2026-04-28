import { describe, it, expect } from "vitest";
import { computeSummary, percentile } from "../src/metrics.js";

describe("metrics helpers", () => {
  it("percentile returns the right element", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.5)).toBe(6);
    expect(percentile(values, 0.85)).toBe(9);
    expect(percentile(values, 0.95)).toBe(10);
  });

  it("computeSummary returns zeros when no items completed", () => {
    const summary = computeSummary([], 130, 6);
    expect(summary.items_completed).toBe(0);
    expect(summary.throughput_per_day).toBe(0);
  });

  it("computeSummary computes throughput per simulated day", () => {
    const completed = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      arrival_tick: 0,
      done_tick: 10,
      lead_time_hours: 10,
      blocked_hours: 0,
      validation_started_tick: 5,
    }));
    const summary = computeSummary(completed, 100, 6);
    expect(summary.items_completed).toBe(100);
    expect(summary.throughput_per_day).toBeCloseTo(1, 5);
  });
});
