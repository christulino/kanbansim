import type { DistributionSpec } from "./types.js";
import type { Prng } from "./prng.js";

// Box-Muller: convert two uniform samples into one standard-normal sample.
function standardNormal(rng: Prng): number {
  let u1 = rng.next();
  const u2 = rng.next();
  while (u1 === 0) u1 = rng.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Log-normal sample. Mu and sigma are the *target* mean and stddev.
// Skewness widens the right tail by inflating the underlying-normal sigma.
export function sampleLogNormal(rng: Prng, spec: DistributionSpec): number {
  const { mu, sigma, skewness } = spec;
  if (mu <= 0) return Math.max(0, mu);
  const sUnderlying = Math.max(0.05, (sigma / Math.max(mu, 1)) * (1 + 0.3 * skewness));
  const mUnderlying = Math.log(Math.max(mu, 0.01)) - (sUnderlying * sUnderlying) / 2;
  const z = standardNormal(rng);
  return Math.exp(mUnderlying + sUnderlying * z);
}

// Skew-normal via Azzalini. Maps `skewness` to alpha approximately (× 4).
export function sampleSkewNormal(rng: Prng, spec: DistributionSpec): number {
  const { mu, sigma, skewness } = spec;
  const alpha = skewness * 4;
  const u0 = standardNormal(rng);
  const v = standardNormal(rng);
  const delta = alpha / Math.sqrt(1 + alpha * alpha);
  const u1 = delta * Math.abs(u0) + Math.sqrt(1 - delta * delta) * v;
  return mu + sigma * u1;
}

// Beta-shaped sample truncated to [0, 1] — clamp the skew-normal output.
// Useful for sampling probabilities (e.g. a randomised block_probability_per_day)
// where the result must stay in [0, 1]. Exported for use by extenders.
export function sampleBetaTruncated(rng: Prng, spec: DistributionSpec): number {
  let value = sampleSkewNormal(rng, spec);
  if (value < 0) value = 0;
  if (value > 1) value = 1;
  return value;
}

// Poisson with mean lambda.
export function samplePoisson(rng: Prng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng.next();
    } while (p > L);
    return k - 1;
  }
  const z = standardNormal(rng);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}
