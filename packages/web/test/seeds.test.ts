import { describe, expect, it } from "vitest";
import { deriveSeed } from "../src/orchestrator/seeds.js";

describe("deriveSeed", () => {
  it("is deterministic for the same triple", () => {
    expect(deriveSeed(1n, 0, 0)).toBe(deriveSeed(1n, 0, 0));
  });
  it("differs across cell indices", () => {
    expect(deriveSeed(1n, 0, 0)).not.toBe(deriveSeed(1n, 1, 0));
  });
  it("differs across run indices", () => {
    expect(deriveSeed(1n, 0, 0)).not.toBe(deriveSeed(1n, 0, 1));
  });
  it("matches the CLI algorithm exactly", () => {
    // Reference values computed from packages/cli/src/index.ts deriveSeed.
    // master=1, cellIndex=0, runIndex=0 -> 1n (0x9e... XOR cancels at index 0)
    expect(deriveSeed(1n, 0, 0)).toBe(1n);
    // master=1, cellIndex=1, runIndex=0
    const expected1_1_0 = (1n ^ (1n * 0x9e3779b97f4a7c15n)) ^ (0n * 0xbf58476d1ce4e5b9n);
    expect(deriveSeed(1n, 1, 0)).toBe(expected1_1_0 & 0xffffffffffffffffn);
  });
  it("constrains to 64 bits", () => {
    const seed = deriveSeed(0xffffffffffffffffn, 999, 999);
    expect(seed).toBeLessThanOrEqual(0xffffffffffffffffn);
    expect(seed).toBeGreaterThanOrEqual(0n);
  });
});
