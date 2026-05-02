import { describe, expect, it } from "vitest";
import { encodeExperiment, decodeExperiment, type ExperimentState } from "../src/state/urlCodec.js";
import type { ExperimentConfig } from "@kanbansim/engine";

const config: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

const baseState: ExperimentState = {
  name: "The Sweet Spot",
  config,
  sweep: { variable: "board.wip_limit", min: 1, max: 15, step: 1 },
  randomized: [],
  master_seed: "1",
  runs: 1000,
};

describe("urlCodec", () => {
  it("round-trips a complete experiment state", () => {
    const encoded = encodeExperiment(baseState);
    const decoded = decodeExperiment(encoded);
    expect(decoded).toEqual(baseState);
  });

  it("preserves master seed precision as a string (no bigint loss)", () => {
    const big = { ...baseState, master_seed: "18446744073709551615" };
    const decoded = decodeExperiment(encodeExperiment(big));
    expect(decoded?.master_seed).toBe("18446744073709551615");
  });

  it("preserves null sweep (no sweep)", () => {
    const noSweep = { ...baseState, sweep: null };
    const decoded = decodeExperiment(encodeExperiment(noSweep));
    expect(decoded?.sweep).toBeNull();
  });

  it("preserves randomized vars list", () => {
    const withRand: ExperimentState = {
      ...baseState,
      randomized: [{ path: "work.effort_dist.sigma", mu: 3.5, sigma: 1.0, skewness: 0 }],
    };
    const decoded = decodeExperiment(encodeExperiment(withRand));
    expect(decoded?.randomized).toEqual(withRand.randomized);
  });

  it("returns null for unparseable input", () => {
    expect(decodeExperiment("garbage")).toBeNull();
    expect(decodeExperiment("")).toBeNull();
    expect(decodeExperiment("eyJtYWxmb3JtZWQ")).toBeNull();
  });

  it("returns null for valid JSON missing required fields", () => {
    const partial = encodeURIComponent(JSON.stringify({ name: "x" }));
    expect(decodeExperiment(partial)).toBeNull();
  });
});
