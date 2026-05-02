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
