// Per-tick parallel-work allocation.
//
// Workers do not pick a single item per tick; they spread productive hours
// across all unblocked active items they're carrying. Blocked items still
// count toward the carry (context overhead) but get no progress this tick.

export type TickAllocation = {
  paceFactor: number;        // 0.1..1
  usefulHours: number;       // total useful work this tick after pace + pull cost
  perItemHours: number;      // hours added to each progressing item
};

export function computeTickAllocation(args: {
  tickHours: number;
  activeCarryCount: number;     // unblocked + blocked items I'm carrying (after any pull)
  progressingCount: number;     // unblocked items getting progress this tick
  pullCostHours: number;        // one-time overhead for any pulls performed this tick
  pacePenalty: number;          // 0..1, e.g. 0.05 = 5%/extra
}): TickAllocation {
  const carry = Math.max(1, args.activeCarryCount);
  const rawPace = 1 - args.pacePenalty * (carry - 1);
  const paceFactor = Math.max(0.1, rawPace);
  const beforePace = Math.max(0, args.tickHours - args.pullCostHours);
  const usefulHours = beforePace * paceFactor;
  const perItemHours = args.progressingCount > 0 ? usefulHours / args.progressingCount : 0;
  return { paceFactor, usefulHours, perItemHours };
}
