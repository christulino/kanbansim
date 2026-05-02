import { describe, it, expect } from "vitest";
import { runSimulation } from "../src/runSimulation.js";
import type { ExperimentConfig } from "../src/types.js";

const minimalConfig: ExperimentConfig = {
  team: { size: 2, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 2, effort_dist: { mu: 4, sigma: 1, skewness: 0.5 }, block_probability_per_day: 0, block_duration_dist: { mu: 2, sigma: 1, skewness: 0 } },
  board: { wip_limit: 3 },
  simulation: { sim_days: 30, tick_size_hours: 1 },
};

describe("runSimulation", () => {
  it("produces a valid RunResult shape", () => {
    const result = runSimulation(minimalConfig, 42n);
    expect(result.config).toEqual(minimalConfig);
    expect(result.seed).toBe(42n);
    expect(result.completed_items).toBeInstanceOf(Array);
    expect(result.cfd).toBeInstanceOf(Array);
    expect(result.time_accounting).toBeInstanceOf(Array);
    expect(result.summary.items_completed).toBe(result.completed_items.length);
  });

  it("is deterministic given the same seed", () => {
    const a = runSimulation(minimalConfig, 42n);
    const b = runSimulation(minimalConfig, 42n);
    expect(b.summary).toEqual(a.summary);
    expect(b.completed_items).toEqual(a.completed_items);
  });

  it("produces different results for different seeds", () => {
    const a = runSimulation(minimalConfig, 1n);
    const b = runSimulation(minimalConfig, 2n);
    expect(b.summary).not.toEqual(a.summary);
  });

  it("produces non-zero throughput when arrivals and capacity allow", () => {
    const result = runSimulation(minimalConfig, 7n);
    expect(result.summary.items_completed).toBeGreaterThan(0);
    expect(result.summary.throughput_per_day).toBeGreaterThan(0);
  });

  it("CFD has total_ticks snapshots", () => {
    const result = runSimulation(minimalConfig, 7n);
    const expectedTicks = minimalConfig.simulation.sim_days * minimalConfig.team.productive_hours_per_day;
    expect(result.cfd.length).toBe(expectedTicks);
  });

  it("CFD counts have no validation key", () => {
    const result = runSimulation(minimalConfig, 7n);
    expect(result.cfd[0]!.counts).not.toHaveProperty("validation");
    expect(result.cfd[0]!.counts).toHaveProperty("backlog");
    expect(result.cfd[0]!.counts).toHaveProperty("in_progress");
    expect(result.cfd[0]!.counts).toHaveProperty("done");
  });
});
