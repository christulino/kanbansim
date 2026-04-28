# KanbanSim Engine + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the simulation engine and Node CLI runner — a fully tested, deterministic Kanban simulator runnable from the command line, with fixtures that prove correctness. The web UI is a separate plan that consumes this engine unchanged.

**Architecture:** Pure isomorphic TypeScript engine in `packages/engine/` obeying strict purity rules (no environment-specific imports, no global state, no I/O, no wall-clock time, deterministic on seed). A thin Node CLI in `packages/cli/` imports the engine directly and exposes it as a command-line tool. Test suite (Vitest) validates determinism, sanity edges, and regression baseline.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, Node 20+, mulberry32 PRNG (in-tree), no other runtime deps for the engine.

---

## File Structure

```
kanbansim/
├── package.json                              # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json                        # shared tsconfig
├── .nvmrc                                    # Node version pin
├── packages/
│   ├── engine/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                     # public API barrel
│   │   │   ├── types.ts                     # ExperimentConfig, RunResult, etc.
│   │   │   ├── prng.ts                      # mulberry32 seeded PRNG
│   │   │   ├── distributions.ts             # log-normal, skew-normal, beta samplers
│   │   │   ├── item.ts                      # Item type + lifecycle helpers
│   │   │   ├── worker.ts                    # Worker type + decision tree
│   │   │   ├── board.ts                     # Board state + WIP checks
│   │   │   ├── multitasking.ts              # switch cost + pace penalty math
│   │   │   ├── events.ts                    # event scheduling (arrivals, blocks, unblocks)
│   │   │   ├── tick.ts                      # one-tick processing
│   │   │   ├── runSimulation.ts             # top-level entry point
│   │   │   └── metrics.ts                   # per-run stats aggregation
│   │   ├── test/
│   │   │   ├── fixtures/
│   │   │   │   ├── determinism.json
│   │   │   │   ├── sanity_edges.json
│   │   │   │   └── regression_baseline.json
│   │   │   ├── prng.test.ts
│   │   │   ├── distributions.test.ts
│   │   │   ├── multitasking.test.ts
│   │   │   ├── pull-policy.test.ts
│   │   │   ├── tick.test.ts
│   │   │   ├── runSimulation.test.ts
│   │   │   ├── determinism.test.ts          # consumes fixtures/determinism.json
│   │   │   ├── sanity-edges.test.ts         # consumes fixtures/sanity_edges.json
│   │   │   └── regression.test.ts           # consumes fixtures/regression_baseline.json
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts                     # CLI entry, arg parsing, output
│       │   └── sweep.ts                     # sweep helper (set-at-path, generate values)
│       └── test/
│           └── cli.test.ts                  # smoke test: CLI runs a preset, output schema validates
└── scenarios/
    ├── sweet-spot.json
    ├── qa-bottleneck.json
    └── multitasking-tax.json
```

**Boundaries:**
- `packages/engine/src/` — pure TypeScript, zero runtime dependencies, never imports from `node:*` or DOM globals. The portability test (`portability.test.ts`) verifies this.
- `packages/cli/` — depends on `engine` via workspace; uses `node:fs` and `node:process`. CLI is the only place I/O lives.
- `scenarios/` — JSON configs that are valid `ExperimentConfig` instances. Shared between CLI and (later) web.

---

## Phase 0 — Project Scaffold (Tasks 1–5)

### Task 1: Initialize pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Verify pnpm is installed**

Run: `pnpm --version`
Expected: prints a version like `9.x.x` (or any version ≥ 8). If missing, install with `npm i -g pnpm`.

- [ ] **Step 2: Write `.nvmrc`**

```
20
```

- [ ] **Step 3: Write workspace root `package.json`**

```json
{
  "name": "kanbansim",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 4: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 5: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Run `pnpm install` to verify the workspace resolves**

Run: `pnpm install`
Expected: exits 0, creates `node_modules/` and `pnpm-lock.yaml`.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace and base tsconfig"
```

---

### Task 2: Scaffold engine package

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/vitest.config.ts`
- Create: `packages/engine/src/index.ts`

- [ ] **Step 1: Write `packages/engine/package.json`**

```json
{
  "name": "@kanbansim/engine",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/engine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    typecheck: { enabled: false },
  },
});
```

- [ ] **Step 4: Write a placeholder `packages/engine/src/index.ts`**

```ts
export const ENGINE_VERSION = "0.0.1";
```

- [ ] **Step 5: Verify the package builds and types check**

Run: `pnpm --filter @kanbansim/engine typecheck`
Expected: exits 0, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/engine
git commit -m "chore(engine): scaffold engine package"
```

---

### Task 3: Scaffold CLI package

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Write `packages/cli/package.json`**

```json
{
  "name": "@kanbansim/cli",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "kanbansim": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@kanbansim/engine": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../engine" }]
}
```

- [ ] **Step 3: Write a placeholder `packages/cli/src/index.ts`**

```ts
import { ENGINE_VERSION } from "@kanbansim/engine";
console.log(`KanbanSim CLI · engine v${ENGINE_VERSION}`);
```

- [ ] **Step 4: Run `pnpm install` so the workspace link resolves, then verify**

Run: `pnpm install && pnpm --filter @kanbansim/cli typecheck`
Expected: install succeeds, typecheck exits 0.

- [ ] **Step 5: Smoke-run the placeholder CLI**

Run: `pnpm --filter @kanbansim/cli exec tsx src/index.ts`
Expected: prints `KanbanSim CLI · engine v0.0.1`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "chore(cli): scaffold cli package linked to engine"
```

---

### Task 4: Wire workspace test scripts

- [ ] **Step 1: Run the workspace-level typecheck**

Run: `pnpm typecheck`
Expected: typechecks both packages, exits 0.

- [ ] **Step 2: Run the workspace-level test (no tests yet — Vitest exits cleanly)**

Run: `pnpm test`
Expected: prints "no test files found" or similar in each package, exits 0.

- [ ] **Step 3: No commit (verification only)**

---

### Task 5: Per-package README stubs

**Files:**
- Create: `packages/engine/README.md`
- Create: `packages/cli/README.md`

- [ ] **Step 1: Write `packages/engine/README.md`**

```markdown
# @kanbansim/engine

Pure isomorphic TypeScript Kanban-flow simulator. No environment-specific imports, no global state, no I/O, deterministic on seed.

See [the design spec](../../docs/superpowers/specs/2026-04-28-kanbansim-design.md) for the full model.
```

- [ ] **Step 2: Write `packages/cli/README.md`**

```markdown
# @kanbansim/cli

Node command-line runner for the KanbanSim engine. Imports the engine directly and runs experiments from JSON config files.

Usage:

    pnpm --filter @kanbansim/cli exec tsx src/index.ts --config scenarios/sweet-spot.json --runs 1000 --out results.json
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/README.md packages/cli/README.md
git commit -m "docs: per-package README stubs"
```

---

## Phase 1 — Shared Types & PRNG (Tasks 6–9)

### Task 6: Define core types

**Files:**
- Create: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write `packages/engine/src/types.ts`**

```ts
// Core type definitions for the KanbanSim engine.
// All types are JSON-serializable so configs and results cross any boundary.

export type DistributionSpec = {
  mu: number;
  sigma: number;
  skewness: number;
};

export type BlockingResponse = "wait" | "start_new" | "help_validate" | "swarm_unblock";
export type WorkerPickPolicy = "round_robin" | "random" | "largest_first";
export type ValidationEffortMode =
  | { kind: "fraction"; fraction: number }
  | { kind: "distribution"; dist: DistributionSpec };

export type ExperimentConfig = {
  team: {
    size: number;
    productive_hours_per_day: number;
    switch_cost_minutes: number;
    pace_penalty: number;
    worker_pick_policy: WorkerPickPolicy;
    blocking_response: BlockingResponse;
  };
  work: {
    arrival_rate_per_day: number;
    effort_dist: DistributionSpec;
    validation_effort: ValidationEffortMode;
    block_probability_per_day: number;
    block_duration_dist: DistributionSpec;
  };
  board: {
    wip_ready: number | null;
    wip_in_progress: number | null;
    wip_validation: number | null;
  };
  simulation: {
    sim_days: number;
    tick_size_hours: number;
  };
};

export type ColumnId = "backlog" | "ready" | "in_progress" | "validation" | "done";

export type ItemState = "in_column" | "blocked";

export type Item = {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
  validation_effort_hours: number;
  effort_done_hours: number;
  column: ColumnId;
  state: ItemState;
  author_worker_id: number | null;     // worker who took it from Ready into In Progress
  current_worker_id: number | null;    // worker actively progressing it (may be null in Backlog/Ready/Done)
  done_tick: number | null;
  blocked_until_tick: number | null;
};

export type Worker = {
  id: number;
  active_item_ids: number[];           // items the worker is "carrying" (In Progress + Validation they took)
  last_chosen_item_id: number | null;  // for switch-cost detection across ticks
};

export type CfdSnapshot = {
  tick: number;
  counts: Record<ColumnId, number>;
};

export type WorkerTimeAccounting = {
  worker_id: number;
  hours_working: number;
  hours_switching: number;
  hours_blocked: number;
  hours_idle: number;
};

