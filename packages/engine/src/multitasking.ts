// Per-tick parallel-work allocation.
//
// Workers spread their productive hours across all unblocked active items.
// The only multitasking tax is the switch cost: visiting N items in a day
// incurs (N-1) transitions, each costing switch_cost_minutes. That overhead
// is taken off the day's productive hours; the remainder is split evenly
// across the items being progressed.

export type TickAllocation = {
  switchOverheadHours: number;  // total switch overhead absorbed this tick
  usefulHours: number;          // productive hours added to items this tick
  perItemHours: number;         // per-item progress this tick
};

export function computeTickAllocation(args: {
  tickHours: number;
  productiveHoursPerDay: number;
  progressingCount: number;     // unblocked items getting progress this tick
  switchCostHours: number;      // hours per switch (e.g. 15min = 0.25)
  extraDisruptionHours?: number; // one-time disruptions this tick (e.g. block events on the worker's items)
}): TickAllocation {
  const n = args.progressingCount;
  if (n <= 0) return { switchOverheadHours: 0, usefulHours: 0, perItemHours: 0 };

  // Per day: visiting N items requires N-1 transitions.
  const dailySwitchOverhead = Math.max(0, n - 1) * args.switchCostHours;
  // Spread the day's overhead evenly across its productive hours, then scale to this tick.
  const overheadPerHour = dailySwitchOverhead / Math.max(1, args.productiveHoursPerDay);
  const baseOverhead = overheadPerHour * args.tickHours;
  const totalOverhead = Math.min(args.tickHours, baseOverhead + Math.max(0, args.extraDisruptionHours ?? 0));
  const usefulHours = Math.max(0, args.tickHours - totalOverhead);
  const perItemHours = usefulHours / n;
  return { switchOverheadHours: totalOverhead, usefulHours, perItemHours };
}
