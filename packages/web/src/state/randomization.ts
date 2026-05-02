import { createPrng, sampleLogNormal, sampleSkewNormal, setAtPath, type ExperimentConfig } from "@kanbansim/engine";
import type { RandomizedVar } from "./urlCodec.js";

const INTEGER_PATHS = new Set<string>([
  "team.size",
  "team.productive_hours_per_day",
  "team.switch_cost_minutes",
  "board.wip_limit",
  "simulation.sim_days",
]);

const PROBABILITY_PATHS = new Set<string>([
  "work.block_probability_per_day",
]);

const PARAM_SEED_XOR = 0xdeadbeefcafef00dn;

export function applyRandomization(
  config: ExperimentConfig,
  randomized: RandomizedVar[],
  runSeed: bigint,
): ExperimentConfig {
  if (randomized.length === 0) return config;
  const paramSeed = (runSeed ^ PARAM_SEED_XOR) & 0xffffffffffffffffn;
  const rng = createPrng(paramSeed);
  let out = config;
  for (const v of randomized) {
    let sampled: number;
    if (PROBABILITY_PATHS.has(v.path)) {
      sampled = sampleSkewNormal(rng, { mu: v.mu, sigma: v.sigma, skewness: v.skewness });
      sampled = Math.max(0, Math.min(1, sampled));
    } else {
      sampled = sampleLogNormal(rng, { mu: v.mu, sigma: v.sigma, skewness: v.skewness });
    }
    if (INTEGER_PATHS.has(v.path)) {
      sampled = Math.max(1, Math.round(sampled));
    }
    out = setAtPath(out, v.path, sampled);
  }
  return out;
}
