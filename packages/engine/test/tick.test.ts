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
