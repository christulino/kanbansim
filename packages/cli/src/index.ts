import { runSimulation, type ExperimentConfig } from "@kanbansim/engine";
import { readFileSync, writeFileSync } from "node:fs";
import { setAtPath, generateSweepValues } from "./sweep.js";

type ScenarioFile = {
  name: string;
  description: string;
  lesson?: string;
  config: ExperimentConfig;
  sweep?: { variable: string; min: number; max: number; step: number };
};

function parseArgs(argv: string[]): { scenarioPath: string; runs: number; outPath: string; masterSeed: bigint } {
  let scenarioPath = "";
  let runs = 100;
  let outPath = "results.json";
  let masterSeed = 1n;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") scenarioPath = argv[++i] ?? "";
    else if (argv[i] === "--runs") runs = parseInt(argv[++i] ?? "100", 10);
    else if (argv[i] === "--out") outPath = argv[++i] ?? "results.json";
    else if (argv[i] === "--seed") masterSeed = BigInt(argv[++i] ?? "1");
  }
  if (!scenarioPath) {
    console.error("Usage: kanbansim --config <scenario.json> [--runs N] [--out file.json] [--seed N]");
    process.exit(2);
  }
  return { scenarioPath, runs, outPath, masterSeed };
}

function deriveSeed(master: bigint, cellIndex: number, runIndex: number): bigint {
  const a = master ^ (BigInt(cellIndex) * 0x9e3779b97f4a7c15n);
  const b = a ^ (BigInt(runIndex) * 0xbf58476d1ce4e5b9n);
  return b & 0xffffffffffffffffn;
}

async function main() {
  const { scenarioPath, runs, outPath, masterSeed } = parseArgs(process.argv.slice(2));
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8")) as ScenarioFile;

  const sweepValues = scenario.sweep
    ? generateSweepValues(scenario.sweep.min, scenario.sweep.max, scenario.sweep.step)
    : [null];

  const cells: Array<{ sweep_value: number | null; runs: ReturnType<typeof runSimulation>[] }> = [];
  const startWall = Date.now();

  for (let cellIdx = 0; cellIdx < sweepValues.length; cellIdx++) {
    const sv = sweepValues[cellIdx]!;
    const cellConfig = scenario.sweep ? setAtPath(scenario.config, scenario.sweep.variable, sv) : scenario.config;
    const cellRuns: ReturnType<typeof runSimulation>[] = [];
    for (let r = 0; r < runs; r++) {
      const seed = deriveSeed(masterSeed, cellIdx, r);
      cellRuns.push(runSimulation(cellConfig, seed));
    }
    cells.push({ sweep_value: sv, runs: cellRuns });
    process.stdout.write(`\rcell ${cellIdx + 1}/${sweepValues.length} done · ${runs} runs/cell`);
  }
  process.stdout.write("\n");

  const elapsedMs = Date.now() - startWall;

  const out = {
    scenario: { name: scenario.name, description: scenario.description, lesson: scenario.lesson ?? null },
    sweep: scenario.sweep ?? null,
    runs_per_cell: runs,
    master_seed: masterSeed.toString(),
    elapsed_ms: elapsedMs,
    cells: cells.map((c) => ({
      sweep_value: c.sweep_value,
      summaries: c.runs.map((r) => r.summary),
    })),
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath} (${cells.length} cells x ${runs} runs in ${elapsedMs}ms).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
