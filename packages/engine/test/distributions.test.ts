import { describe, it, expect } from "vitest";
import { createPrng } from "../src/prng.js";
import { sampleLogNormal, sampleSkewNormal, sampleBetaTruncated, samplePoisson } from "../src/distributions.js";

describe("log-normal sampling", () => {
  it("returns positive values", () => {
    const rng = createPrng(1n);
    for (let i = 0; i < 1000; i++) {
      const x = sampleLogNormal(rng, { mu: 8, sigma: 3, skewness: 1.2 });
      expect(x).toBeGreaterThan(0);
    }
  });

  it("has mean approximately equal to mu when skew is small", () => {
    const rng = createPrng(7n);
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) samples.push(sampleLogNormal(rng, { mu: 10, sigma: 2, skewness: 0.1 }));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(8);
    expect(mean).toBeLessThan(12);
  });

  it("is right-skewed (median < mean) for positive skewness", () => {
    const rng = createPrng(13n);
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) samples.push(sampleLogNormal(rng, { mu: 10, sigma: 4, skewness: 1.5 }));
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(median).toBeLessThan(mean);
  });

  it("is deterministic given the same seed", () => {
    const a = createPrng(99n);
    const b = createPrng(99n);
    for (let i = 0; i < 50; i++) {
      const xa = sampleLogNormal(a, { mu: 5, sigma: 2, skewness: 1 });
      const xb = sampleLogNormal(b, { mu: 5, sigma: 2, skewness: 1 });
      expect(xa).toBe(xb);
    }
  });
});

describe("skew-normal sampling", () => {
  it("can produce both positive and negative values when mu=0", () => {
    const rng = createPrng(4n);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) samples.push(sampleSkewNormal(rng, { mu: 0, sigma: 1, skewness: 0 }));
    expect(samples.some((x) => x > 0)).toBe(true);
    expect(samples.some((x) => x < 0)).toBe(true);
  });

  it("centers near mu when skewness=0", () => {
    const rng = createPrng(8n);
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) samples.push(sampleSkewNormal(rng, { mu: 5, sigma: 1, skewness: 0 }));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(4.85);
    expect(mean).toBeLessThan(5.15);
  });
});

describe("beta truncated sampling", () => {
  it("returns values in [0, 1]", () => {
    const rng = createPrng(2n);
    for (let i = 0; i < 1000; i++) {
      const x = sampleBetaTruncated(rng, { mu: 0.5, sigma: 0.15, skewness: 0 });
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});

describe("poisson sampling", () => {
  it("returns non-negative integers", () => {
    const rng = createPrng(3n);
    for (let i = 0; i < 1000; i++) {
      const x = samplePoisson(rng, 4);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });

  it("has mean approximately equal to lambda", () => {
    const rng = createPrng(7n);
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) samples.push(samplePoisson(rng, 4));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(3.85);
    expect(mean).toBeLessThan(4.15);
  });
});
