import type { ExperimentConfig, Item, Worker, ColumnId } from "./types.js";
import type { Prng } from "./prng.js";
import { type EventQueue, popDueEvents } from "./events.js";
import { decideWorkerAction, type WorkerAction } from "./worker.js";
import { computeTickAllocation } from "./multitasking.js";
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

  // 1. Resolve due events. Arrivals flip an item's `arrived` flag from false to true; the
  // item stays in the Backlog column but becomes visible to the chart and pullable by workers.
  for (const event of popDueEvents(args.events, currentTick)) {
    if (event.kind === "arrival") {
      items = items.map((it) => (it.id === event.itemId ? { ...it, arrived: true } : it));
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
    case "parallel_work": {
      // 1. Apply pulls (move items between columns / add to active list).
      if (action.pullFromBacklog !== undefined) {
        const pulledId = action.pullFromBacklog;
        itemsOut = itemsOut.map((it) =>
          it.id === pulledId
            ? { ...it, column: "in_progress" as const, author_worker_id: worker.id, current_worker_id: worker.id, effort_done_hours: 0 }
            : it,
        );
        workersOut = workersOut.map((w) =>
          w.id === worker.id && !w.active_item_ids.includes(pulledId)
            ? { ...w, active_item_ids: [...w.active_item_ids, pulledId], last_chosen_item_id: pulledId }
            : w,
        );
      }

      if (action.pullValidation !== undefined) {
        const pulledId = action.pullValidation;
        itemsOut = itemsOut.map((it) =>
          it.id === pulledId ? { ...it, current_worker_id: worker.id } : it,
        );
        workersOut = workersOut.map((w) =>
          w.id === worker.id && !w.active_item_ids.includes(pulledId)
            ? { ...w, active_item_ids: [...w.active_item_ids, pulledId], last_chosen_item_id: pulledId }
            : w,
        );
      }

      // 2. Compute tick allocation across all unblocked active items.
      const updatedWorker = workersOut.find((w) => w.id === worker.id)!;
      const myItems = itemsOut.filter((it) => updatedWorker.active_item_ids.includes(it.id));
      const myUnblocked = myItems.filter(
        (it) => it.state === "in_column" && (it.column === "in_progress" || it.column === "validation"),
      );
      const progressingIds = new Set(action.progressItemIds);

      const alloc = computeTickAllocation({
        tickHours,
        productiveHoursPerDay: config.team.productive_hours_per_day,
        progressingCount: myUnblocked.filter((it) => progressingIds.has(it.id)).length,
        switchCostHours: config.team.switch_cost_minutes / 60,
      });

      // 3. Distribute progress.
      if (alloc.perItemHours > 0) {
        itemsOut = itemsOut.map((it) =>
          progressingIds.has(it.id) && it.state === "in_column"
            ? { ...it, effort_done_hours: it.effort_done_hours + alloc.perItemHours, current_worker_id: worker.id }
            : it,
        );
      }

      // 4. Time accounting.
      acc.working += alloc.usefulHours;
      acc.switching += Math.max(0, tickHours - alloc.usefulHours);

      return { items: itemsOut, workers: workersOut };
    }
    case "swarm_unblock": {
      const item = itemsOut.find((it) => it.id === action.itemId);
      if (!item) {
        acc.idle += tickHours;
        return { items: itemsOut, workers: workersOut };
      }
      // Swarm: contribute progress to a peer's blocked item (preserves prior semantics).
      const alloc = computeTickAllocation({
        tickHours,
        productiveHoursPerDay: config.team.productive_hours_per_day,
        progressingCount: 1,
        switchCostHours: config.team.switch_cost_minutes / 60,
      });
      acc.working += alloc.usefulHours;
      acc.switching += tickHours - alloc.usefulHours;
      itemsOut = itemsOut.map((it) =>
        it.id !== action.itemId
          ? it
          : { ...it, effort_done_hours: it.effort_done_hours + alloc.usefulHours },
      );
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
