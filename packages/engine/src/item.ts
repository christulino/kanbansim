import type { Item } from "./types.js";

export function createItem(args: {
  id: number;
  arrival_tick: number;
  effort_required_hours: number;
  validation_effort_hours: number;
}): Item {
  return {
    id: args.id,
    arrival_tick: args.arrival_tick,
    effort_required_hours: args.effort_required_hours,
    validation_effort_hours: args.validation_effort_hours,
    effort_done_hours: 0,
    column: "backlog",
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
  if (hours <= 0) return item;
  if (item.column !== "in_progress" && item.column !== "validation") return item;
  const cap = item.column === "in_progress" ? item.effort_required_hours : item.validation_effort_hours;
  const newEffort = Math.min(cap, item.effort_done_hours + hours);
  return { ...item, effort_done_hours: newEffort };
}

// Reset effort_done when an item moves between columns.
export function resetEffortForColumnTransition(item: Item): Item {
  return { ...item, effort_done_hours: 0 };
}
