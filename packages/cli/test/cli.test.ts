import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("CLI smoke", () => {
  it("runs the Sweet Spot scenario at low run count and writes a valid result file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kanbansim-cli-"));
    const out = join(tmp, "results.json");
    const scenarioPath = join(__dirname, "..", "..", "..", "scenarios", "sweet-spot.json");
    execFileSync(
      "pnpm",
      [
        "--silent", "--filter", "@kanbansim/cli", "exec", "tsx", "src/index.ts",
        "--config", scenarioPath,
        "--runs", "5",
        "--out", out,
        "--seed", "42",
      ],
      { stdio: "ignore" },
    );
    const result = JSON.parse(readFileSync(out, "utf-8"));
    expect(result.scenario.name).toBe("The Sweet Spot");
    expect(result.cells.length).toBe(30);
    expect(result.cells[0].summaries.length).toBe(5);
    for (const cell of result.cells) {
      for (const s of cell.summaries) {
        expect(Number.isFinite(s.throughput_per_day)).toBe(true);
        expect(Number.isFinite(s.median_lead_time_hours)).toBe(true);
      }
    }
  }, 30_000);
});
