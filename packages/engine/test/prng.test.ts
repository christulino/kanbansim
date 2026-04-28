import { describe, it, expect } from "vitest";
import { createPrng } from "../src/prng.js";

describe("mulberry32 PRNG", () => {
  it("produces values in [0, 1)", () => {
    const rng = createPrng(42n);
    for (let i = 0; i < 1000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = createPrng(12345n);
    const b = createPrng(12345n);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createPrng(1n);
    const b = createPrng(2n);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("derives child seeds deterministically", () => {
    const master = createPrng(99n);
    const childA = master.deriveChildSeed(0);
    const childA_again = master.deriveChildSeed(0);
    const childB = master.deriveChildSeed(1);
    expect(childA).toBe(childA_again);
    expect(childA).not.toBe(childB);
  });
});