export type RunResult = {
  config: ExperimentConfig;
  seed: bigint;
  completed_items: Array<{
    id: number;
    arrival_tick: number;
    done_tick: number;
    lead_time_hours: number;
    blocked_hours: number;
    validation_started_tick: number | null;
  }>;
  cfd: CfdSnapshot[];
  time_accounting: WorkerTimeAccounting[];
  summary: {
    throughput_per_day: number;
    median_lead_time_hours: number;
    p85_lead_time_hours: number;
    p95_lead_time_hours: number;
    max_lead_time_hours: number;
    items_completed: number;
  };
};
```

- [ ] **Step 2: Re-export types from `packages/engine/src/index.ts`**

```ts
export const ENGINE_VERSION = "0.0.1";
export * from "./types.js";
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @kanbansim/engine typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/index.ts
git commit -m "feat(engine): define core types"
```

---

### Task 7: PRNG — failing test

**Files:**
- Create: `packages/engine/test/prng.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test`
Expected: FAIL — module `../src/prng.js` does not exist.

---

### Task 8: PRNG — implement mulberry32

**Files:**
- Create: `packages/engine/src/prng.ts`

- [ ] **Step 1: Write the implementation**

```ts
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter @kanbansim/engine test`
Expected: 4 PRNG tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/prng.ts packages/engine/test/prng.test.ts
git commit -m "feat(engine): mulberry32 PRNG with deterministic child seeds"
```

---

### Task 9: Re-export PRNG

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Update the barrel**

```ts
export const ENGINE_VERSION = "0.0.1";
export * from "./types.js";
export { createPrng, type Prng } from "./prng.js";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @kanbansim/engine typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "chore(engine): re-export PRNG"
```

---

## Phase 2 — Distributions (Tasks 10–13)

### Task 10: Distributions — failing test

**Files:**
- Create: `packages/engine/test/distributions.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test`
Expected: FAIL — `../src/distributions.js` not found.

---

### Task 11: Distributions — implement

**Files:**
- Create: `packages/engine/src/distributions.ts`

- [ ] **Step 1: Write the implementation**

```ts
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
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @kanbansim/engine test`
Expected: PASS for all distribution tests.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/distributions.ts packages/engine/test/distributions.test.ts
git commit -m "feat(engine): log-normal, skew-normal, beta-truncated, poisson samplers"
```

---

### Task 12: Re-export distributions

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Add the exports**

```ts
export const ENGINE_VERSION = "0.0.1";
export * from "./types.js";
export { createPrng, type Prng } from "./prng.js";
export { sampleLogNormal, sampleSkewNormal, sampleBetaTruncated, samplePoisson } from "./distributions.js";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @kanbansim/engine typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "chore(engine): re-export distribution samplers"
```

---

### Task 13: (Reserved — coverage gap fill, deferred)

If a sampling correctness gap surfaces in later phases, add a focused unit test here. Skip if no gap is identified.

---

## Phase 3 — Engine Core: Items, Workers, Board, Multitasking (Tasks 14–18)

### Task 14: Item helpers

**Files:**
- Create: `packages/engine/src/item.ts`
- Create: `packages/engine/test/item.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createItem, isBlocked, advanceItemEffort } from "../src/item.js";

describe("item helpers", () => {
  it("creates an item in Backlog with zero effort done", () => {
    const item = createItem({ id: 1, arrival_tick: 5, effort_required_hours: 8, validation_effort_hours: 3 });
    expect(item.column).toBe("backlog");
    expect(item.effort_done_hours).toBe(0);
    expect(item.state).toBe("in_column");
    expect(item.author_worker_id).toBeNull();
  });

  it("isBlocked is false in normal state", () => {
    const item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 });
    expect(isBlocked(item)).toBe(false);
  });

  it("advanceItemEffort accumulates progress in In Progress", () => {
    let item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 });
    item = { ...item, column: "in_progress" };
    item = advanceItemEffort(item, 2.5);
    expect(item.effort_done_hours).toBeCloseTo(2.5);
  });

  it("advanceItemEffort caps at effort_required when in In Progress", () => {
    let item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 5, validation_effort_hours: 2 });
    item = { ...item, column: "in_progress" };
    item = advanceItemEffort(item, 10);
    expect(item.effort_done_hours).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/item.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/engine/src/item.ts`**

```ts
import type { Item } from "./types.js";

export function createItem(args: {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
  validation_effort_hours: number;
}): Item {
  return {
    id: args.id,
    arrival_tick: args.arrival_tick,
    effort_required_hours: args.effort_required_hours,
    validation_effort_hours: args.validation_effort_hours,
    effort_done_hours: 0,
    column: "backlog",
    state: "in_column",
    author_worker_id: null,
    current_worker_id: null,
    done_tick: null,
    blocked_until_tick: null,
  };
}

export function isBlocked(item: Item): boolean {
  return item.state === "blocked";
}

export function advanceItemEffort(item: Item, hours: number): Item {
  if (hours <= 0) return item;
  if (item.column !== "in_progress" && item.column !== "validation") return item;
  const cap = item.column === "in_progress" ? item.effort_required_hours : item.validation_effort_hours;
  const newEffort = Math.min(cap, item.effort_done_hours + hours);
  return { ...item, effort_done_hours: newEffort };
}

