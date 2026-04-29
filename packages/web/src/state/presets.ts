import type { ExperimentConfig } from "@kanbansim/engine";
import type { ExperimentState, SweepSpec } from "./urlCodec.js";

export type PresetId = "sweet-spot" | "qa-bottleneck" | "multitasking-tax";

type ScenarioFile = {
  name: string;
  description: string;
  lesson?: string;
  config: ExperimentConfig;
  sweep?: SweepSpec;
};

export const PRESET_IDS: PresetId[] = ["sweet-spot", "qa-bottleneck", "multitasking-tax"];

export const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  "sweet-spot": "WIP swept 1 → 15. Find the optimal point on the U-curve.",
  "qa-bottleneck": "Validation WIP swept 1 → 6. See where the team chokes when QA can't keep up.",
  "multitasking-tax": "Switch cost swept 0 → 60 min at high WIP. Watch the team grind to a halt.",
};

export async function loadPreset(id: PresetId): Promise<ExperimentState> {
  const url = `${import.meta.env.BASE_URL ?? "./"}scenarios/${id}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load preset ${id}: ${res.status}`);
  const file = (await res.json()) as ScenarioFile;
  return {
    name: file.name,
    config: file.config,
    sweep: file.sweep ?? null,
    randomized: [],
    master_seed: "1",
    runs: 100,
  };
}
