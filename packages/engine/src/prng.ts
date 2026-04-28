// mulberry32 — small, fast, well-distributed seeded PRNG.
// Reference: https://gist.github.com/tommyettinger/46a3a48415fd31fd9e8b7e62c6da8c20

export type Prng = {
  next: () => number;                          // float in [0, 1)
  deriveChildSeed: (index: number) => bigint;  // for Monte Carlo: per-run seeds
};

export function createPrng(seed: bigint): Prng {
  let state = Number(seed & 0xffffffffn) >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    deriveChildSeed(index: number) {
      const x = (seed ^ (BigInt(index) * 0x9e3779b97f4a7c15n)) & 0xffffffffffffffffn;
      let z = x;
      z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
      z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
      z = z ^ (z >> 31n);
      return z;
    },
  };
}
