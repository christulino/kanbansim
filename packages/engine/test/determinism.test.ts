import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runSimulation, type ExperimentConfig } from "../src/index.js";

const fixture = JSON.parse(readFileSync(`${import.meta.dirname}/fixtures/determinism.json`, "utf-8")) as {
  name: string; description: string; config: ExperimentConfig; seed: string;
};

const stringify = (v: unknown) =>
  JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));

describe("fixture: determinism", () => {
  it("produces bit-identical results across 3 runs", () => {
    const seed = BigInt(fixture.seed);
    const a = runSimulation(fixture.config, seed);
    const b = runSimulation(fixture.config, seed);
    const c = runSimulation(fixture.config, seed);
    expect(stringify(b)).toBe(stringify(a));
    expect(stringify(c)).toBe(stringify(a));
  });
});
