# Simplified Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-column (backlog→in_progress→validation→done) engine with a three-column model where eager workers fill WIP slots greedily using daily-amortized multitasking.

**Architecture:** The engine's pull model moves from per-tick per-worker decisions (worker.ts) to a centralized replenishment loop in processTick: fill WIP to the limit (FIFO, fewest-assigned worker wins), then compute per-worker daily allocations across all assigned items. The validation column, its WIP limit, blocking_response, and worker_pick_policy are deleted entirely.

**Tech Stack:** TypeScript, Vitest, React, pnpm workspaces. Run tests with `pnpm --filter @kanbansim/engine test` and `pnpm --filter @kanbansim/web test`.

---

## File Map

**Delete:**
- `packages/engine/src/worker.ts` — replaced by replenishment logic in tick.ts
- `packages/engine/src/multitasking.ts` — replaced by daily-amortized allocation in tick.ts
- `packages/engine/src/board.ts` — helpers no longer needed; WIP check is inline in tick.ts
- `packages/engine/test/worker.test.ts`
- `packages/engine/test/multitasking.test.ts`
- `packages/engine/test/board.test.ts`

**Rewrite:**
- `packages/engine/src/types.ts` — remove validation column, trim config shape, trim Item and Worker
- `packages/engine/src/item.ts` — remove validation_effort_hours, fix advanceItemEffort
- `packages/engine/src/tick.ts` — full rewrite: replenishment phase + daily-amortized work
- `packages/engine/src/index.ts` — remove dead exports
- `packages/engine/src/runSimulation.ts` — remove validation effort sampling, update CFD
- `packages/engine/test/tick.test.ts` — full rewrite for new model
- `packages/engine/test/item.test.ts` — remove validation_effort_hours from createItem calls
- `packages/engine/test/runSimulation.test.ts` — update config shape
- `packages/engine/test/portability.test.ts` — update file list and config shape
- `packages/engine/test/fixtures/regression_baseline.json` — update config, reset baseline to null
- `packages/engine/test/fixtures/sanity_edges.json` — update all configs
- `scenarios/sweet-spot.json` — remove dead fields, rename wip_in_progress→wip_limit, fold effort
- `scenarios/qa-bottleneck.json` — repurpose as high-demand arrival pressure scenario
- `scenarios/multitasking-tax.json` — remove dead fields
- `packages/web/src/orchestrator/aggregator.ts` — remove validation column
- `packages/web/src/charts/BoardLoadChart.tsx` — remove validation series
- `packages/web/src/pages/configurator/BoardTab.tsx` — remove validation WIP, rename field
- `packages/web/src/pages/configurator/WorkTab.tsx` — finer arrival rate step, remove validation_effort
- `packages/web/src/pages/configurator/MonteCarloTab.tsx` — remove wip_validation option, update path
- `packages/web/src/components/ConfigStrip.tsx` — remove validation WIP and blocked policy rows
- `packages/web/src/lib/tooltips.ts` — remove stale tooltip keys
- `packages/web/src/state/presets.ts` — update descriptions
- `packages/web/src/pages/Learn.tsx` — remove validation references
- `packages/web/test/useConfigurator.test.tsx` — update config shape
- `packages/web/test/urlCodec.test.ts` — update config shape
- `packages/web/test/tooltips.test.ts` — remove stale key assertions
- `packages/web/test/pool.test.ts` — update config shape
- `packages/web/test/randomization.test.ts` — update config shape
- `packages/web/test/build-roundtrip.test.tsx` — update config shape
- `packages/web/test/share-roundtrip.test.tsx` — update config shape

---

## Task 1: Update engine types

**Files:**
- Modify: `packages/engine/src/types.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
// Core type definitions for the KanbanSim engine.
// All types are JSON-serializable so configs and results cross any boundary.

export type DistributionSpec = {
  mu: number;
  sigma: number;
  skewness: number;
};

export type ExperimentConfig = {
  team: {
    size: number;
    productive_hours_per_day: number;
    switch_cost_minutes: number;
  };
  work: {
    arrival_rate_per_day: number;
    effort_dist: DistributionSpec;
    block_probability_per_day: number;
    block_duration_dist: DistributionSpec;
  };
  board: {
    wip_limit: number | null;
  };
  simulation: {
    sim_days: number;
    tick_size_hours: number;
  };
};

export type ColumnId = "backlog" | "in_progress" | "done";

export type ItemState = "in_column" | "blocked";

export type Item = {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
  effort_done_hours: number;
  column: ColumnId;
  arrived: boolean;
  state: ItemState;
  author_worker_id: number | null;
  current_worker_id: number | null;
  done_tick: number | null;
  blocked_until_tick: number | null;
};

export type Worker = {
  id: number;
  active_item_ids: number[];
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
    items_arrived: number;
  };
};
```

- [ ] **Step 2: Verify TypeScript catches the cascading errors**

```bash
cd /Users/chris/Documents/ai/kanbansim/.claude/worktrees/nifty-haibt-e00ab7
pnpm --filter @kanbansim/engine exec tsc --noEmit 2>&1 | head -40
```

Expected: many errors in item.ts, tick.ts, worker.ts, board.ts, runSimulation.ts — this is expected. We'll fix them in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/types.ts
git commit -m "refactor(engine/types): three-column model, eager-worker config shape"
```

---

## Task 2: Rewrite item.ts

**Files:**
- Modify: `packages/engine/src/item.ts`

- [ ] **Step 1: Replace the file**

```typescript
import type { Item } from "./types.js";

