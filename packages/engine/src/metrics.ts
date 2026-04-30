import type { RunResult } from "./types.js";

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx]!;
}

export function computeSummary(
  completed: RunResult["completed_items"],
  simDays: number,
  _productiveHoursPerDay: number,
): RunResult["summary"] {
  if (completed.length === 0) {
    return {
      throughput_per_day: 0,
      median_lead_time_hours: 0,
      p85_lead_time_hours: 0,
      p95_lead_time_hours: 0,
      max_lead_time_hours: 0,
      items_completed: 0,
      items_arrived: 0,
    };
  }
  const leadTimes = completed.map((c) => c.lead_time_hours);
  return {
    throughput_per_day: completed.length / simDays,
    median_lead_time_hours: percentile(leadTimes, 0.5),
    p85_lead_time_hours: percentile(leadTimes, 0.85),
    p95_lead_time_hours: percentile(leadTimes, 0.95),
    max_lead_time_hours: Math.max(...leadTimes),
    items_completed: completed.length,
    items_arrived: 0,    // overridden by runSimulation with the actual arrived count
  };
}
