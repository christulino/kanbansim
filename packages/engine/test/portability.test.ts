import { describe, it, expect } from "vitest";
import { runSimulation, type ExperimentConfig } from "../src/index.js";
import { readFileSync } from "node:fs";

const config: ExperimentConfig = {
  team: { size: 3, productive_hours_per_day: 6 },
  work: { arrival_rate_per_day: 3, effort_dist: { mu: 6, sigma: 2, skewness: 1 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 4 },
  simulation: { sim_days: 60, tick_size_hours: 1 },
};

describe("engine portability and purity", () => {
  it("does not import Node built-ins or DOM globals from any engine source file", () => {
    const forbidden = ["node:", "from 'fs'", "from \"fs\"", "from 'path'", "from \"path\"", "self.postMessage", "window.", "document."];
    const files = [
      "src/types.ts", "src/prng.ts", "src/distributions.ts", "src/item.ts",
      "src/events.ts", "src/tick.ts", "src/metrics.ts", "src/runSimulation.ts", "src/index.ts",
    ];
    for (const f of files) {
      const content = readFileSync(`${import.meta.dirname}/../${f}`, "utf-8");
      for (const pattern of forbidden) {
        expect(content, `engine file ${f} must not contain forbidden import "${pattern}"`).not.toContain(pattern);
      }
    }
  });

  it("produces bit-identical results for the same config + seed", () => {
    const a = runSimulation(config, 0xdeadbeefn);
    const b = runSimulation(config, 0xdeadbeefn);
    expect(JSON.stringify(b.summary)).toBe(JSON.stringify(a.summary));
    expect(JSON.stringify(b.completed_items)).toBe(JSON.stringify(a.completed_items));
    expect(JSON.stringify(b.cfd)).toBe(JSON.stringify(a.cfd));
    expect(JSON.stringify(b.time_accounting)).toBe(JSON.stringify(a.time_accounting));
  });
});