export function createItem(args: {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
}): Item {
  return {
    id: args.id,
    arrival_tick: args.arrival_tick,
    effort_required_hours: args.effort_required_hours,
    effort_done_hours: 0,
    column: "backlog",
    arrived: false,
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
  if (hours <= 0 || item.column !== "in_progress") return item;
  return { ...item, effort_done_hours: Math.min(item.effort_required_hours, item.effort_done_hours + hours) };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/item.ts
git commit -m "refactor(engine/item): remove validation_effort_hours"
```

---

## Task 3: Rewrite tick.ts (core new model)

**Files:**
- Modify: `packages/engine/src/tick.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import type { ExperimentConfig, Item, Worker, ColumnId } from "./types.js";
import type { Prng } from "./prng.js";
import { type EventQueue, popDueEvents } from "./events.js";
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
      items = items.map((it) => (it.id === event.itemId ? { ...it, arrived: true } : it));
    } else if (event.kind === "unblock") {
      items = items.map((it) =>
        it.id === event.itemId ? { ...it, state: "in_column" as const, blocked_until_tick: null } : it,
      );
    }
  }

  // 2. Sample new blocks for active in_progress items.
  const tickHours = config.simulation.tick_size_hours;
  const productiveHoursPerDay = config.team.productive_hours_per_day;
  const blocksPerHour = config.work.block_probability_per_day / Math.max(1, productiveHoursPerDay);
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.column === "in_progress" && it.state === "in_column") {
      if (rng.next() < blocksPerHour * tickHours) {
        const durationHours = Math.max(1, Math.round(sampleLogNormal(rng, config.work.block_duration_dist)));
        items[i] = { ...it, state: "blocked", blocked_until_tick: currentTick + durationHours };
        args.events.schedule({ tick: currentTick + durationHours, kind: "unblock", itemId: it.id });
      }
    }
  }

  // 3. Replenishment: fill WIP to limit, FIFO from backlog, fewest-assigned worker wins each slot.
  const pullsByWorker = new Map<number, number>();
  const wipLimit = config.board.wip_limit;
  while (true) {
    const inProgressCount = items.filter((it) => it.column === "in_progress").length;
    if (wipLimit !== null && inProgressCount >= wipLimit) break;
    const backlogItem = items
      .filter((it) => it.column === "backlog" && it.arrived)
      .sort((a, b) => a.arrival_tick - b.arrival_tick || a.id - b.id)[0];
    if (!backlogItem) break;
    const worker = workers
      .slice()
      .sort((a, b) => a.active_item_ids.length - b.active_item_ids.length || a.id - b.id)[0]!;
    items = items.map((it) =>
      it.id === backlogItem.id
        ? { ...it, column: "in_progress" as const, author_worker_id: worker.id, current_worker_id: worker.id }
        : it,
    );
    workers = workers.map((w) =>
      w.id === worker.id ? { ...w, active_item_ids: [...w.active_item_ids, backlogItem.id] } : w,
    );
    pullsByWorker.set(worker.id, (pullsByWorker.get(worker.id) ?? 0) + 1);
  }

  // 4. Work phase: daily-amortized allocation across each worker's assigned items.
  // Workers touch every unblocked item each day; switch cost paid once per inter-item
  // transition (K-1 per day) plus once per new item pulled this tick.
  const switchCostHours = config.team.switch_cost_minutes / 60;
  const accounting: Map<number, TickAccounting> = new Map(
    workers.map((w) => [w.id, { working: 0, switching: 0, blocked: 0, idle: 0 }]),
  );

  for (const worker of workers) {
    const acc = accounting.get(worker.id)!;
    const myItems = items.filter((it) => worker.active_item_ids.includes(it.id));
    const unblocked = myItems.filter((it) => it.state === "in_column" && it.column === "in_progress");
    const K = unblocked.length;
    const pulls = pullsByWorker.get(worker.id) ?? 0;

    if (K === 0) {
      if (myItems.length > 0) {
        acc.blocked += tickHours;
      } else {
        acc.idle += tickHours;
      }
      continue;
    }

    const dailySwitchOverhead = Math.max(0, K - 1 + pulls) * switchCostHours;
    const dailyUsefulHours = Math.max(0, productiveHoursPerDay - dailySwitchOverhead);
    const perItemPerTick = (dailyUsefulHours / K / productiveHoursPerDay) * tickHours;
    const tickUsefulHours = (dailyUsefulHours / productiveHoursPerDay) * tickHours;

    const unblockedIds = new Set(unblocked.map((it) => it.id));
    items = items.map((it) =>
      unblockedIds.has(it.id) ? { ...it, effort_done_hours: it.effort_done_hours + perItemPerTick } : it,
    );

    acc.working += tickUsefulHours;
    acc.switching += Math.max(0, tickHours - tickUsefulHours);
  }

  // 5. Detect completions: in_progress items whose effort is done move directly to done.
  const completedThisTick: Item[] = [];
  items = items.map((it) => {
    if (it.column === "in_progress" && it.effort_done_hours >= it.effort_required_hours) {
      const completed = { ...it, column: "done" as const, done_tick: currentTick, current_worker_id: null };
      completedThisTick.push(completed);
      return completed;
    }
    return it;
  });

  // 6. Remove completed items from worker queues.
  workers = workers.map((w) => ({
    ...w,
    active_item_ids: w.active_item_ids.filter((id) => {
      const it = items.find((x) => x.id === id);
      return it !== undefined && it.column !== "done";
    }),
  }));

  return { items, workers, events: args.events, completedThisTick, timeAccounting: accounting };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/tick.ts