// Reset effort_done when an item moves between columns.
export function resetEffortForColumnTransition(item: Item): Item {
  return { ...item, effort_done_hours: 0 };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/item.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/item.ts packages/engine/test/item.test.ts
git commit -m "feat(engine): item creation, blocking check, effort accumulation"
```

---

### Task 15: Board helpers and pull policy

**Files:**
- Create: `packages/engine/src/board.ts`
- Create: `packages/engine/test/board.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { columnHasCapacity, workerCanPull, currentWorkerLoads } from "../src/board.js";
import { createItem } from "../src/item.js";
import type { Worker } from "../src/types.js";

describe("board helpers", () => {
  it("columnHasCapacity returns true when wip is null (unlimited)", () => {
    const items = [
      { ...createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 }), column: "in_progress" as const },
    ];
    expect(columnHasCapacity(items, "in_progress", null)).toBe(true);
  });

  it("columnHasCapacity returns true when count < wip", () => {
    const items = [
      { ...createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 }), column: "in_progress" as const },
    ];
    expect(columnHasCapacity(items, "in_progress", 3)).toBe(true);
  });

  it("columnHasCapacity returns false when count == wip", () => {
    const items = [1, 2, 3].map((id) => ({
      ...createItem({ id, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 }),
      column: "in_progress" as const,
    }));
    expect(columnHasCapacity(items, "in_progress", 3)).toBe(false);
  });

  it("workerCanPull is true when no peer has lower load", () => {
    const workers: Worker[] = [
      { id: 1, active_item_ids: [1, 2], last_chosen_item_id: null },
      { id: 2, active_item_ids: [3, 4], last_chosen_item_id: null },
      { id: 3, active_item_ids: [5, 6], last_chosen_item_id: null },
    ];
    expect(workerCanPull(workers, 1)).toBe(true);
  });

  it("workerCanPull is false when this worker is uniquely highest-loaded", () => {
    const workers: Worker[] = [
      { id: 1, active_item_ids: [1, 2, 3], last_chosen_item_id: null },
      { id: 2, active_item_ids: [4], last_chosen_item_id: null },
      { id: 3, active_item_ids: [5, 6], last_chosen_item_id: null },
    ];
    expect(workerCanPull(workers, 1)).toBe(false);
  });

  it("workerCanPull is true when tied for highest", () => {
    const workers: Worker[] = [
      { id: 1, active_item_ids: [1, 2, 3], last_chosen_item_id: null },
      { id: 2, active_item_ids: [4, 5, 6], last_chosen_item_id: null },
    ];
    expect(workerCanPull(workers, 1)).toBe(true);
  });

  it("currentWorkerLoads returns map of worker id to active count", () => {
    const workers: Worker[] = [
      { id: 1, active_item_ids: [1, 2], last_chosen_item_id: null },
      { id: 2, active_item_ids: [], last_chosen_item_id: null },
    ];
    const loads = currentWorkerLoads(workers);
    expect(loads.get(1)).toBe(2);
    expect(loads.get(2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/board.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/engine/src/board.ts`**

```ts
import type { ColumnId, Item, Worker } from "./types.js";

export function columnHasCapacity(items: Item[], column: ColumnId, wipLimit: number | null): boolean {
  if (wipLimit === null) return true;
  const count = items.filter((it) => it.column === column).length;
  return count < wipLimit;
}

export function currentWorkerLoads(workers: Worker[]): Map<number, number> {
  const loads = new Map<number, number>();
  for (const w of workers) loads.set(w.id, w.active_item_ids.length);
  return loads;
}

// Pull policy: worker may pull if their load is NOT strictly the highest in the team.
// Tie for highest is OK; only the unique max cannot pull.
export function workerCanPull(workers: Worker[], workerId: number): boolean {
  const myWorker = workers.find((w) => w.id === workerId);
  if (!myWorker) return false;
  const myLoad = myWorker.active_item_ids.length;
  let strictlyHigherCount = 0;
  let tiedAtMyLoadCount = 0;
  for (const w of workers) {
    const load = w.active_item_ids.length;
    if (load > myLoad) strictlyHigherCount++;
    if (load === myLoad) tiedAtMyLoadCount++;
  }
  if (strictlyHigherCount === 0 && tiedAtMyLoadCount === 1) return false;
  return true;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/board.ts packages/engine/test/board.test.ts
git commit -m "feat(engine): board capacity checks and pull policy"
```

---

### Task 16: Multitasking math

**Files:**
- Create: `packages/engine/src/multitasking.ts`
- Create: `packages/engine/test/multitasking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { effectiveWorkHours } from "../src/multitasking.js";

describe("multitasking math", () => {
  it("returns 1 hour with no switch and no juggling", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: false, switchCostMinutes: 15, activeItemCount: 1, pacePenalty: 0.05,
    });
    expect(eff).toBe(1);
  });

  it("subtracts switch cost when switchedThisTick is true", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: true, switchCostMinutes: 15, activeItemCount: 1, pacePenalty: 0,
    });
    expect(eff).toBeCloseTo(0.75);
  });

  it("applies pace penalty when juggling many items", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: false, switchCostMinutes: 15, activeItemCount: 5, pacePenalty: 0.05,
    });
    expect(eff).toBeCloseTo(0.8);
  });

  it("combines switch cost and pace penalty", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: true, switchCostMinutes: 15, activeItemCount: 5, pacePenalty: 0.05,
    });
    expect(eff).toBeCloseTo(0.6);
  });

  it("floors pace_factor at 0.1 to prevent pathological negatives", () => {
    const eff = effectiveWorkHours({
      tickHours: 1, switchedThisTick: false, switchCostMinutes: 15, activeItemCount: 100, pacePenalty: 0.05,
    });
    expect(eff).toBeCloseTo(0.1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/multitasking.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/engine/src/multitasking.ts`**

```ts
export function effectiveWorkHours(args: {
  tickHours: number;
  switchedThisTick: boolean;
  switchCostMinutes: number;
  activeItemCount: number;
  pacePenalty: number;
}): number {
  const switchCostHours = args.switchedThisTick ? args.switchCostMinutes / 60 : 0;
  const beforePace = Math.max(0, args.tickHours - switchCostHours);
  const rawPace = 1 - args.pacePenalty * Math.max(0, args.activeItemCount - 1);
  const paceFactor = Math.max(0.1, rawPace);
  return beforePace * paceFactor;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/multitasking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/multitasking.ts packages/engine/test/multitasking.test.ts
git commit -m "feat(engine): multitasking math (switch cost + pace penalty)"
```

---

### Task 17: Worker decision tree

**Files:**
- Create: `packages/engine/src/worker.ts`
- Create: `packages/engine/test/worker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { decideWorkerAction } from "../src/worker.js";
import { createItem } from "../src/item.js";
import type { Item, Worker, ExperimentConfig } from "../src/types.js";

const baseConfig: ExperimentConfig = {
  team: { size: 3, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3, skewness: 1 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

function mkInProgress(id: number, authorId: number, effortDone: number, blocked: boolean): Item {
  return {
    ...createItem({ id, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 }),
    column: "in_progress",
    author_worker_id: authorId,
    current_worker_id: authorId,
    effort_done_hours: effortDone,
    state: blocked ? "blocked" : "in_column",
  };
}

describe("worker decision tree", () => {
  it("works on its current active item if unblocked", () => {
    const worker: Worker = { id: 1, active_item_ids: [10], last_chosen_item_id: 10 };
    const items = [mkInProgress(10, 1, 2, false)];
    const action = decideWorkerAction({ worker, allWorkers: [worker], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("work_on");
    if (action.kind === "work_on") expect(action.itemId).toBe(10);
  });

  it("with all my items blocked + start_new policy, pulls from Ready when allowed", () => {
    const worker: Worker = { id: 1, active_item_ids: [10], last_chosen_item_id: 10 };
    const items = [
      mkInProgress(10, 1, 2, true),
      { ...createItem({ id: 20, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 }), column: "ready" as const },
    ];
    const action = decideWorkerAction({ worker, allWorkers: [worker], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("pull_from_ready");
  });

  it("with all my items blocked + wait policy, idles", () => {
    const worker: Worker = { id: 1, active_item_ids: [10], last_chosen_item_id: 10 };
    const items = [mkInProgress(10, 1, 2, true)];
    const action = decideWorkerAction({
      worker, allWorkers: [worker], items,
      config: { ...baseConfig, team: { ...baseConfig.team, blocking_response: "wait" } },
      currentTick: 5,
    });
    expect(action.kind).toBe("idle");
  });

  it("does not pull validation item that the worker authored", () => {
    const worker: Worker = { id: 1, active_item_ids: [], last_chosen_item_id: null };
    const items = [
      { ...mkInProgress(10, 1, 8, false), column: "validation" as const, current_worker_id: null },
    ];
    const action = decideWorkerAction({ worker, allWorkers: [worker], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("idle");
  });

  it("pulls a validation item that another worker authored", () => {
    const worker: Worker = { id: 1, active_item_ids: [], last_chosen_item_id: null };
    const items = [
      { ...mkInProgress(10, 2, 8, false), column: "validation" as const, current_worker_id: null },
    ];
    const action = decideWorkerAction({ worker, allWorkers: [worker], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("pull_validation");
    if (action.kind === "pull_validation") expect(action.itemId).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/worker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/engine/src/worker.ts`**

```ts
import type { ExperimentConfig, Item, Worker } from "./types.js";
import { columnHasCapacity, workerCanPull } from "./board.js";

export type WorkerAction =
  | { kind: "work_on"; itemId: number }
  | { kind: "pull_from_ready"; itemId: number }
  | { kind: "pull_validation"; itemId: number }
  | { kind: "swarm_unblock"; itemId: number }
  | { kind: "idle" };

export function decideWorkerAction(args: {
  worker: Worker;
  allWorkers: Worker[];
  items: Item[];
  config: ExperimentConfig;
  currentTick: number;
}): WorkerAction {
  const { worker, items } = args;

  const myItems = items.filter((it) => worker.active_item_ids.includes(it.id));
  const myUnblocked = myItems.filter((it) => it.state === "in_column" && (it.column === "in_progress" || it.column === "validation"));
  const myBlocked = myItems.filter((it) => it.state === "blocked");

  if (myUnblocked.length > 0) {
    const picked = pickItemRoundRobin(myUnblocked, worker.last_chosen_item_id);
    return { kind: "work_on", itemId: picked.id };
  }

  if (myItems.length > 0 && myBlocked.length === myItems.length) {
    return resolveBlockingResponse(args);
  }

  if (canPullFromReady(args)) {
    const readyItem = items.find((it) => it.column === "ready");
    if (readyItem) return { kind: "pull_from_ready", itemId: readyItem.id };
  }

  const validationCandidate = items.find(
    (it) => it.column === "validation" && it.author_worker_id !== worker.id && it.current_worker_id === null,
  );
  if (validationCandidate) return { kind: "pull_validation", itemId: validationCandidate.id };

  return { kind: "idle" };
}

function pickItemRoundRobin(unblocked: Item[], lastChosenItemId: number | null): Item {
  if (unblocked.length === 1 || lastChosenItemId === null) return unblocked[0]!;
  const candidates = unblocked.filter((it) => it.id !== lastChosenItemId);
  if (candidates.length === 0) return unblocked[0]!;
  return candidates[0]!;
}

function canPullFromReady(args: {
  worker: Worker;
  allWorkers: Worker[];
  items: Item[];
  config: ExperimentConfig;
}): boolean {
  const { worker, allWorkers, items, config } = args;
  if (!items.some((it) => it.column === "ready")) return false;
  if (!columnHasCapacity(items, "in_progress", config.board.wip_in_progress)) return false;
  return workerCanPull(allWorkers, worker.id);
}

function resolveBlockingResponse(args: {
  worker: Worker;
  allWorkers: Worker[];
  items: Item[];
  config: ExperimentConfig;
  currentTick: number;
}): WorkerAction {
  const { worker, items, config } = args;
  switch (config.team.blocking_response) {
    case "wait":
      return { kind: "idle" };
    case "start_new":
      if (canPullFromReady(args)) {
        const readyItem = items.find((it) => it.column === "ready");
        if (readyItem) return { kind: "pull_from_ready", itemId: readyItem.id };
      }
      return { kind: "idle" };
    case "help_validate": {
      const candidate = items.find(
        (it) => it.column === "validation" && it.author_worker_id !== worker.id && it.current_worker_id === null,
      );
      if (candidate) return { kind: "pull_validation", itemId: candidate.id };
      return { kind: "idle" };
    }
    case "swarm_unblock": {
      const elseBlocked = items.find((it) => it.state === "blocked" && !worker.active_item_ids.includes(it.id));
      if (elseBlocked) return { kind: "swarm_unblock", itemId: elseBlocked.id };
      return { kind: "idle" };
    }
    default:
      return { kind: "idle" };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/worker.ts packages/engine/test/worker.test.ts
git commit -m "feat(engine): worker decision tree"
```

---

### Task 18: Re-export modules

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Update the index**

```ts
export const ENGINE_VERSION = "0.0.1";
export * from "./types.js";
export { createPrng, type Prng } from "./prng.js";
export { sampleLogNormal, sampleSkewNormal, sampleBetaTruncated, samplePoisson } from "./distributions.js";
export { createItem, isBlocked, advanceItemEffort, resetEffortForColumnTransition } from "./item.js";
export { columnHasCapacity, currentWorkerLoads, workerCanPull } from "./board.js";
export { effectiveWorkHours } from "./multitasking.js";
export { decideWorkerAction, type WorkerAction } from "./worker.js";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @kanbansim/engine typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "chore(engine): re-export item/board/worker/multitasking"
```

---

## Phase 4 — Tick Loop & Events (Tasks 19–22)

### Task 19: Event scheduling

**Files:**
- Create: `packages/engine/src/events.ts`
- Create: `packages/engine/test/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createEventQueue, popDueEvents } from "../src/events.js";

describe("event queue", () => {
  it("returns events whose tick is <= current tick, in time order", () => {
    const q = createEventQueue();
    q.schedule({ tick: 5, kind: "arrival", itemId: 1 });
    q.schedule({ tick: 3, kind: "unblock", itemId: 2 });
    q.schedule({ tick: 10, kind: "arrival", itemId: 3 });
    const due = popDueEvents(q, 5);
    expect(due.map((e) => e.tick)).toEqual([3, 5]);
  });

  it("leaves future events in the queue", () => {
    const q = createEventQueue();
    q.schedule({ tick: 5, kind: "arrival", itemId: 1 });
    q.schedule({ tick: 10, kind: "arrival", itemId: 3 });
    popDueEvents(q, 5);
    const remaining = popDueEvents(q, 100);
    expect(remaining.map((e) => e.tick)).toEqual([10]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/events.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/engine/src/events.ts`**

```ts
export type EngineEvent =
  | { tick: number; kind: "arrival"; itemId: number }
  | { tick: number; kind: "unblock"; itemId: number };

export type EventQueue = {
  schedule: (event: EngineEvent) => void;
  events: EngineEvent[]; // exposed for direct iteration in tests; do not mutate externally
};

export function createEventQueue(): EventQueue {
  const events: EngineEvent[] = [];
  return {
    events,
    schedule(e) {
      events.push(e);
      events.sort((a, b) => a.tick - b.tick);
    },
  };
}

export function popDueEvents(q: EventQueue, currentTick: number): EngineEvent[] {
  const due: EngineEvent[] = [];
  while (q.events.length > 0 && q.events[0]!.tick <= currentTick) {
    due.push(q.events.shift()!);
  }
  return due;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/events.ts packages/engine/test/events.test.ts
git commit -m "feat(engine): event queue with tick-ordered scheduling"
```

---

### Task 20: Metrics aggregation

**Files:**
- Create: `packages/engine/src/metrics.ts`
- Create: `packages/engine/test/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeSummary, percentile } from "../src/metrics.js";

describe("metrics helpers", () => {
  it("percentile returns the right element", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.5)).toBe(6);
    expect(percentile(values, 0.85)).toBe(9);
    expect(percentile(values, 0.95)).toBe(10);
  });

  it("computeSummary returns zeros when no items completed", () => {
    const summary = computeSummary([], 130, 6);
    expect(summary.items_completed).toBe(0);
    expect(summary.throughput_per_day).toBe(0);
  });

  it("computeSummary computes throughput per simulated day", () => {
    const completed = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      arrival_tick: 0,
      done_tick: 10,
      lead_time_hours: 10,
      blocked_hours: 0,
      validation_started_tick: 5,
    }));
    const summary = computeSummary(completed, 100, 6);
    expect(summary.items_completed).toBe(100);
    expect(summary.throughput_per_day).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/metrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/engine/src/metrics.ts`**

```ts
import type { RunResult } from "./types.js";

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

export function computeSummary(
  completed: RunResult["completed_items"],
  simDays: number,
  _productiveHoursPerDay: number,
): RunResult["summary"] {
  if (completed.length === 0) {
    return {
      throughput_per_day: 0,
      median_lead_time_hours: 0,
      p85_lead_time_hours: 0,
      p95_lead_time_hours: 0,
      max_lead_time_hours: 0,
      items_completed: 0,
    };
  }
  const leadTimes = completed.map((c) => c.lead_time_hours);
  return {
    throughput_per_day: completed.length / simDays,
    median_lead_time_hours: percentile(leadTimes, 0.5),
    p85_lead_time_hours: percentile(leadTimes, 0.85),
    p95_lead_time_hours: percentile(leadTimes, 0.95),
    max_lead_time_hours: Math.max(...leadTimes),
    items_completed: completed.length,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/metrics.ts packages/engine/test/metrics.test.ts
git commit -m "feat(engine): summary stats + percentile helper"
```

---

### Task 21: One-tick processor

**Files:**
- Create: `packages/engine/src/tick.ts`
- Create: `packages/engine/test/tick.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { processTick } from "../src/tick.js";
import { createPrng } from "../src/prng.js";
import { createItem } from "../src/item.js";
import type { ExperimentConfig, Item, Worker } from "../src/types.js";
import { createEventQueue } from "../src/events.js";

const baseConfig: ExperimentConfig = {
  team: { size: 1, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 0, effort_dist: { mu: 8, sigma: 0, skewness: 0 }, validation_effort: { kind: "fraction", fraction: 0.5 }, block_probability_per_day: 0, block_duration_dist: { mu: 4, sigma: 2, skewness: 0 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 1, tick_size_hours: 1 },
};

describe("processTick", () => {
  it("advances effort on the worker's chosen In Progress item by 1 hour", () => {
    const item: Item = { ...createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 4 }), column: "in_progress", author_worker_id: 1, current_worker_id: 1 };
    const worker: Worker = { id: 1, active_item_ids: [1], last_chosen_item_id: 1 };
    const result = processTick({ currentTick: 0, items: [item], workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    const updatedItem = result.items.find((it) => it.id === 1)!;
    expect(updatedItem.effort_done_hours).toBeCloseTo(1);
  });

  it("moves item from In Progress to Validation when effort is reached", () => {
    const item: Item = {
      ...createItem({ id: 1, arrival_tick: 0, effort_required_hours: 1, validation_effort_hours: 1 }),
      column: "in_progress", author_worker_id: 1, current_worker_id: 1, effort_done_hours: 0,
    };
    const worker: Worker = { id: 1, active_item_ids: [1], last_chosen_item_id: 1 };
    const result = processTick({ currentTick: 0, items: [item], workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    const updatedItem = result.items.find((it) => it.id === 1)!;
    expect(updatedItem.column).toBe("validation");
    expect(updatedItem.effort_done_hours).toBe(0);
  });

  it("records hours_working in time accounting", () => {
    const item: Item = { ...createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 4 }), column: "in_progress", author_worker_id: 1, current_worker_id: 1 };
    const worker: Worker = { id: 1, active_item_ids: [1], last_chosen_item_id: 1 };
    const result = processTick({ currentTick: 0, items: [item], workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.timeAccounting.get(1)!.working).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/tick.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/engine/src/tick.ts`**

```ts
import type { ExperimentConfig, Item, Worker, ColumnId } from "./types.js";
import type { Prng } from "./prng.js";
import { type EventQueue, popDueEvents } from "./events.js";
import { decideWorkerAction, type WorkerAction } from "./worker.js";
import { effectiveWorkHours } from "./multitasking.js";
import { sampleLogNormal } from "./distributions.js";

export type TickAccounting = { working: number; switching: number; blocked: number; idle: number };

export type TickResult = {
  items: Item[];
  workers: Worker[];
  events: EventQueue;
  completedThisTick: Item[];
  timeAccounting: Map<number, TickAccounting>;
};

export function processTick(args: {
  currentTick: number;
  items: Item[];
  workers: Worker[];
  events: EventQueue;
  config: ExperimentConfig;
  rng: Prng;
}): TickResult {
  const { currentTick, config, rng } = args;
  let items = [...args.items];
  let workers = args.workers.map((w) => ({ ...w }));

  // 1. Resolve due events.
  for (const event of popDueEvents(args.events, currentTick)) {
    if (event.kind === "arrival") {
      items = items.map((it) => (it.id === event.itemId && it.column === "backlog" ? { ...it, column: "ready" as ColumnId } : it));
    } else if (event.kind === "unblock") {
      items = items.map((it) => (it.id === event.itemId ? { ...it, state: "in_column" as const, blocked_until_tick: null } : it));
    }
  }

  // 2. Sample new blocks for active items.
  const tickHours = config.simulation.tick_size_hours;
  const productiveHoursPerDay = config.team.productive_hours_per_day;
  const blocksPerHour = config.work.block_probability_per_day / Math.max(1, productiveHoursPerDay);
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if ((it.column === "in_progress" || it.column === "validation") && it.state === "in_column") {
      if (rng.next() < blocksPerHour * tickHours) {
        const durationHours = Math.max(1, Math.round(sampleLogNormal(rng, config.work.block_duration_dist)));
        items[i] = { ...it, state: "blocked", blocked_until_tick: currentTick + durationHours };
        args.events.schedule({ tick: currentTick + durationHours, kind: "unblock", itemId: it.id });
      }
    }
  }

  // 3. Per-worker decisions, in randomized order.
  const order = shuffle(workers.map((w) => w.id), rng);
  const accounting: Map<number, TickAccounting> = new Map(
    workers.map((w) => [w.id, { working: 0, switching: 0, blocked: 0, idle: 0 }]),
  );
  for (const workerId of order) {
    const worker = workers.find((w) => w.id === workerId)!;
    const action = decideWorkerAction({ worker, allWorkers: workers, items, config, currentTick });
    ({ items, workers } = applyAction(action, worker, items, workers, config, accounting));
  }

  // 4. Detect completions and column transitions.
  const completedThisTick: Item[] = [];
  items = items.map((it) => {
    if (it.column === "in_progress" && it.effort_done_hours >= it.effort_required_hours) {
      const validationCount = items.filter((x) => x.column === "validation").length;
      const wip = config.board.wip_validation;
      if (wip === null || validationCount < wip) {
        return { ...it, column: "validation" as const, effort_done_hours: 0, current_worker_id: null };
      }
      return it;
    }
    if (it.column === "validation" && it.effort_done_hours >= it.validation_effort_hours) {
      const completed = { ...it, column: "done" as const, done_tick: currentTick, current_worker_id: null };
      completedThisTick.push(completed);
      return completed;
    }
    return it;
  });

  // 5. Update worker active_item_ids: remove items now in Done.
  workers = workers.map((w) => ({
    ...w,
    active_item_ids: w.active_item_ids.filter((id) => {
      const it = items.find((x) => x.id === id);
      return it !== undefined && it.column !== "done";
    }),
  }));

  return { items, workers, events: args.events, completedThisTick, timeAccounting: accounting };
}

function shuffle<T>(arr: T[], rng: Prng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function applyAction(
  action: WorkerAction,
  worker: Worker,
  items: Item[],
  workers: Worker[],
  config: ExperimentConfig,
  accounting: Map<number, TickAccounting>,
): { items: Item[]; workers: Worker[] } {
  const acc = accounting.get(worker.id)!;
  const tickHours = config.simulation.tick_size_hours;
  let workersOut = workers;
  let itemsOut = items;

  switch (action.kind) {
    case "work_on":
    case "pull_validation":
    case "swarm_unblock": {
      const item = itemsOut.find((it) => it.id === action.itemId);
      if (!item) {
        acc.idle += tickHours;
        return { items: itemsOut, workers: workersOut };
      }
      const switched = worker.last_chosen_item_id !== item.id;
      const eff = effectiveWorkHours({
        tickHours,
        switchedThisTick: switched,
        switchCostMinutes: config.team.switch_cost_minutes,
        activeItemCount: Math.max(1, worker.active_item_ids.length),
        pacePenalty: config.team.pace_penalty,
      });
      acc.working += eff;
      acc.switching += tickHours - eff;
      itemsOut = itemsOut.map((it) =>
        it.id !== action.itemId
          ? it
          : { ...it, effort_done_hours: it.effort_done_hours + eff, current_worker_id: worker.id },
      );
      if (action.kind === "pull_validation") {
        workersOut = workersOut.map((w) =>
          w.id === worker.id && !w.active_item_ids.includes(action.itemId)
            ? { ...w, active_item_ids: [...w.active_item_ids, action.itemId], last_chosen_item_id: action.itemId }
            : w,
        );
      } else {
        workersOut = workersOut.map((w) => (w.id === worker.id ? { ...w, last_chosen_item_id: action.itemId } : w));
      }
      return { items: itemsOut, workers: workersOut };
    }
    case "pull_from_ready": {
      const readyItem = itemsOut.find((it) => it.id === action.itemId && it.column === "ready");
      if (!readyItem) {
        acc.idle += tickHours;
        return { items: itemsOut, workers: workersOut };
      }
      itemsOut = itemsOut.map((it) =>
        it.id === action.itemId
          ? { ...it, column: "in_progress" as const, author_worker_id: worker.id, current_worker_id: worker.id, effort_done_hours: 0 }
          : it,
      );
      workersOut = workersOut.map((w) =>
        w.id === worker.id ? { ...w, active_item_ids: [...w.active_item_ids, action.itemId], last_chosen_item_id: action.itemId } : w,
      );
      acc.switching += tickHours;
      return { items: itemsOut, workers: workersOut };
    }
    case "idle": {
      const hasItems = worker.active_item_ids.length > 0;
      if (hasItems) acc.blocked += tickHours;
      else acc.idle += tickHours;
      return { items: itemsOut, workers: workersOut };
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/tick.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/tick.ts packages/engine/test/tick.test.ts
git commit -m "feat(engine): one-tick processor"
```

---

### Task 22: Re-export tick module

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Update the index**

```ts
export const ENGINE_VERSION = "0.0.1";
export * from "./types.js";
export { createPrng, type Prng } from "./prng.js";
export { sampleLogNormal, sampleSkewNormal, sampleBetaTruncated, samplePoisson } from "./distributions.js";
export { createItem, isBlocked, advanceItemEffort, resetEffortForColumnTransition } from "./item.js";
export { columnHasCapacity, currentWorkerLoads, workerCanPull } from "./board.js";
export { effectiveWorkHours } from "./multitasking.js";
export { decideWorkerAction, type WorkerAction } from "./worker.js";
export { createEventQueue, popDueEvents, type EngineEvent, type EventQueue } from "./events.js";
export { computeSummary, percentile } from "./metrics.js";
export { processTick, type TickResult, type TickAccounting } from "./tick.js";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @kanbansim/engine typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "chore(engine): re-export tick + events + metrics"
```

---

## Phase 5 — runSimulation API (Tasks 23–25)

### Task 23: runSimulation — failing test

**Files:**
- Create: `packages/engine/test/runSimulation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runSimulation } from "../src/runSimulation.js";
import type { ExperimentConfig } from "../src/types.js";

const minimalConfig: ExperimentConfig = {
  team: { size: 2, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 2, effort_dist: { mu: 4, sigma: 1, skewness: 0.5 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0, block_duration_dist: { mu: 2, sigma: 1, skewness: 0 } },
  board: { wip_ready: null, wip_in_progress: 3, wip_validation: 2 },
  simulation: { sim_days: 30, tick_size_hours: 1 },
};

describe("runSimulation", () => {
  it("produces a valid RunResult shape", () => {
    const result = runSimulation(minimalConfig, 42n);
    expect(result.config).toEqual(minimalConfig);
    expect(result.seed).toBe(42n);
    expect(result.completed_items).toBeInstanceOf(Array);
    expect(result.cfd).toBeInstanceOf(Array);
    expect(result.time_accounting).toBeInstanceOf(Array);
    expect(result.summary.items_completed).toBe(result.completed_items.length);
  });

  it("is deterministic given the same seed", () => {
    const a = runSimulation(minimalConfig, 42n);
    const b = runSimulation(minimalConfig, 42n);
    expect(b.summary).toEqual(a.summary);
    expect(b.completed_items).toEqual(a.completed_items);
  });

  it("produces different results for different seeds", () => {
    const a = runSimulation(minimalConfig, 1n);
    const b = runSimulation(minimalConfig, 2n);
    expect(b.summary).not.toEqual(a.summary);
  });

  it("produces non-zero throughput when arrivals and capacity allow", () => {
    const result = runSimulation(minimalConfig, 7n);
    expect(result.summary.items_completed).toBeGreaterThan(0);
    expect(result.summary.throughput_per_day).toBeGreaterThan(0);
  });

  it("CFD has total_ticks snapshots", () => {
    const result = runSimulation(minimalConfig, 7n);
    const expectedTicks = minimalConfig.simulation.sim_days * minimalConfig.team.productive_hours_per_day;
    expect(result.cfd.length).toBe(expectedTicks);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @kanbansim/engine test test/runSimulation.test.ts`
Expected: FAIL.

---

### Task 24: runSimulation — implement

**Files:**
- Create: `packages/engine/src/runSimulation.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Write the implementation**

```ts
import type {
  CfdSnapshot, ColumnId, ExperimentConfig, Item, RunResult, Worker, WorkerTimeAccounting,
} from "./types.js";
import { createPrng } from "./prng.js";
import { sampleLogNormal, samplePoisson } from "./distributions.js";
import { createItem } from "./item.js";
import { processTick } from "./tick.js";
import { createEventQueue } from "./events.js";
import { computeSummary } from "./metrics.js";

export function runSimulation(config: ExperimentConfig, seed: bigint): RunResult {
  const rng = createPrng(seed);
  const totalTicks = config.simulation.sim_days * config.team.productive_hours_per_day;
  const productiveHoursPerDay = config.team.productive_hours_per_day;

  // Pre-sample arrivals: Poisson process across all simulated days.
  const events = createEventQueue();
  const allItems: Item[] = [];
  let nextItemId = 1;
  for (let day = 0; day < config.simulation.sim_days; day++) {
    const arrivalsToday = samplePoisson(rng, config.work.arrival_rate_per_day);
    for (let a = 0; a < arrivalsToday; a++) {
      const arrivalHourOfDay = Math.floor(rng.next() * productiveHoursPerDay);
      const arrivalTick = day * productiveHoursPerDay + arrivalHourOfDay;
      const effort = Math.max(0.5, sampleLogNormal(rng, config.work.effort_dist));
      const validationEffort =
        config.work.validation_effort.kind === "fraction"
          ? Math.max(0.25, effort * config.work.validation_effort.fraction)
          : Math.max(0.25, sampleLogNormal(rng, config.work.validation_effort.dist));
      const id = nextItemId++;
      const item = createItem({ id, arrival_tick: arrivalTick, effort_required_hours: effort, validation_effort_hours: validationEffort });
      allItems.push(item);
      events.schedule({ tick: arrivalTick, kind: "arrival", itemId: id });
    }
  }

  let workers: Worker[] = Array.from({ length: config.team.size }, (_, i) => ({
    id: i + 1, active_item_ids: [], last_chosen_item_id: null,
  }));
  let items: Item[] = allItems;

  const accumulator: Map<number, WorkerTimeAccounting> = new Map(
    workers.map((w) => [w.id, { worker_id: w.id, hours_working: 0, hours_switching: 0, hours_blocked: 0, hours_idle: 0 }]),
  );

  const cfd: CfdSnapshot[] = [];

  for (let tick = 0; tick < totalTicks; tick++) {
    const result = processTick({ currentTick: tick, items, workers, events, config, rng });
    items = result.items;
    workers = result.workers;
    for (const [wid, acc] of result.timeAccounting) {
      const a = accumulator.get(wid);
      if (a) {
        a.hours_working += acc.working;
        a.hours_switching += acc.switching;
        a.hours_blocked += acc.blocked;
        a.hours_idle += acc.idle;
      }
    }
    const counts: Record<ColumnId, number> = { backlog: 0, ready: 0, in_progress: 0, validation: 0, done: 0 };
    for (const it of items) counts[it.column]++;
    cfd.push({ tick, counts });
  }

  const completed = items
    .filter((it) => it.column === "done" && it.done_tick !== null)
    .map((it) => ({
      id: it.id,
      arrival_tick: it.arrival_tick,
      done_tick: it.done_tick!,
      lead_time_hours: it.done_tick! - it.arrival_tick,
      blocked_hours: 0,
      validation_started_tick: null,
    }));

  return {
    config, seed,
    completed_items: completed,
    cfd,
    time_accounting: Array.from(accumulator.values()),
    summary: computeSummary(completed, config.simulation.sim_days, productiveHoursPerDay),
  };
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @kanbansim/engine test test/runSimulation.test.ts`
Expected: PASS.

- [ ] **Step 3: Re-export from index — add the line**

```ts
export { runSimulation } from "./runSimulation.js";
```

- [ ] **Step 4: Verify all engine tests pass together**

Run: `pnpm --filter @kanbansim/engine test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/runSimulation.ts packages/engine/src/index.ts packages/engine/test/runSimulation.test.ts
git commit -m "feat(engine): runSimulation top-level API"
```

---

### Task 25: Engine portability + purity test

**Files:**
- Create: `packages/engine/test/portability.test.ts`

This test asserts the engine purity rules hold (no Node-only or browser-only imports in `src/`) and that bit-identical determinism holds.

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { runSimulation, type ExperimentConfig } from "../src/index.js";
import { readFileSync } from "node:fs";

const config: ExperimentConfig = {
  team: { size: 3, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 3, effort_dist: { mu: 6, sigma: 2, skewness: 1 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 4, wip_validation: 2 },
  simulation: { sim_days: 60, tick_size_hours: 1 },
};

describe("engine portability and purity", () => {
  it("does not import Node built-ins or DOM globals from any engine source file", () => {
    const forbidden = ["node:", "from 'fs'", "from \"fs\"", "from 'path'", "from \"path\"", "self.postMessage", "window.", "document."];
    const files = [
      "src/types.ts", "src/prng.ts", "src/distributions.ts", "src/item.ts",
      "src/board.ts", "src/multitasking.ts", "src/worker.ts", "src/events.ts",
      "src/tick.ts", "src/metrics.ts", "src/runSimulation.ts", "src/index.ts",
    ];
    for (const f of files) {
      const content = readFileSync(`${import.meta.dirname}/../${f}`, "utf-8");
      for (const pattern of forbidden) {
        expect(content, `engine file ${f} must not contain forbidden import "${pattern}"`).not.toContain(pattern);
      }
    }
  });

  it("produces bit-identical results for the same config + seed", () => {
    const a = runSimulation(config, 0xdeadbeefn);
    const b = runSimulation(config, 0xdeadbeefn);
    expect(JSON.stringify(b.summary)).toBe(JSON.stringify(a.summary));
    expect(JSON.stringify(b.completed_items)).toBe(JSON.stringify(a.completed_items));
    expect(JSON.stringify(b.cfd)).toBe(JSON.stringify(a.cfd));
    expect(JSON.stringify(b.time_accounting)).toBe(JSON.stringify(a.time_accounting));
  });
});
```

(`node:fs` is fine in test code — only `src/` is constrained.)

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @kanbansim/engine test test/portability.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/test/portability.test.ts
git commit -m "test(engine): portability + purity guard + bit-identical determinism"
```

---

## Phase 6 — Test Fixtures (Tasks 26–28)

### Task 26: Determinism fixture

**Files:**
- Create: `packages/engine/test/fixtures/determinism.json`
- Create: `packages/engine/test/determinism.test.ts`

- [ ] **Step 1: Write the fixture**

`packages/engine/test/fixtures/determinism.json`:

```json
{
  "name": "determinism",
  "description": "Same config + same seed must produce bit-identical results across multiple runs.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "start_new" },
    "work": { "arrival_rate_per_day": 4, "effort_dist": { "mu": 8, "sigma": 3.5, "skewness": 1.2 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0.04, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_ready": null, "wip_in_progress": 5, "wip_validation": 3 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "seed": "12345"
}
```

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runSimulation, type ExperimentConfig } from "../src/index.js";

const fixture = JSON.parse(readFileSync(`${import.meta.dirname}/fixtures/determinism.json`, "utf-8")) as {
  name: string; description: string; config: ExperimentConfig; seed: string;
};

describe("fixture: determinism", () => {
  it("produces bit-identical results across 3 runs", () => {
    const seed = BigInt(fixture.seed);
    const a = runSimulation(fixture.config, seed);
    const b = runSimulation(fixture.config, seed);
    const c = runSimulation(fixture.config, seed);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @kanbansim/engine test test/determinism.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/test/fixtures/determinism.json packages/engine/test/determinism.test.ts
git commit -m "test(engine): determinism fixture"
```

---

### Task 27: Sanity-edges fixture

**Files:**
- Create: `packages/engine/test/fixtures/sanity_edges.json`
- Create: `packages/engine/test/sanity-edges.test.ts`

- [ ] **Step 1: Write the fixture**

```json
{
  "name": "sanity_edges",
  "description": "Edge cases: WIP=1, WIP=null, team=1, arrivals=0. Must not crash, hang, or produce NaN.",
  "cases": [
    {
      "name": "wip_one_single_worker",
      "config": {
        "team": { "size": 1, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "wait" },
        "work": { "arrival_rate_per_day": 1, "effort_dist": { "mu": 4, "sigma": 0, "skewness": 0 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0, "block_duration_dist": { "mu": 2, "sigma": 1, "skewness": 0 } },
        "board": { "wip_ready": null, "wip_in_progress": 1, "wip_validation": 1 },
        "simulation": { "sim_days": 30, "tick_size_hours": 1 }
      },
      "seed": "1"
    },
    {
      "name": "wip_unlimited",
      "config": {
        "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "start_new" },
        "work": { "arrival_rate_per_day": 8, "effort_dist": { "mu": 6, "sigma": 2, "skewness": 1 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0 } },
        "board": { "wip_ready": null, "wip_in_progress": null, "wip_validation": null },
        "simulation": { "sim_days": 30, "tick_size_hours": 1 }
      },
      "seed": "2"
    },
    {
      "name": "no_arrivals",
      "config": {
        "team": { "size": 3, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "wait" },
        "work": { "arrival_rate_per_day": 0, "effort_dist": { "mu": 4, "sigma": 1, "skewness": 0 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0, "block_duration_dist": { "mu": 2, "sigma": 1, "skewness": 0 } },
        "board": { "wip_ready": null, "wip_in_progress": 3, "wip_validation": 2 },
        "simulation": { "sim_days": 10, "tick_size_hours": 1 }
      },
      "seed": "3"
    }
  ]
}
```

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runSimulation, type ExperimentConfig } from "../src/index.js";

const fixture = JSON.parse(readFileSync(`${import.meta.dirname}/fixtures/sanity_edges.json`, "utf-8")) as {
  cases: Array<{ name: string; config: ExperimentConfig; seed: string }>;
};

describe("fixture: sanity_edges", () => {
  for (const c of fixture.cases) {
    it(`runs without crashing: ${c.name}`, () => {
      const start = Date.now();
      const result = runSimulation(c.config, BigInt(c.seed));
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
      expect(Number.isFinite(result.summary.throughput_per_day)).toBe(true);
      expect(Number.isFinite(result.summary.median_lead_time_hours)).toBe(true);
      expect(result.summary.items_completed).toBeGreaterThanOrEqual(0);
    });
  }

  it("no-arrivals case produces zero items_completed", () => {
    const c = fixture.cases.find((x) => x.name === "no_arrivals")!;
    const result = runSimulation(c.config, BigInt(c.seed));
    expect(result.summary.items_completed).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @kanbansim/engine test test/sanity-edges.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/test/fixtures/sanity_edges.json packages/engine/test/sanity-edges.test.ts
git commit -m "test(engine): sanity edges fixture (WIP=1, unlimited, no arrivals)"
```

---

### Task 28: Regression baseline fixture

**Files:**
- Create: `packages/engine/test/fixtures/regression_baseline.json`
- Create: `packages/engine/test/regression.test.ts`

- [ ] **Step 1: Write the fixture (with placeholder baseline values to be filled)**

```json
{
  "name": "regression_baseline",
  "description": "Moderate-everything config. Baseline summary stats are recorded; unintended drift fails the test.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "start_new" },
    "work": { "arrival_rate_per_day": 4, "effort_dist": { "mu": 8, "sigma": 3.5, "skewness": 1.2 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0.04, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_ready": null, "wip_in_progress": 5, "wip_validation": 3 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "seed": "987654321",
  "baseline": {
    "items_completed": null,
    "throughput_per_day": null,
    "median_lead_time_hours": null,
    "p95_lead_time_hours": null
  }
}
```

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runSimulation, type ExperimentConfig } from "../src/index.js";

const fixture = JSON.parse(readFileSync(`${import.meta.dirname}/fixtures/regression_baseline.json`, "utf-8")) as {
  config: ExperimentConfig;
  seed: string;
  baseline: {
    items_completed: number | null;
    throughput_per_day: number | null;
    median_lead_time_hours: number | null;
    p95_lead_time_hours: number | null;
  };
};

describe("fixture: regression_baseline", () => {
  it("matches the recorded baseline within 5%", () => {
    expect(fixture.baseline.items_completed, "Baseline not yet populated; run the engine and update fixture.").not.toBeNull();
    const result = runSimulation(fixture.config, BigInt(fixture.seed));
    const drift = (actual: number, expected: number) => Math.abs(actual - expected) / Math.max(0.1, expected);
    expect(drift(result.summary.items_completed, fixture.baseline.items_completed!)).toBeLessThan(0.05);
    expect(drift(result.summary.throughput_per_day, fixture.baseline.throughput_per_day!)).toBeLessThan(0.05);
    expect(drift(result.summary.median_lead_time_hours, fixture.baseline.median_lead_time_hours!)).toBeLessThan(0.05);
    expect(drift(result.summary.p95_lead_time_hours, fixture.baseline.p95_lead_time_hours!)).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 3: Run the test once to confirm baseline-not-populated state**

Run: `pnpm --filter @kanbansim/engine test test/regression.test.ts`
Expected: FAIL with "Baseline not yet populated".

- [ ] **Step 4: Populate the baseline by running a one-off compute script**

Create a temporary file `packages/engine/scripts/compute-baseline.ts`:

```ts
import { runSimulation } from "../src/index.js";
import { readFileSync } from "node:fs";

const fix = JSON.parse(readFileSync("test/fixtures/regression_baseline.json", "utf-8"));
const r = runSimulation(fix.config, BigInt(fix.seed));
console.log(JSON.stringify({
  items_completed: r.summary.items_completed,
  throughput_per_day: r.summary.throughput_per_day,
  median_lead_time_hours: r.summary.median_lead_time_hours,
  p95_lead_time_hours: r.summary.p95_lead_time_hours,
}, null, 2));
```

Run: `pnpm --filter @kanbansim/engine exec tsx scripts/compute-baseline.ts`
Expected: prints a JSON object with four numeric fields.

Copy the printed JSON values into `packages/engine/test/fixtures/regression_baseline.json` under the `baseline` key, replacing the `null` placeholders.

Delete the script file:

Run: `rm packages/engine/scripts/compute-baseline.ts && rmdir packages/engine/scripts 2>/dev/null || true`

- [ ] **Step 5: Run the regression test again**

Run: `pnpm --filter @kanbansim/engine test test/regression.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full engine test suite**

Run: `pnpm --filter @kanbansim/engine test`
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/test/fixtures/regression_baseline.json packages/engine/test/regression.test.ts
git commit -m "test(engine): regression baseline fixture"
```

---

## Phase 7 — CLI (Tasks 29–31)

### Task 29: Scenario configs

**Files:**
- Create: `scenarios/sweet-spot.json`
- Create: `scenarios/qa-bottleneck.json`
- Create: `scenarios/multitasking-tax.json`

- [ ] **Step 1: Write `scenarios/sweet-spot.json`**

```json
{
  "name": "The Sweet Spot",
  "description": "WIP swept 1->15 to find the optimal point.",
  "lesson": "Little's Law made visible.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "start_new" },
    "work": { "arrival_rate_per_day": 4, "effort_dist": { "mu": 8, "sigma": 3.5, "skewness": 1.2 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0.04, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_ready": null, "wip_in_progress": 5, "wip_validation": 3 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "sweep": { "variable": "board.wip_in_progress", "min": 1, "max": 15, "step": 1 }
}
```

- [ ] **Step 2: Write `scenarios/qa-bottleneck.json`**

```json
{
  "name": "The QA Bottleneck",
  "description": "InProgress WIP=8, Validation WIP swept 1->6.",
  "lesson": "Per-column WIP must be balanced; bottlenecks form at the lowest-capacity column.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "start_new" },
    "work": { "arrival_rate_per_day": 4, "effort_dist": { "mu": 8, "sigma": 3.5, "skewness": 1.2 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0.04, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_ready": null, "wip_in_progress": 8, "wip_validation": 3 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "sweep": { "variable": "board.wip_validation", "min": 1, "max": 6, "step": 1 }
}
```

- [ ] **Step 3: Write `scenarios/multitasking-tax.json`**

```json
{
  "name": "The Multitasking Tax",
  "description": "Switch cost swept 0 -> 60 minutes at high WIP.",
  "lesson": "Multitasking has a real cost; high WIP is only cheap if switching is free.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15, "pace_penalty": 0.05, "worker_pick_policy": "round_robin", "blocking_response": "start_new" },
    "work": { "arrival_rate_per_day": 4, "effort_dist": { "mu": 8, "sigma": 3.5, "skewness": 1.2 }, "validation_effort": { "kind": "fraction", "fraction": 0.3 }, "block_probability_per_day": 0.04, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_ready": null, "wip_in_progress": 15, "wip_validation": 6 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "sweep": { "variable": "team.switch_cost_minutes", "min": 0, "max": 60, "step": 5 }
}
```

- [ ] **Step 4: Commit**

```bash
git add scenarios/sweet-spot.json scenarios/qa-bottleneck.json scenarios/multitasking-tax.json
git commit -m "feat: define three canonical preset scenarios"
```

---

### Task 30: CLI implementation

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/sweep.ts`

- [ ] **Step 1: Write `packages/cli/src/sweep.ts`**

```ts
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
```

- [ ] **Step 2: Rewrite `packages/cli/src/index.ts`**

```ts
import { runSimulation, type ExperimentConfig } from "@kanbansim/engine";
import { readFileSync, writeFileSync } from "node:fs";
import { setAtPath, generateSweepValues } from "./sweep.js";

type ScenarioFile = {
  name: string;
  description: string;
  lesson?: string;
  config: ExperimentConfig;
  sweep?: { variable: string; min: number; max: number; step: number };
};

function parseArgs(argv: string[]): { scenarioPath: string; runs: number; outPath: string; masterSeed: bigint } {
  let scenarioPath = "";
  let runs = 100;
  let outPath = "results.json";
  let masterSeed = 1n;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") scenarioPath = argv[++i] ?? "";
    else if (argv[i] === "--runs") runs = parseInt(argv[++i] ?? "100", 10);
    else if (argv[i] === "--out") outPath = argv[++i] ?? "results.json";
    else if (argv[i] === "--seed") masterSeed = BigInt(argv[++i] ?? "1");
  }
  if (!scenarioPath) {
    console.error("Usage: kanbansim --config <scenario.json> [--runs N] [--out file.json] [--seed N]");
    process.exit(2);
  }
  return { scenarioPath, runs, outPath, masterSeed };
}

function deriveSeed(master: bigint, cellIndex: number, runIndex: number): bigint {
  const a = master ^ (BigInt(cellIndex) * 0x9e3779b97f4a7c15n);
  const b = a ^ (BigInt(runIndex) * 0xbf58476d1ce4e5b9n);
  return b & 0xffffffffffffffffn;
}

async function main() {
  const { scenarioPath, runs, outPath, masterSeed } = parseArgs(process.argv.slice(2));
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf-8")) as ScenarioFile;

  const sweepValues = scenario.sweep
    ? generateSweepValues(scenario.sweep.min, scenario.sweep.max, scenario.sweep.step)
    : [null];

  const cells: Array<{ sweep_value: number | null; runs: ReturnType<typeof runSimulation>[] }> = [];
  const startWall = Date.now();

  for (let cellIdx = 0; cellIdx < sweepValues.length; cellIdx++) {
    const sv = sweepValues[cellIdx]!;
    const cellConfig = scenario.sweep ? setAtPath(scenario.config, scenario.sweep.variable, sv) : scenario.config;
    const cellRuns: ReturnType<typeof runSimulation>[] = [];
    for (let r = 0; r < runs; r++) {
      const seed = deriveSeed(masterSeed, cellIdx, r);
      cellRuns.push(runSimulation(cellConfig, seed));
    }
    cells.push({ sweep_value: sv, runs: cellRuns });
    process.stdout.write(`\rcell ${cellIdx + 1}/${sweepValues.length} done · ${runs} runs/cell`);
  }
  process.stdout.write("\n");

  const elapsedMs = Date.now() - startWall;

  const out = {
    scenario: { name: scenario.name, description: scenario.description, lesson: scenario.lesson ?? null },
    sweep: scenario.sweep ?? null,
    runs_per_cell: runs,
    master_seed: masterSeed.toString(),
    elapsed_ms: elapsedMs,
    cells: cells.map((c) => ({
      sweep_value: c.sweep_value,
      summaries: c.runs.map((r) => r.summary),
    })),
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath} (${cells.length} cells x ${runs} runs in ${elapsedMs}ms).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @kanbansim/cli typecheck`
Expected: exits 0.

- [ ] **Step 4: Smoke-run the CLI against Sweet Spot at low run count**

Run: `pnpm --filter @kanbansim/cli exec tsx src/index.ts --config ../../scenarios/sweet-spot.json --runs 10 --out /tmp/sweet-spot-results.json`
Expected: prints progress per cell; final line `Wrote /tmp/sweet-spot-results.json (15 cells x 10 runs in NNNms).`

- [ ] **Step 5: Verify output file shape**

Run: `node --eval "const r = JSON.parse(require('fs').readFileSync('/tmp/sweet-spot-results.json','utf-8')); console.log('cells:', r.cells.length, 'runs/cell:', r.cells[0].summaries.length, 'sample summary:', JSON.stringify(r.cells[7].summaries[0], null, 2));"`
Expected: prints `cells: 15`, `runs/cell: 10`, and a summary object.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/sweep.ts
git commit -m "feat(cli): scenario sweep runner with deterministic per-cell seeds"
```

---

### Task 31: CLI smoke test

**Files:**
- Create: `packages/cli/test/cli.test.ts`
- Create: `packages/cli/vitest.config.ts`

- [ ] **Step 1: Create `packages/cli/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    typecheck: { enabled: false },
  },
});
```

- [ ] **Step 2: Write the smoke test using `execFileSync` (no shell, args as array)**

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("CLI smoke", () => {
  it("runs the Sweet Spot scenario at low run count and writes a valid result file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kanbansim-cli-"));
    const out = join(tmp, "results.json");
    const scenarioPath = join(__dirname, "..", "..", "..", "scenarios", "sweet-spot.json");
    execFileSync(
      "pnpm",
      [
        "--silent", "--filter", "@kanbansim/cli", "exec", "tsx", "src/index.ts",
        "--config", scenarioPath,
        "--runs", "5",
        "--out", out,
        "--seed", "42",
      ],
      { stdio: "ignore" },
    );
    const result = JSON.parse(readFileSync(out, "utf-8"));
    expect(result.scenario.name).toBe("The Sweet Spot");
    expect(result.cells.length).toBe(15);
    expect(result.cells[0].summaries.length).toBe(5);
    for (const cell of result.cells) {
      for (const s of cell.summaries) {
        expect(Number.isFinite(s.throughput_per_day)).toBe(true);
        expect(Number.isFinite(s.median_lead_time_hours)).toBe(true);
      }
    }
  }, 30_000);
});
```

- [ ] **Step 3: Run the smoke test**

Run: `pnpm --filter @kanbansim/cli test`
Expected: PASS within ~10–20 seconds.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/test/cli.test.ts packages/cli/vitest.config.ts
git commit -m "test(cli): smoke test against Sweet Spot scenario"
```

---

## Phase 8 — End-to-end Validation (Tasks 32–33)

### Task 32: Workspace test suite end-to-end

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all engine tests pass + CLI smoke test passes.

- [ ] **Step 2: Run typecheck workspace-wide**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 3: Spot-check the engine purity guard**

Run: `pnpm --filter @kanbansim/engine test test/portability.test.ts`
Expected: PASS.

- [ ] **Step 4: No commit (verification step)**

---

### Task 33: Run all three preset scenarios at scale and qualitatively validate

- [ ] **Step 1: Run Sweet Spot at 1000 runs/cell**

Run: `pnpm --filter @kanbansim/cli exec tsx src/index.ts --config ../../scenarios/sweet-spot.json --runs 1000 --out /tmp/sweet-spot-1k.json --seed 1`
Expected: completes in under 60 seconds on a modern laptop.

- [ ] **Step 2: Inspect Sweet Spot summary across cells**

Run a small inline script (write to a temp file, run it, delete it):

```bash
cat > /tmp/inspect.mjs <<'EOF'
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('/tmp/sweet-spot-1k.json', 'utf-8'));
for (const cell of r.cells) {
  const s = cell.summaries;
  const meanLT = s.reduce((a, b) => a + b.median_lead_time_hours, 0) / s.length;
  const meanTP = s.reduce((a, b) => a + b.throughput_per_day, 0) / s.length;
  console.log('WIP', cell.sweep_value, 'meanMedianLT(hrs)', meanLT.toFixed(1), 'meanThroughput', meanTP.toFixed(2));
}
EOF
node /tmp/inspect.mjs
rm /tmp/inspect.mjs
```

Expected: lead time decreases from WIP=1, bottoms out around WIP=4–7, then rises at WIP>10. Throughput rises and plateaus. **The U-curve is visible in the numbers.** If it isn't, the engine has a real bug — investigate before proceeding to Plan 2.

- [ ] **Step 3: Run QA Bottleneck**

Run: `pnpm --filter @kanbansim/cli exec tsx src/index.ts --config ../../scenarios/qa-bottleneck.json --runs 1000 --out /tmp/qa-bottleneck-1k.json --seed 1`
Expected: lead time at Validation WIP=1 should be much higher than at Validation WIP=6.

- [ ] **Step 4: Run Multitasking Tax**

Run: `pnpm --filter @kanbansim/cli exec tsx src/index.ts --config ../../scenarios/multitasking-tax.json --runs 1000 --out /tmp/mt-tax-1k.json --seed 1`
Expected: at switch_cost=0, throughput is high; as switch_cost rises, throughput drops monotonically.

- [ ] **Step 5: No commit (validation step)**

If any of the three scenarios produces results that don't match the expected qualitative shape, the engine has a bug and must be debugged before Plan 2 begins.

---

## Self-Review

**Spec coverage check (per design doc §):**

- §5.1 Board (5 columns, per-column WIP) → Tasks 6, 14, 15, 21
- §5.2 Workers + peer-review rule → Tasks 17, 21
- §5.3 Hourly lockstep ticks → Tasks 19, 21, 24
- §5.4 Worker decision tree → Task 17
- §5.5 Multitasking math → Task 16
- §5.6 Item lifecycle, distributions, validation effort modes → Tasks 6, 11, 14, 24
- §5.7 Determinism → Tasks 7, 8, 25, 26
- §6 Experiment model (config, sweep) → Tasks 6, 24, 30
- §7 Architecture (purity, A* layering, CLI) → Tasks 1–5, 25, 30
- §11 Scenarios (3 presets + 3 fixtures) → Tasks 26, 27, 28, 29

**Items deferred to Plan 2 (web UI):**
- Per-run randomization of variables marked "randomize this" (cross-run sampling). The CLI runs a single config across the sweep; cross-run randomization is the orchestrator's job. Plan 2 (web) handles this.
- The `blocked_hours` field on completed items is recorded as 0 in MVP. Fill in if a v1.5 chart needs it.

**Type consistency check:**
- `ExperimentConfig`, `RunResult`, `Item`, `Worker`, `WorkerAction`, `EngineEvent` consistent across tasks 6, 17, 19, 21, 24.
- `validation_effort` mode union (`fraction` | `distribution`) consistent in spec, type definition, and runSimulation usage.
- Function signatures consistent: `runSimulation(config, seed: bigint)`, `processTick(args)`, `decideWorkerAction(args)`, `effectiveWorkHours(args)`.

**Placeholder scan:**
- One legitimate placeholder: `packages/engine/test/fixtures/regression_baseline.json` baseline values. Task 28 explicitly populates them via a one-off script and re-runs the test. This is a recorded baseline, not a TODO.
- Task 13 reserved as a no-op coverage-gap-fill slot. If unused after Phase 3, leave it empty in the final PR; it's not load-bearing.
- No other "TBD"/"TODO"/"implement later" patterns.

---

## Execution Handoff

**Plan complete and saved to [docs/superpowers/plans/2026-04-28-kanbansim-engine-mvp.md](docs/superpowers/plans/2026-04-28-kanbansim-engine-mvp.md).**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for catching mistakes early; subagent has clean context per task.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints.

After Plan 1 ships and the engine is validated (the three preset scenarios produce U-curves in the numbers), I write **Plan 2: web app** — UI on top of the validated engine, ~50–70 tasks, ending in a deployable site.

**Which approach?**
