import type { ExperimentConfig, RunResult } from "@kanbansim/engine";

export type WorkerJob = {
  type: "run-batch";
  jobs: Array<{ sweep_value: number; config: ExperimentConfig; seed: string }>;
};

export type WorkerEvent =
  | { type: "result"; sweep_value: number; result: RunResult }
  | { type: "batch-done" }
  | { type: "error"; message: string };
