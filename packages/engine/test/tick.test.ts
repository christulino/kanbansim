import { describe, it, expect } from "vitest";
import { processTick } from "../src/tick.js";
import { createPrng } from "../src/prng.js";
import { createItem } from "../src/item.js";
import type { ExperimentConfig, Item, Worker } from "../src/types.js";
import { createEventQueue } from "../src/events.js";

const baseConfig: ExperimentConfig = {
  team: { size: 1, productive_hours_per_day: 6, switch_cost_minutes: 15, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 0, effort_dist: { mu: 8, sigma: 0, skewness: 0 }, validation_effort: { kind: "fraction", fraction: 0.5 }, block_probability_per_day: 0, block_duration_dist: { mu: 4, sigma: 2, skewness: 0 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 1, tick_size_hours: 1 },
};

function ipItem(id: number, effortDone: number, effortRequired = 8): Item {
  return {
    ...createItem({ id, arrival_tick: 0, effort_required_hours: effortRequired, validation_effort_hours: effortRequired / 2 }),
    column: "in_progress", author_worker_id: 1, current_worker_id: 1, effort_done_hours: effortDone,
  };
}

describe("processTick (parallel-work model)", () => {
  it("with 1 unblocked item, full tick goes to that item", () => {
    const item = ipItem(1, 0);
    const worker: Worker = { id: 1, active_item_ids: [1], last_chosen_item_id: null };
    const result = processTick({ currentTick: 0, items: [item], workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    expect(result.items.find((it) => it.id === 1)!.effort_done_hours).toBeCloseTo(1);
  });

  it("with 4 unblocked items, splits the hour evenly across them after switch overhead", () => {
    const items = [ipItem(1, 0), ipItem(2, 0), ipItem(3, 0), ipItem(4, 0)];
    const worker: Worker = { id: 1, active_item_ids: [1, 2, 3, 4], last_chosen_item_id: null };
    const result = processTick({ currentTick: 0, items, workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    // 4 items, 15min switch, 6h day → daily overhead = 3 * 0.25 = 0.75h; per-tick = 0.75/6 = 0.125h
    // useful per tick = 0.875h; per-item = 0.875 / 4 = 0.21875
    for (const id of [1, 2, 3, 4]) {
      expect(result.items.find((it) => it.id === id)!.effort_done_hours).toBeCloseTo(0.21875);
    }
  });

  it("blocked items don't get progress and don't add to switch overhead", () => {
    const item1 = ipItem(1, 0);
    const item2: Item = { ...ipItem(2, 0), state: "blocked", blocked_until_tick: 100 };
    const item3 = ipItem(3, 0);
    const worker: Worker = { id: 1, active_item_ids: [1, 2, 3], last_chosen_item_id: null };
    const result = processTick({
      currentTick: 0, items: [item1, item2, item3], workers: [worker],
      events: createEventQueue(),
      config: { ...baseConfig, work: { ...baseConfig.work, block_probability_per_day: 0 } },
      rng: createPrng(1n),
    });
    // progressing = 2 (item 2 blocked); daily overhead = 1 * 0.25 = 0.25h; per-tick = 0.25/6 = 0.0417h
    // useful = 0.9583; per-item = 0.4792
    expect(result.items.find((it) => it.id === 1)!.effort_done_hours).toBeCloseTo(0.4792, 3);
    expect(result.items.find((it) => it.id === 2)!.effort_done_hours).toBe(0);
    expect(result.items.find((it) => it.id === 3)!.effort_done_hours).toBeCloseTo(0.4792, 3);
  });

  it("moves item to Validation when effort is reached", () => {
    const item: Item = {
      ...createItem({ id: 1, arrival_tick: 0, effort_required_hours: 0.5, validation_effort_hours: 1 }),
      column: "in_progress", author_worker_id: 1, current_worker_id: 1, effort_done_hours: 0,
    };
    const worker: Worker = { id: 1, active_item_ids: [1], last_chosen_item_id: null };
    const result = processTick({ currentTick: 0, items: [item], workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    const updated = result.items.find((it) => it.id === 1)!;
    expect(updated.column).toBe("validation");
    expect(updated.effort_done_hours).toBe(0);
  });

  it("records hours_working in time accounting equal to useful_hours", () => {
    const items = [ipItem(1, 0), ipItem(2, 0)];
    const worker: Worker = { id: 1, active_item_ids: [1, 2], last_chosen_item_id: null };
    const result = processTick({ currentTick: 0, items, workers: [worker], events: createEventQueue(), config: baseConfig, rng: createPrng(1n) });
    // 2 items, 15min switch, 6h day → daily overhead = 1 * 0.25 = 0.25h; per-tick = 0.0417h
    // useful_hours = 1 - 0.0417 = 0.9583; switching = 0.0417
    expect(result.timeAccounting.get(1)!.working).toBeCloseTo(0.9583, 3);
    expect(result.timeAccounting.get(1)!.switching).toBeCloseTo(0.0417, 3);
  });

  it("a 1-day item finishes in ~1 day at WIP=1", () => {
    // sim 6 ticks (1 day, productive_hours=6) on a 6h item, single worker, single item
    let items: Item[] = [ipItem(1, 0, 6)];
    let workers: Worker[] = [{ id: 1, active_item_ids: [1], last_chosen_item_id: null }];
    const events = createEventQueue();
    for (let tick = 0; tick < 6; tick++) {
      const r = processTick({ currentTick: tick, items, workers, events, config: baseConfig, rng: createPrng(1n) });
      items = r.items;
      workers = r.workers;
    }
    // After 6 ticks of full-rate work, the item should be in validation (or done).
    expect(items.find((it) => it.id === 1)!.column).not.toBe("in_progress");
  });
});
