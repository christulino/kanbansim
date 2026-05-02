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
