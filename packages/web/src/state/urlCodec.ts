import type { ExperimentConfig } from "@kanbansim/engine";

export type SweepSpec = { variable: string; min: number; max: number; step: number };

export type RandomizedVar = {
  path: string;          // dotted path into ExperimentConfig
  mu: number;
  sigma: number;
  skewness: number;
};

export type ExperimentState = {
  name: string;
  config: ExperimentConfig;
  sweep: SweepSpec | null;
  randomized: RandomizedVar[];
  master_seed: string;   // string-encoded bigint to survive JSON
  runs: number;
};

export function encodeExperiment(state: ExperimentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function decodeExperiment(encoded: string): ExperimentState | null {
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(encoded);
    const obj = JSON.parse(json) as unknown;
    if (!isExperimentState(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

function isExperimentState(o: unknown): o is ExperimentState {
  if (typeof o !== "object" || o === null) return false;
  const x = o as Partial<ExperimentState>;
  return (
    typeof x.name === "string" &&
    typeof x.master_seed === "string" &&
    typeof x.runs === "number" &&
    Array.isArray(x.randomized) &&
    typeof x.config === "object" && x.config !== null &&
    (x.sweep === null || (typeof x.sweep === "object" && typeof x.sweep?.variable === "string"))
  );
}
