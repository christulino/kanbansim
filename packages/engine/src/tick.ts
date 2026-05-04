import type { ExperimentConfig, Item, Worker, ColumnId } from "./types.js";
import type { Prng } from "./prng.js";
import { type EventQueue, popDueEvents } from "./events.js";
import { sampleLogNormal } from "./distributions.js";
import { advanceItemEffort } from "./item.js";

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
  //    Arrivals flip an item's `arrived` flag so it becomes visible and pullable.
  //    Unblocks clear the blocked state so the item resumes receiving progress.
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
  //    Each in_progress item has an independent per-tick probability of becoming blocked,
  //    proportional to block_probability_per_day / productive_hours_per_day.
  //    A blocked item is scheduled to unblock after a log-normal duration.
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
  //    Workers are eager — they never pass up an open slot. The oldest arrived backlog item is
  //    pulled first; the worker with the fewest current assignments receives it (lowest ID breaks ties).
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
  }

  // 4. Work phase: Weinberg daily-amortized allocation across each worker's assigned items.
  //
  //    A worker with K unblocked items retains 4/(K+3) of their productive capacity (Weinberg, 1992).
  //    K=1 → 100%, K=2 → 80% total (40% each), K=5 → 50% total (10% each), K→∞ → 0% asymptotically.
  //    That fraction is spread evenly across all K unblocked items each tick.
  //    Blocked items are excluded from K and receive no progress.
  const accounting: Map<number, TickAccounting> = new Map(
    workers.map((w) => [w.id, { working: 0, switching: 0, blocked: 0, idle: 0 }]),
  );

  for (const worker of workers) {
    const acc = accounting.get(worker.id)!;
    const myItems = items.filter((it) => worker.active_item_ids.includes(it.id));
    const unblocked = myItems.filter((it) => it.state === "in_column" && it.column === "in_progress");
    const K = unblocked.length;

    if (K === 0) {
      // Worker has no unblocked items this tick.
      if (myItems.length > 0) {
        acc.blocked += tickHours;  // has items but all blocked — waiting on dependencies
      } else {
        acc.idle += tickHours;     // no items at all — WIP limit is full, backlog is empty
      }
      continue;
    }

    const usefulFraction = 4 / (K + 3);              // Weinberg: productive share of the day
    const perItemPerTick = (usefulFraction / K) * tickHours;  // each item's share of this tick
    const tickUsefulHours = usefulFraction * tickHours;

    // Apply progress to every unblocked item, capped at effort_required_hours.
    const unblockedIds = new Set(unblocked.map((it) => it.id));
    items = items.map((it) =>
      unblockedIds.has(it.id) ? advanceItemEffort(it, perItemPerTick) : it,
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
