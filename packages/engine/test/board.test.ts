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

  it("workerCanPull is true on a single-worker team (no peers to compare)", () => {
    const workers: Worker[] = [{ id: 1, active_item_ids: [1, 2, 3, 4], last_chosen_item_id: null }];
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
