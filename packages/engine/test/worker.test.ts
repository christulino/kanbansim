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

function mkReady(id: number): Item {
  return { ...createItem({ id, arrival_tick: 0, effort_required_hours: 8, validation_effort_hours: 3 }), column: "ready" };
}

describe("worker decision tree (parallel-work model)", () => {
  it("returns parallel_work with all my unblocked items", () => {
    const worker: Worker = { id: 1, active_item_ids: [10, 11, 12], last_chosen_item_id: null };
    const items = [
      mkInProgress(10, 1, 2, false),
      mkInProgress(11, 1, 1, false),
      mkInProgress(12, 1, 5, true),                // blocked
    ];
    const action = decideWorkerAction({ worker, allWorkers: [worker], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("parallel_work");
    if (action.kind === "parallel_work") {
      expect(action.progressItemIds).toEqual(expect.arrayContaining([10, 11]));
      expect(action.progressItemIds).not.toContain(12);
      expect(action.pullFromReady).toBeUndefined();
    }
  });

  it("pulls from Ready when room and not at highest load (parallel_work + pullFromReady)", () => {
    const worker: Worker = { id: 1, active_item_ids: [10], last_chosen_item_id: null };
    const peer: Worker = { id: 2, active_item_ids: [50, 51], last_chosen_item_id: null };
    const items = [
      mkInProgress(10, 1, 2, false),
      mkInProgress(50, 2, 1, false),
      mkInProgress(51, 2, 1, false),
      mkReady(20),
    ];
    const action = decideWorkerAction({ worker, allWorkers: [worker, peer], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("parallel_work");
    if (action.kind === "parallel_work") {
      expect(action.pullFromReady).toBe(20);
      expect(action.progressItemIds).toContain(10);
      expect(action.progressItemIds).toContain(20);
    }
  });

  it("does NOT pull from Ready if my load is strictly highest", () => {
    const worker: Worker = { id: 1, active_item_ids: [10, 11, 12], last_chosen_item_id: null };
    const peer: Worker = { id: 2, active_item_ids: [50], last_chosen_item_id: null };
    const items = [
      mkInProgress(10, 1, 2, false),
      mkInProgress(11, 1, 1, false),
      mkInProgress(12, 1, 1, false),
      mkInProgress(50, 2, 1, false),
      mkReady(20),
    ];
    const action = decideWorkerAction({ worker, allWorkers: [worker, peer], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("parallel_work");
    if (action.kind === "parallel_work") {
      expect(action.pullFromReady).toBeUndefined();
      expect(action.progressItemIds).toEqual(expect.arrayContaining([10, 11, 12]));
      expect(action.progressItemIds.length).toBe(3);
    }
  });

  it("with all my items blocked + start_new policy, pulls from Ready", () => {
    const worker: Worker = { id: 1, active_item_ids: [10], last_chosen_item_id: null };
    const items = [mkInProgress(10, 1, 2, true), mkReady(20)];
    const action = decideWorkerAction({ worker, allWorkers: [worker], items, config: baseConfig, currentTick: 5 });
    expect(action.kind).toBe("parallel_work");
    if (action.kind === "parallel_work") {
      expect(action.pullFromReady).toBe(20);
      expect(action.progressItemIds).toEqual([20]);
    }
  });

  it("with all my items blocked + wait policy, idles", () => {
    const worker: Worker = { id: 1, active_item_ids: [10], last_chosen_item_id: null };
    const items = [mkInProgress(10, 1, 2, true)];
    const action = decideWorkerAction({
      worker, allWorkers: [worker], items,
      config: { ...baseConfig, team: { ...baseConfig.team, blocking_response: "wait" } },
      currentTick: 5,
    });
    expect(action.kind).toBe("idle");
  });

  it("does not pull a validation item the worker authored", () => {
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
    expect(action.kind).toBe("parallel_work");
    if (action.kind === "parallel_work") {
      expect(action.pullValidation).toBe(10);
      expect(action.progressItemIds).toEqual([10]);
    }
  });
});
