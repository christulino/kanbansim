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
