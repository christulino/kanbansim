import { describe, expect, it } from "vitest";
import { applyRandomization } from "../src/state/randomization.js";
import type { ExperimentConfig } from "@kanbansim/engine";

const config: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

describe("applyRandomization", () => {
  it("returns the input unchanged when no randomized vars", () => {
    const out = applyRandomization(config, [], 1n);
    expect(out).toEqual(config);
  });
  it("is deterministic for the same (config, vars, seed)", () => {
    const vars = [{ path: "work.effort_dist.sigma", mu: 3.5, sigma: 1.0, skewness: 0 }];
    const a = applyRandomization(config, vars, 42n);
    const b = applyRandomization(config, vars, 42n);
    expect(a.work.effort_dist.sigma).toBe(b.work.effort_dist.sigma);
  });
  it("differs across seeds", () => {
    const vars = [{ path: "work.effort_dist.sigma", mu: 3.5, sigma: 1.0, skewness: 0 }];
    const a = applyRandomization(config, vars, 1n).work.effort_dist.sigma;
    const b = applyRandomization(config, vars, 2n).work.effort_dist.sigma;
    expect(a).not.toBe(b);
  });
  it("samples positive values for log-normal-shaped numeric paths", () => {
    const vars = [{ path: "work.arrival_rate_per_day", mu: 4, sigma: 1.5, skewness: 0.5 }];
    for (let s = 1n; s < 50n; s++) {
      const v = applyRandomization(config, vars, s).work.arrival_rate_per_day;
      expect(v).toBeGreaterThan(0);
    }
  });
  it("clamps integer-valued paths to >= 1", () => {
    const vars = [{ path: "team.size", mu: 5, sigma: 8, skewness: 0 }];
    for (let s = 1n; s < 50n; s++) {
      const v = applyRandomization(config, vars, s).team.size;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });
  it("clamps probability paths to [0, 1]", () => {
    const vars = [{ path: "work.block_probability_per_day", mu: 0.04, sigma: 0.5, skewness: 0 }];
    for (let s = 1n; s < 50n; s++) {
      const v = applyRandomization(config, vars, s).work.block_probability_per_day;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
