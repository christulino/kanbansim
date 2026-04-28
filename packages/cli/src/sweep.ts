import type { ExperimentConfig } from "@kanbansim/engine";

// Set a value at a dotted path, returning a new config object.
export function setAtPath(config: ExperimentConfig, path: string, value: number | null): ExperimentConfig {
  const parts = path.split(".");
  const cloned = JSON.parse(JSON.stringify(config)) as ExperimentConfig;
  let cursor: Record<string, unknown> = cloned as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]!] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return cloned;
}

export function generateSweepValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}
