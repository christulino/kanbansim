import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runSimulation, type ExperimentConfig } from "../src/index.js";

const fixture = JSON.parse(readFileSync(`${import.meta.dirname}/fixtures/sanity_edges.json`, "utf-8")) as {
  cases: Array<{ name: string; config: ExperimentConfig; seed: string }>;
};

describe("fixture: sanity_edges", () => {
  for (const c of fixture.cases) {
    it(`runs without crashing: ${c.name}`, () => {
      const start = Date.now();
      const result = runSimulation(c.config, BigInt(c.seed));
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
      expect(Number.isFinite(result.summary.throughput_per_day)).toBe(true);
      expect(Number.isFinite(result.summary.median_lead_time_hours)).toBe(true);
      expect(result.summary.items_completed).toBeGreaterThanOrEqual(0);
    });
  }

  it("no-arrivals case produces zero items_completed", () => {
    const c = fixture.cases.find((x) => x.name === "no_arrivals")!;
    const result = runSimulation(c.config, BigInt(c.seed));
    expect(result.summary.items_completed).toBe(0);
  });
});
