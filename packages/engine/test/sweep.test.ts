import { describe, expect, it } from "vitest";
import { setAtPath, generateSweepValues } from "../src/sweep.js";
import type { ExperimentConfig } from "../src/types.js";

const baseConfig: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

describe("setAtPath", () => {
  it("sets a nested numeric value without mutating the input", () => {
    const out = setAtPath(baseConfig, "board.wip_limit", 9);
    expect(out.board.wip_limit).toBe(9);
    expect(baseConfig.board.wip_limit).toBe(5);
  });
  it("supports null for nullable fields", () => {
    const out = setAtPath(baseConfig, "board.wip_limit", null);
    expect(out.board.wip_limit).toBeNull();
  });
  it("sets a 3-level deep path", () => {
    const out = setAtPath(baseConfig, "work.effort_dist.mu", 12);
    expect(out.work.effort_dist.mu).toBe(12);
    expect(baseConfig.work.effort_dist.mu).toBe(8);
  });
});

describe("generateSweepValues", () => {
  it("produces an inclusive integer range", () => {
    expect(generateSweepValues(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });
  it("handles non-integer steps without floating drift", () => {
    expect(generateSweepValues(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it("includes the endpoint when step lands on it", () => {
    expect(generateSweepValues(0, 60, 5)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });
});
