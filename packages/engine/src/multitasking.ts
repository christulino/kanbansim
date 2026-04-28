export function effectiveWorkHours(args: {
  tickHours: number;
  switchedThisTick: boolean;
  switchCostMinutes: number;
  activeItemCount: number;
  pacePenalty: number;
}): number {
  const switchCostHours = args.switchedThisTick ? args.switchCostMinutes / 60 : 0;
  const beforePace = Math.max(0, args.tickHours - switchCostHours);
  const rawPace = 1 - args.pacePenalty * Math.max(0, args.activeItemCount - 1);
  const paceFactor = Math.max(0.1, rawPace);
  return beforePace * paceFactor;
}
