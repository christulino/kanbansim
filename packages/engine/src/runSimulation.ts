// runSimulation: top-level entry point for a single Monte Carlo run.
//
// Design: two phases.
//   Phase 1 — Pre-sample arrivals: all items that will ever arrive are created upfront
//             and scheduled as events. This avoids interleaving arrival logic with the
//             tick loop and makes the PRNG sequence fully deterministic.
//   Phase 2 — Tick loop: advance one hour at a time, delegating all per-tick logic
//             to processTick (blocks, replenishment, work, completions).
//
// Note: totalTicks assumes tick_size_hours === 1. Changing tick_size_hours without
// updating the loop bound would silently mis-scale the simulation duration.

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
  // totalTicks === total productive hours (assumes tick_size_hours = 1).
  const totalTicks = config.simulation.sim_days * config.team.productive_hours_per_day;
  const productiveHoursPerDay = config.team.productive_hours_per_day;

  // Phase 1: pre-sample all arrivals and schedule them as events.
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

  // Phase 2: tick loop — one hour per iteration.
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
    // CFD snapshot: count arrived items per column (pre-arrival items are hidden).
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