git commit -m "feat(engine/tick): replenishment + daily-amortized work model, drop validation"
```

---

## Task 4: Update runSimulation.ts

**Files:**
- Modify: `packages/engine/src/runSimulation.ts`

- [ ] **Step 1: Replace the file**

```typescript
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

  const events = createEventQueue();
  const allItems: Item[] = [];
  let nextItemId = 1;
  for (let day = 0; day < config.simulation.sim_days; day++) {
    const arrivalsToday = samplePoisson(rng, config.work.arrival_rate_per_day);
    for (let a = 0; a < arrivalsToday; a++) {
      const arrivalHourOfDay = Math.floor(rng.next() * productiveHoursPerDay);
      const arrivalTick = day * productiveHoursPerDay + arrivalHourOfDay;
      const effort = Math.max(0.5, sampleLogNormal(rng, config.work.effort_dist));
      const id = nextItemId++;
      const item = createItem({ id, arrival_tick: arrivalTick, effort_required_hours: effort });
      allItems.push(item);
      events.schedule({ tick: arrivalTick, kind: "arrival", itemId: id });
    }
  }

  let workers: Worker[] = Array.from({ length: config.team.size }, (_, i) => ({
    id: i + 1, active_item_ids: [],
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
    const counts: Record<ColumnId, number> = { backlog: 0, in_progress: 0, done: 0 };
    for (const it of items) {
      if (it.arrived) counts[it.column]++;
    }
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
    }));

  const itemsArrived = items.filter((it) => it.arrived).length;
  const baseSummary = computeSummary(completed, config.simulation.sim_days, productiveHoursPerDay);

  return {
    config, seed,
    completed_items: completed,
    cfd,
    time_accounting: Array.from(accumulator.values()),
    summary: { ...baseSummary, items_arrived: itemsArrived },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/engine/src/runSimulation.ts
git commit -m "refactor(engine/runSimulation): remove validation effort, three-column CFD"
```

---

## Task 5: Delete dead engine files and update index.ts

**Files:**
- Delete: `packages/engine/src/worker.ts`
- Delete: `packages/engine/src/multitasking.ts`
- Delete: `packages/engine/src/board.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Delete the three files**

```bash
rm packages/engine/src/worker.ts packages/engine/src/multitasking.ts packages/engine/src/board.ts
```

- [ ] **Step 2: Replace index.ts**

```typescript
export const ENGINE_VERSION = "0.0.1";
export * from "./types.js";
export { createPrng, type Prng } from "./prng.js";
export { sampleLogNormal, sampleSkewNormal, sampleBetaTruncated, samplePoisson } from "./distributions.js";
export { createItem, isBlocked, advanceItemEffort } from "./item.js";
export { createEventQueue, popDueEvents, type EngineEvent, type EventQueue } from "./events.js";
export { computeSummary, percentile } from "./metrics.js";
export { processTick, type TickResult, type TickAccounting } from "./tick.js";
export { runSimulation } from "./runSimulation.js";
export { setAtPath, generateSweepValues } from "./sweep.js";
```

- [ ] **Step 3: Typecheck the engine**

```bash
pnpm --filter @kanbansim/engine exec tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/index.ts
git rm packages/engine/src/worker.ts packages/engine/src/multitasking.ts packages/engine/src/board.ts
git commit -m "refactor(engine): delete worker.ts, multitasking.ts, board.ts; trim index exports"
```

---

## Task 6: Rewrite engine tests

**Files:**
- Delete: `packages/engine/test/worker.test.ts`
- Delete: `packages/engine/test/multitasking.test.ts`
- Delete: `packages/engine/test/board.test.ts`
- Rewrite: `packages/engine/test/tick.test.ts`
- Modify: `packages/engine/test/item.test.ts`
- Modify: `packages/engine/test/runSimulation.test.ts`
- Modify: `packages/engine/test/portability.test.ts`
- Modify: `packages/engine/test/fixtures/regression_baseline.json`
- Modify: `packages/engine/test/fixtures/sanity_edges.json`

- [ ] **Step 1: Delete the three test files**

```bash
rm packages/engine/test/worker.test.ts packages/engine/test/multitasking.test.ts packages/engine/test/board.test.ts
```

- [ ] **Step 2: Write new tick.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import { processTick } from "../src/tick.js";
import { createPrng } from "../src/prng.js";
import { createItem } from "../src/item.js";
import type { ExperimentConfig, Item, Worker } from "../src/types.js";
import { createEventQueue } from "../src/events.js";

const baseConfig: ExperimentConfig = {
  team: { size: 3, productive_hours_per_day: 6, switch_cost_minutes: 0 },
  work: { arrival_rate_per_day: 0, effort_dist: { mu: 8, sigma: 0, skewness: 0 }, block_probability_per_day: 0, block_duration_dist: { mu: 4, sigma: 2, skewness: 0 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 1, tick_size_hours: 1 },
};

function backlogItem(id: number, arrivalTick = 0): Item {
  return { ...createItem({ id, arrival_tick: arrivalTick, effort_required_hours: 8 }), arrived: true };
}

function ipItem(id: number, effortDone: number, effortRequired = 8, workerId = 1): Item {
  return {
    ...createItem({ id, arrival_tick: 0, effort_required_hours: effortRequired }),
    column: "in_progress", arrived: true,
    author_worker_id: workerId, current_worker_id: workerId, effort_done_hours: effortDone,
  };
}

function worker(id: number, activeIds: number[] = []): Worker {
  return { id, active_item_ids: activeIds };
}

describe("replenishment", () => {
  it("pulls an arrived backlog item when WIP has room", () => {
    const item = backlogItem(1);
    const w = worker(1);
    const result = processTick({ currentTick: 0, items: [item], workers: [w], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.items.find((it) => it.id === 1)!.column).toBe("in_progress");
    expect(result.workers.find((w) => w.id === 1)!.active_item_ids).toContain(1);
  });

  it("does NOT pull when WIP is at the limit", () => {
    const inProgress = [1, 2, 3, 4, 5].map((id) => ipItem(id, 0));
    const item = backlogItem(6);
    const w = worker(1, [1, 2, 3, 4, 5]);
    const config = { ...baseConfig, board: { wip_limit: 5 } };
    const result = processTick({ currentTick: 0, items: [...inProgress, item], workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    expect(result.items.find((it) => it.id === 6)!.column).toBe("backlog");
  });

  it("does NOT pull a not-yet-arrived item", () => {
    const item = { ...createItem({ id: 1, arrival_tick: 99, effort_required_hours: 8 }), arrived: false };
    const w = worker(1);
    const result = processTick({ currentTick: 0, items: [item], workers: [w], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.items.find((it) => it.id === 1)!.column).toBe("backlog");
  });

  it("pulls items FIFO by arrival_tick", () => {
    const items = [
      backlogItem(10, 5),
      backlogItem(20, 2),
      backlogItem(30, 8),
    ];
    const config = { ...baseConfig, board: { wip_limit: 1 } };
    const w = worker(1);
    const result = processTick({ currentTick: 0, items, workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    expect(result.items.find((it) => it.id === 20)!.column).toBe("in_progress");
    expect(result.items.find((it) => it.id === 10)!.column).toBe("backlog");
    expect(result.items.find((it) => it.id === 30)!.column).toBe("backlog");
  });

  it("assigns to the worker with fewest active items", () => {
    const items = [backlogItem(1)];
    const workers = [
      worker(1, [10, 11, 12]),
      worker(2, [20]),
      worker(3, [30, 31]),
    ];
    const result = processTick({ currentTick: 0, items, workers, events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.workers.find((w) => w.id === 2)!.active_item_ids).toContain(1);
    expect(result.workers.find((w) => w.id === 1)!.active_item_ids).not.toContain(1);
  });

  it("fills multiple slots in one tick", () => {
    const items = [backlogItem(1), backlogItem(2), backlogItem(3)];
    const config = { ...baseConfig, board: { wip_limit: 3 } };
    const w = worker(1);
    const result = processTick({ currentTick: 0, items, workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    expect(result.items.filter((it) => it.column === "in_progress").length).toBe(3);
  });
});

describe("work allocation", () => {
  it("with 1 unblocked item and no switch cost, full tick goes to the item", () => {
    const item = ipItem(1, 0);
    const w = worker(1, [1]);
    const result = processTick({ currentTick: 0, items: [item], workers: [w], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    // dailyUsefulHours = 6, perItemPerTick = 6/1/6 * 1 = 1
    expect(result.items.find((it) => it.id === 1)!.effort_done_hours).toBeCloseTo(1);
  });

  it("with 2 items and 30min switch cost, both items get equal progress after 1 switch", () => {
    const config = { ...baseConfig, team: { ...baseConfig.team, switch_cost_minutes: 30 } };
    const items = [ipItem(1, 0), ipItem(2, 0)];
    const w = worker(1, [1, 2]);
    const result = processTick({ currentTick: 0, items, workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    // K=2, pulls=0, overhead=(2-1+0)*0.5=0.5, dailyUseful=5.5, perItemPerTick=5.5/2/6*1=0.4583
    expect(result.items.find((it) => it.id === 1)!.effort_done_hours).toBeCloseTo(5.5 / 2 / 6);
    expect(result.items.find((it) => it.id === 2)!.effort_done_hours).toBeCloseTo(5.5 / 2 / 6);
  });

  it("blocked items don't get progress and don't count toward K", () => {
    const items = [
      ipItem(1, 0),
      { ...ipItem(2, 0), state: "blocked" as const, blocked_until_tick: 100 },
      ipItem(3, 0),
    ];
    const w = worker(1, [1, 2, 3]);
    const config = { ...baseConfig, work: { ...baseConfig.work, block_probability_per_day: 0 } };
    const result = processTick({ currentTick: 0, items, workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    // K=2 (item2 blocked), overhead=0, dailyUseful=6, perItemPerTick=6/2/6=0.5
    expect(result.items.find((it) => it.id === 1)!.effort_done_hours).toBeCloseTo(0.5);
    expect(result.items.find((it) => it.id === 2)!.effort_done_hours).toBe(0);
    expect(result.items.find((it) => it.id === 3)!.effort_done_hours).toBeCloseTo(0.5);
  });

  it("worker with no items is idle", () => {
    const w = worker(1, []);
    const result = processTick({ currentTick: 0, items: [], workers: [w], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.timeAccounting.get(1)!.idle).toBeCloseTo(1);
    expect(result.timeAccounting.get(1)!.working).toBeCloseTo(0);
  });

  it("worker whose items are all blocked is counted as blocked", () => {
    const item = { ...ipItem(1, 0), state: "blocked" as const, blocked_until_tick: 100 };
    const w = worker(1, [1]);
    const config = { ...baseConfig, work: { ...baseConfig.work, block_probability_per_day: 0 } };
    const result = processTick({ currentTick: 0, items: [item], workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    expect(result.timeAccounting.get(1)!.blocked).toBeCloseTo(1);
  });
});

describe("completions", () => {
  it("item completes when effort_done reaches effort_required", () => {
    const item = ipItem(1, 7.9, 8);
    const w = worker(1, [1]);
    const result = processTick({ currentTick: 10, items: [item], workers: [w], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    const completed = result.items.find((it) => it.id === 1)!;
    expect(completed.column).toBe("done");
    expect(completed.done_tick).toBe(10);
  });

  it("completing an item removes it from the worker's active list", () => {
    const item = ipItem(1, 7.9, 8);
    const w = worker(1, [1]);
    const result = processTick({ currentTick: 0, items: [item], workers: [w], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.workers.find((w) => w.id === 1)!.active_item_ids).not.toContain(1);
  });

  it("completion on tick N frees the WIP slot so next tick can replenish", () => {
    const config = { ...baseConfig, board: { wip_limit: 1 } };
    const completing = ipItem(1, 7.9, 8);
    const waiting = backlogItem(2);
    const w = worker(1, [1]);
    // tick 0: item 1 completes, WIP drops to 0
    const r1 = processTick({ currentTick: 0, items: [completing, waiting], workers: [w], events: createEventQueue(), config, rng: createPrng(1n) });
    expect(r1.items.find((it) => it.id === 1)!.column).toBe("done");
    // tick 1: replenishment pulls item 2
    const r2 = processTick({ currentTick: 1, items: r1.items, workers: r1.workers, events: createEventQueue(), config, rng: createPrng(1n) });
    expect(r2.items.find((it) => it.id === 2)!.column).toBe("in_progress");
  });
});
```

- [ ] **Step 3: Update item.test.ts** (remove `validation_effort_hours` from `createItem` calls)

```typescript
import { describe, it, expect } from "vitest";
import { createItem, isBlocked, advanceItemEffort } from "../src/item.js";

describe("item helpers", () => {
  it("creates an item in Backlog with zero effort done", () => {
    const item = createItem({ id: 1, arrival_tick: 5, effort_required_hours: 8 });
    expect(item.column).toBe("backlog");
    expect(item.effort_done_hours).toBe(0);
    expect(item.state).toBe("in_column");
    expect(item.author_worker_id).toBeNull();
  });

  it("isBlocked is false in normal state", () => {
    const item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8 });
    expect(isBlocked(item)).toBe(false);
  });

  it("advanceItemEffort accumulates progress in In Progress", () => {
    let item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8 });
    item = { ...item, column: "in_progress" };
    item = advanceItemEffort(item, 2.5);
    expect(item.effort_done_hours).toBeCloseTo(2.5);
  });

  it("advanceItemEffort caps at effort_required when in In Progress", () => {
    let item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 5 });
    item = { ...item, column: "in_progress" };
    item = advanceItemEffort(item, 10);
    expect(item.effort_done_hours).toBeLessThanOrEqual(5);
  });

  it("advanceItemEffort does nothing when not in_progress", () => {
    const item = createItem({ id: 1, arrival_tick: 0, effort_required_hours: 8 });
    const result = advanceItemEffort(item, 5);
    expect(result.effort_done_hours).toBe(0);
  });
});
```

- [ ] **Step 4: Update runSimulation.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import { runSimulation } from "../src/runSimulation.js";
import type { ExperimentConfig } from "../src/types.js";

const minimalConfig: ExperimentConfig = {
  team: { size: 2, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 2, effort_dist: { mu: 4, sigma: 1, skewness: 0.5 }, block_probability_per_day: 0, block_duration_dist: { mu: 2, sigma: 1, skewness: 0 } },
  board: { wip_limit: 3 },
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

  it("CFD counts have no validation key", () => {
    const result = runSimulation(minimalConfig, 7n);
    expect(result.cfd[0]!.counts).not.toHaveProperty("validation");
    expect(result.cfd[0]!.counts).toHaveProperty("backlog");
    expect(result.cfd[0]!.counts).toHaveProperty("in_progress");
    expect(result.cfd[0]!.counts).toHaveProperty("done");
  });
});
```

- [ ] **Step 5: Update portability.test.ts** (update config shape and remove deleted files from list)

Replace the `config` constant and the `files` array:

```typescript
import { describe, it, expect } from "vitest";
import { runSimulation, type ExperimentConfig } from "../src/index.js";
import { readFileSync } from "node:fs";

const config: ExperimentConfig = {
  team: { size: 3, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 3, effort_dist: { mu: 6, sigma: 2, skewness: 1 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 4 },
  simulation: { sim_days: 60, tick_size_hours: 1 },
};

describe("engine portability and purity", () => {
  it("does not import Node built-ins or DOM globals from any engine source file", () => {
    const forbidden = ["node:", "from 'fs'", "from \"fs\"", "from 'path'", "from \"path\"", "self.postMessage", "window.", "document."];
    const files = [
      "src/types.ts", "src/prng.ts", "src/distributions.ts", "src/item.ts",
      "src/events.ts", "src/tick.ts", "src/metrics.ts", "src/runSimulation.ts", "src/index.ts",
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

- [ ] **Step 6: Update fixtures/regression_baseline.json** (update config, reset baseline to null so the test skips until regenerated)

```json
{
  "name": "regression_baseline",
  "description": "Moderate-everything config. Baseline summary stats are recorded; unintended drift fails the test.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
    "work": { "arrival_rate_per_day": 4, "effort_dist": { "mu": 10, "sigma": 3.5, "skewness": 1.2 }, "block_probability_per_day": 0.04, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_limit": 5 },
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

- [ ] **Step 7: Update fixtures/sanity_edges.json** (update all three configs)

```json
{
  "name": "sanity_edges",
  "description": "Edge cases: WIP=1, WIP=null, arrivals=0. Must not crash, hang, or produce NaN.",
  "cases": [
    {
      "name": "wip_one_single_worker",
      "config": {
        "team": { "size": 1, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
        "work": { "arrival_rate_per_day": 1, "effort_dist": { "mu": 4, "sigma": 0, "skewness": 0 }, "block_probability_per_day": 0, "block_duration_dist": { "mu": 2, "sigma": 1, "skewness": 0 } },
        "board": { "wip_limit": 1 },
        "simulation": { "sim_days": 30, "tick_size_hours": 1 }
      },
      "seed": "1"
    },
    {
      "name": "wip_unlimited",
      "config": {
        "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
        "work": { "arrival_rate_per_day": 8, "effort_dist": { "mu": 6, "sigma": 2, "skewness": 1 }, "block_probability_per_day": 0, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0 } },
        "board": { "wip_limit": null },
        "simulation": { "sim_days": 30, "tick_size_hours": 1 }
      },
      "seed": "2"
    },
    {
      "name": "no_arrivals",
      "config": {
        "team": { "size": 3, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
        "work": { "arrival_rate_per_day": 0, "effort_dist": { "mu": 4, "sigma": 1, "skewness": 0 }, "block_probability_per_day": 0, "block_duration_dist": { "mu": 2, "sigma": 1, "skewness": 0 } },
        "board": { "wip_limit": 3 },
        "simulation": { "sim_days": 10, "tick_size_hours": 1 }
      },
      "seed": "3"
    }
  ]
}
```

- [ ] **Step 8: Git removes and commit**

```bash
git rm packages/engine/test/worker.test.ts packages/engine/test/multitasking.test.ts packages/engine/test/board.test.ts
git add packages/engine/test/tick.test.ts packages/engine/test/item.test.ts packages/engine/test/runSimulation.test.ts packages/engine/test/portability.test.ts packages/engine/test/fixtures/regression_baseline.json packages/engine/test/fixtures/sanity_edges.json
git commit -m "test(engine): rewrite tick tests, delete dead tests, update fixtures for new model"
```

---

## Task 7: Run engine tests and regenerate baseline

**Files:** none (verification step)

- [ ] **Step 1: Run the engine test suite**

```bash
pnpm --filter @kanbansim/engine test 2>&1
```

Expected: all tests pass. The regression_baseline test should skip (baseline is null). Fix any failures before continuing.

- [ ] **Step 2: Regenerate the regression baseline**

Build the engine, then run a quick script against the compiled output:

```bash
pnpm --filter @kanbansim/engine build
```

Then find the outDir from `packages/engine/tsconfig.json` (likely `dist/`) and run:

```bash
node --input-type=module << 'EOF'
import { runSimulation } from "./packages/engine/dist/runSimulation.js";
const config = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 10, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};
const r = runSimulation(config, 987654321n);
console.log(JSON.stringify({
  items_completed: r.summary.items_completed,
  throughput_per_day: r.summary.throughput_per_day,
  median_lead_time_hours: r.summary.median_lead_time_hours,
  p95_lead_time_hours: r.summary.p95_lead_time_hours,
}, null, 2));
EOF
```

Copy the output values into `packages/engine/test/fixtures/regression_baseline.json` under the `"baseline"` key.

- [ ] **Step 3: Run engine tests again — all should pass including regression**

```bash
pnpm --filter @kanbansim/engine test 2>&1
```

Expected: all pass, zero failures.

- [ ] **Step 4: Commit baseline**

```bash
git add packages/engine/test/fixtures/regression_baseline.json
git commit -m "test(engine/regression): populate baseline for new three-column model"
```

---

## Task 8: Update scenarios

**Files:**
- Modify: `scenarios/sweet-spot.json`
- Modify: `scenarios/qa-bottleneck.json`
- Modify: `scenarios/multitasking-tax.json`

- [ ] **Step 1: Update sweet-spot.json**

`effort_dist.mu` changes from 24 → 31 (folding in old 30% validation effort: 24 × 1.3 ≈ 31).

```json
{
  "name": "The Sweet Spot",
  "description": "WIP swept 1->50 to find the optimal point.",
  "lesson": "Little's Law made visible.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
    "work": { "arrival_rate_per_day": 1.0, "effort_dist": { "mu": 31, "sigma": 10, "skewness": 0.5 }, "block_probability_per_day": 0.10, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_limit": 5 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "sweep": { "variable": "board.wip_limit", "min": 1, "max": 50, "step": 1 }
}
```

- [ ] **Step 2: Update multitasking-tax.json**

```json
{
  "name": "The Multitasking Tax",
  "description": "Switch cost swept 0->60min at high WIP. Watch throughput erode as context-switching consumes the day.",
  "lesson": "Multitasking is never free.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
    "work": { "arrival_rate_per_day": 2.0, "effort_dist": { "mu": 31, "sigma": 10, "skewness": 0.5 }, "block_probability_per_day": 0.10, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_limit": 20 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "sweep": { "variable": "team.switch_cost_minutes", "min": 0, "max": 60, "step": 5 }
}
```

- [ ] **Step 3: Repurpose qa-bottleneck.json as arrival-pressure scenario**

The old QA bottleneck lesson no longer applies. Replace with a demand pressure story: arrival rate swept 0.2→4.0 at fixed WIP, showing how backlog explodes and lead times diverge once demand exceeds throughput.

```json
{
  "name": "Arrival Pressure",
  "description": "Arrival rate swept 0.2->4.0 items/day at fixed WIP=5. See how lead time explodes when demand exceeds team capacity.",
  "lesson": "When demand outruns throughput, the backlog grows without bound.",
  "config": {
    "team": { "size": 5, "productive_hours_per_day": 6, "switch_cost_minutes": 15 },
    "work": { "arrival_rate_per_day": 1.0, "effort_dist": { "mu": 31, "sigma": 10, "skewness": 0.5 }, "block_probability_per_day": 0.10, "block_duration_dist": { "mu": 4, "sigma": 2, "skewness": 0.5 } },
    "board": { "wip_limit": 5 },
    "simulation": { "sim_days": 130, "tick_size_hours": 1 }
  },
  "sweep": { "variable": "work.arrival_rate_per_day", "min": 0.2, "max": 4.0, "step": 0.2 }
}
```

- [ ] **Step 4: Commit**

```bash
git add scenarios/sweet-spot.json scenarios/qa-bottleneck.json scenarios/multitasking-tax.json
git commit -m "feat(scenarios): update for three-column model; repurpose qa-bottleneck as arrival-pressure"
```

---

## Task 9: Update web — aggregator and BoardLoadChart

**Files:**
- Modify: `packages/web/src/orchestrator/aggregator.ts`
- Modify: `packages/web/src/charts/BoardLoadChart.tsx`

- [ ] **Step 1: Update aggregator.ts** — remove `validation` from `ColumnCountMeans` and all internal sums

In `aggregator.ts`, update the `column_count_sums` initial value and the `column_count_means` output:

Find the line:
```typescript
column_count_sums: { backlog: 0, in_progress: 0, validation: 0, done: 0 },
```
Replace with:
```typescript
column_count_sums: { backlog: 0, in_progress: 0, done: 0 },
```

Find the `column_count_means` block in `snapshot()`:
```typescript
column_count_means: {
  backlog: c.column_count_sums.backlog / obs,
  in_progress: c.column_count_sums.in_progress / obs,
  validation: c.column_count_sums.validation / obs,
  done: c.column_count_sums.done / obs,
},
```
Replace with:
```typescript
column_count_means: {
  backlog: c.column_count_sums.backlog / obs,
  in_progress: c.column_count_sums.in_progress / obs,
  done: c.column_count_sums.done / obs,
},
```

Find the CFD ingestion loop:
```typescript
for (const snap of result.cfd) {
  cell.column_count_sums.backlog += snap.counts.backlog;
  cell.column_count_sums.in_progress += snap.counts.in_progress;
  cell.column_count_sums.validation += snap.counts.validation;
  cell.column_count_sums.done += snap.counts.done;
  cell.column_count_observations++;
}
```
Replace with:
```typescript
for (const snap of result.cfd) {
  cell.column_count_sums.backlog += snap.counts.backlog;
  cell.column_count_sums.in_progress += snap.counts.in_progress;
  cell.column_count_sums.done += snap.counts.done;
  cell.column_count_observations++;
}
```

- [ ] **Step 2: Update BoardLoadChart.tsx** — remove validation from COLUMNS, COLORS, LABELS

Find:
```typescript
const COLUMNS: ColumnId[] = ["backlog", "in_progress", "validation", "done"];
const COLORS: Record<ColumnId, string> = {
  backlog: "var(--series-5)",
  in_progress: "var(--series-2)",
  validation: "var(--series-3)",
  done: "var(--series-1)",
};
const LABELS: Record<ColumnId, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  validation: "Validation",
  done: "Done",
};
```
Replace with:
```typescript
const COLUMNS: ColumnId[] = ["backlog", "in_progress", "done"];
const COLORS: Record<ColumnId, string> = {
  backlog: "var(--series-5)",
  in_progress: "var(--series-2)",
  done: "var(--series-1)",
};
const LABELS: Record<ColumnId, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  done: "Done",
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/orchestrator/aggregator.ts packages/web/src/charts/BoardLoadChart.tsx
git commit -m "refactor(web): remove validation column from aggregator and board load chart"
```

---

## Task 10: Update web configurator tabs

**Files:**
- Modify: `packages/web/src/pages/configurator/BoardTab.tsx`
- Modify: `packages/web/src/pages/configurator/WorkTab.tsx`
- Modify: `packages/web/src/pages/configurator/MonteCarloTab.tsx`

- [ ] **Step 1: Replace BoardTab.tsx**

```typescript
import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
};

export function BoardTab({ state, update }: Props) {
  const b = state.config.board;
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Board</h2>
      <p className="help">Three columns: Backlog → In Progress → Done. Workers fill available WIP slots eagerly. "—" means unlimited.</p>
      <ParameterInput label="WIP Limit" path="board.wip_limit" value={b.wip_limit} step={1} min={1} onChange={(v) => update("board.wip_limit", Math.max(1, Math.round(v)))} />
    </section>
  );
}
```

- [ ] **Step 2: Update WorkTab.tsx** — change arrival rate step to 0.1, remove any validation_effort UI (already absent in current file, just update the step/min)

Find the arrival rate `ParameterInput`:
```typescript
<ParameterInput label="Arrival rate" path="work.arrival_rate_per_day" value={w.arrival_rate_per_day} step={0.5} min={0} unit="/day" ...
```
Replace `step={0.5} min={0}` with `step={0.1} min={0.1}`:
```typescript
<ParameterInput label="Arrival rate" path="work.arrival_rate_per_day" value={w.arrival_rate_per_day} step={0.1} min={0.1} unit="/day" randomizable randomized={isRandomized("work.arrival_rate_per_day")} onChange={(v) => update("work.arrival_rate_per_day", v)} onToggleRandomize={() => toggleRandomize("work.arrival_rate_per_day", { mu: w.arrival_rate_per_day, sigma: 1, skewness: 0 })} />
```

- [ ] **Step 3: Update MonteCarloTab.tsx** — remove `board.wip_validation` option, rename `board.wip_in_progress` → `board.wip_limit`

Replace the `SWEEPABLE_PATHS` array:
```typescript
const SWEEPABLE_PATHS: Array<{ path: string; label: string; defaults: { min: number; max: number; step: number } }> = [
  { path: "board.wip_limit", label: "WIP Limit", defaults: { min: 1, max: 50, step: 1 } },
  { path: "team.switch_cost_minutes", label: "Switch cost", defaults: { min: 0, max: 60, step: 5 } },
  { path: "team.size", label: "Team size", defaults: { min: 2, max: 12, step: 1 } },
  { path: "work.arrival_rate_per_day", label: "Arrival rate", defaults: { min: 0.2, max: 5.0, step: 0.2 } },
];
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/configurator/BoardTab.tsx packages/web/src/pages/configurator/WorkTab.tsx packages/web/src/pages/configurator/MonteCarloTab.tsx
git commit -m "refactor(web/configurator): rename WIP Limit, finer arrival step, drop validation controls"
```

---

## Task 11: Update web supporting files

**Files:**
- Modify: `packages/web/src/components/ConfigStrip.tsx`
- Modify: `packages/web/src/lib/tooltips.ts`
- Modify: `packages/web/src/state/presets.ts`
- Modify: `packages/web/src/pages/Learn.tsx`

- [ ] **Step 1: Update ConfigStrip.tsx** — remove Validation WIP and Blocked policy rows, rename In Progress WIP

Replace the `<dl>` block inside the Board `<div>`:
```typescript
<div>
  <div className="group-title">Board</div>
  <dl>
    <dt>WIP Limit</dt><dd>{val("board.wip_limit", String(config.board.wip_limit ?? "—"))}</dd>
  </dl>
</div>
```

- [ ] **Step 2: Update tooltips.ts** — remove stale keys, update renamed keys

Replace the file content:
```typescript
export const TOOLTIPS: Record<string, string> = {
  "team.size": "Number of generalist workers on the team. Every worker can perform any task.",
  "team.productive_hours_per_day": "Hours per workday spent on simulated work. The default 6 reflects a realistic ratio of meetings and admin to focus time.",
  "team.switch_cost_minutes": "Minutes lost when transitioning between items. Per day, a worker with K items pays (K-1) × switch_cost in overhead — the only multitasking tax in the model.",

  "work.arrival_rate_per_day": "Mean items arriving per working day, sampled from a Poisson process.",
  "work.effort_dist.mu": "Mean effort in hours. Items are log-normal distributed — positive, right-skewed, like real work.",
  "work.effort_dist.sigma": "Spread of effort in hours. Higher = more variability — short stories mixed with epics.",
  "work.effort_dist.skewness": "Right-skew of the effort distribution. Positive values reflect realistic long-tail effort.",
  "work.block_probability_per_day": "Per active item, the chance per day it becomes blocked on something external (review, dependency, environment).",

  "board.wip_limit": "Maximum items In Progress across the whole team. Workers fill available slots eagerly.",

  "monte_carlo.runs": "Number of independent runs at every sweep value. More runs = tighter confidence bands.",
  "monte_carlo.master_seed": "Master seed for reproducibility. Same seed + same config = bit-identical results.",
  "monte_carlo.sweep": "The variable to sweep across the experiment. Each step gets `runs` runs; results aggregate per cell.",
  "monte_carlo.randomize": "When on, this parameter is sampled per-run from a (μ, σ, skewness) triplet instead of held fixed.",
};
```

- [ ] **Step 3: Update presets.ts** — update PRESET_IDS, PRESET_DESCRIPTIONS, rename qa-bottleneck**

```typescript
import type { ExperimentConfig } from "@kanbansim/engine";
import type { ExperimentState, SweepSpec } from "./urlCodec.js";

export type PresetId = "sweet-spot" | "arrival-pressure" | "multitasking-tax";

type ScenarioFile = {
  name: string;
  description: string;
  lesson?: string;
  config: ExperimentConfig;
  sweep?: SweepSpec;
};

export const PRESET_IDS: PresetId[] = ["sweet-spot", "arrival-pressure", "multitasking-tax"];

export const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  "sweet-spot": "WIP swept 1 → 50. Find the optimal point on the U-curve.",
  "arrival-pressure": "Arrival rate swept 0.2 → 4.0. See lead time explode when demand exceeds capacity.",
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
```

- [ ] **Step 4: Update Learn.tsx** — remove validation references from "What's in a run" paragraph and fix multitasking description

Find:
```typescript
<p>One run simulates 6 working months of a virtual team. Items arrive, get worked on, occasionally block, get peer-reviewed, and finish. Every numeric output you see in this simulator is averaged across thousands of independent runs of the same configuration.</p>
```
Replace with:
```typescript
<p>One run simulates 6 working months of a virtual team. Items arrive, get pulled into In Progress, occasionally block, and complete. Every numeric output is averaged across hundreds or thousands of independent runs of the same configuration.</p>
```

Find:
```typescript
<p>Switching between items costs time (the <strong>switch cost</strong>) and slows down sustained pace (the <strong>pace penalty</strong>). At high WIP, workers juggle so many things that real progress evaporates. The <em>Time Accounting</em> chart makes this visible.</p>
```
Replace with:
```typescript
<p>Switching between items costs time (the <strong>switch cost</strong>). At high WIP, workers juggle many tasks per day; the (K–1) transitions eat into productive hours. The <em>Time Accounting</em> chart makes this visible.</p>
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ConfigStrip.tsx packages/web/src/lib/tooltips.ts packages/web/src/state/presets.ts packages/web/src/pages/Learn.tsx
git commit -m "refactor(web): ConfigStrip, tooltips, presets, Learn page — remove validation references"
```

---

## Task 12: Update the scenario filename for arrival-pressure

**Files:**
- Rename: `scenarios/qa-bottleneck.json` → `scenarios/arrival-pressure.json`

The presets.ts now loads `arrival-pressure.json` but the file is still called `qa-bottleneck.json`.

- [ ] **Step 1: Rename the file**

```bash
git mv scenarios/qa-bottleneck.json scenarios/arrival-pressure.json
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(scenarios): rename qa-bottleneck.json to arrival-pressure.json"
```

---

## Task 13: Update web tests

**Files:**
- Modify: `packages/web/test/useConfigurator.test.tsx`
- Modify: `packages/web/test/urlCodec.test.ts`
- Modify: `packages/web/test/tooltips.test.ts`
- Modify: `packages/web/test/pool.test.ts`
- Modify: `packages/web/test/randomization.test.ts`
- Modify: `packages/web/test/build-roundtrip.test.tsx`
- Modify: `packages/web/test/share-roundtrip.test.tsx`

The common change across all these files: replace any `ExperimentConfig` literal that has the old shape. The new shape is:

```typescript
// OLD shape — find and replace all occurrences:
{
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
}

// NEW shape:
{
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
}
```

- [ ] **Step 1: Update useConfigurator.test.tsx**

Replace the `initial` constant's `config`:
```typescript
config: {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15 },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_limit: 5 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
},
sweep: { variable: "board.wip_limit", min: 1, max: 15, step: 1 },
```

Also update the `setSweep` test to use `"board.wip_limit"`:
```typescript
act(() => { result.current.setSweep({ variable: "board.wip_limit", min: 2, max: 10, step: 1 }); });
expect(result.current.state.sweep?.variable).toBe("board.wip_limit");
```

- [ ] **Step 2: Update remaining test files** — apply the same config-shape substitution in `urlCodec.test.ts`, `pool.test.ts`, `randomization.test.ts`, `build-roundtrip.test.tsx`, `share-roundtrip.test.tsx`. In each file, find every occurrence of `wip_in_progress`, `wip_validation`, `blocking_response`, `worker_pick_policy`, `validation_effort` and update to the new shape.

- [ ] **Step 3: Update tooltips.test.ts** — remove assertions for deleted tooltip keys (`board.wip_validation`, `team.blocking_response`) and update `board.wip_in_progress` → `board.wip_limit`. Look for `expect(TOOLTIPS).toHaveProperty(...)` assertions and remove/update the stale ones.

- [ ] **Step 4: Run web tests to identify any remaining failures**

```bash
pnpm --filter @kanbansim/web test 2>&1
```

Fix any TypeScript errors or test failures by updating config shapes in the failing file.

- [ ] **Step 5: Commit**

```bash
git add packages/web/test/
git commit -m "test(web): update all config fixtures for three-column model"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run the full test suite from the repo root**

```bash
pnpm test 2>&1
```

Expected: all tests pass across both packages.

- [ ] **Step 2: Typecheck both packages**

```bash
pnpm --filter @kanbansim/engine exec tsc --noEmit && pnpm --filter @kanbansim/web exec tsc --noEmit
```

Expected: zero errors in both.

- [ ] **Step 3: Start the web dev server and verify the UI manually**

```bash
pnpm --filter @kanbansim/web dev
```

Check:
- Board tab shows only "WIP Limit" (no Validation WIP)
- Arrival rate step is 0.1, minimum is 0.1
- Team tab shows no blocking_response or worker_pick_policy dropdowns
- Monte Carlo sweep dropdown has "WIP Limit" (not "In Progress WIP"), no "Validation WIP"
- Config strip shows WIP Limit only (no Validation WIP, no Blocked policy)
- Load a preset — sweet-spot loads and runs without error
- Board load chart has three bars per sweep value (no validation bar)
- Learn page has no validation references

- [ ] **Step 4: Final commit if any last fixes were needed**

```bash
git add -p  # stage only intentional changes
git commit -m "fix(web): post-verification cleanup"
```
