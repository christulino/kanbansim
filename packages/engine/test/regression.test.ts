import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runSimulation, type ExperimentConfig } from "../src/index.js";

const fixture = JSON.parse(readFileSync(`${import.meta.dirname}/fixtures/regression_baseline.json`, "utf-8")) as {
  config: ExperimentConfig;
  seed: string;
  baseline: {
    items_completed: number | null;
    throughput_per_day: number | null;
    median_lead_time_hours: number | null;
    p95_lead_time_hours: number | null;
  };
};

describe("fixture: regression_baseline", () => {
  it("matches the recorded baseline within 5%", () => {
    expect(fixture.baseline.items_completed, "Baseline not yet populated; run the engine and update fixture.").not.toBeNull();
    const result = runSimulation(fixture.config, BigInt(fixture.seed));
    const drift = (actual: number, expected: number) => Math.abs(actual - expected) / Math.max(0.1, expected);
    expect(drift(result.summary.items_completed, fixture.baseline.items_completed!)).toBeLessThan(0.05);
    expect(drift(result.summary.throughput_per_day, fixture.baseline.throughput_per_day!)).toBeLessThan(0.05);
    expect(drift(result.summary.median_lead_time_hours, fixture.baseline.median_lead_time_hours!)).toBeLessThan(0.05);
    expect(drift(result.summary.p95_lead_time_hours, fixture.baseline.p95_lead_time_hours!)).toBeLessThan(0.05);
  });
});
