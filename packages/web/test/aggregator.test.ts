import { describe, expect, it } from "vitest";
import { createAggregator, type CellStats } from "../src/orchestrator/aggregator.js";
import type { RunResult } from "@kanbansim/engine";

function makeResult(throughput: number, leadTime: number, completed = 50): RunResult {
  return {
    config: {} as RunResult["config"],
    seed: 1n,
    completed_items: Array.from({ length: completed }, (_, i) => ({
      id: i, arrival_tick: 0, done_tick: leadTime,
      lead_time_hours: leadTime, blocked_hours: 0, validation_started_tick: null,
    })),
    cfd: [{ tick: 0, counts: { backlog: 0, in_progress: 0, validation: 0, done: 0 } }],
    time_accounting: [
      { worker_id: 1, hours_working: 100, hours_switching: 20, hours_blocked: 30, hours_idle: 10 },
    ],
    summary: {
      throughput_per_day: throughput,
      median_lead_time_hours: leadTime,
      p85_lead_time_hours: leadTime,
      p95_lead_time_hours: leadTime,
      max_lead_time_hours: leadTime,
      items_completed: completed,
      items_arrived: completed,
    },
  };
}

describe("aggregator", () => {
  it("starts empty", () => {
    const agg = createAggregator();
    expect(agg.snapshot().cells.size).toBe(0);
    expect(agg.snapshot().total_runs).toBe(0);
  });

  it("buckets results by sweep_value", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2.5, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(2.7, 75) });
    agg.ingest({ sweep_value: 6, result: makeResult(2.4, 90) });
    const snap = agg.snapshot();
    expect(snap.cells.size).toBe(2);
    expect(snap.cells.get(5)?.run_count).toBe(2);
    expect(snap.cells.get(6)?.run_count).toBe(1);
    expect(snap.total_runs).toBe(3);
  });

  it("computes mean items_completed and lead time across runs in a cell", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2.0, 80, 100) });
    agg.ingest({ sweep_value: 5, result: makeResult(3.0, 100, 200) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.mean_items_completed).toBeCloseTo(150);
    expect(cell.mean_median_lead_time).toBeCloseTo(90);
  });

  it("computes 5th and 95th percentile bands from run summaries", () => {
    const agg = createAggregator();
    for (let i = 0; i < 100; i++) {
      agg.ingest({ sweep_value: 5, result: makeResult(0, i, i) });
    }
    const cell = agg.snapshot().cells.get(5)!;
    // Percentile uses floor(p * (n-1)), so for n=100: p05 → idx 4, p95 → idx 94.
    expect(cell.p05_items_completed).toBe(4);
    expect(cell.p95_items_completed).toBe(94);
  });

  it("accumulates raw lead-time hours per cell for the histogram", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80, 3) });
    agg.ingest({ sweep_value: 5, result: makeResult(2, 90, 2) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.lead_time_samples.length).toBe(5);
  });

  it("caps stored lead-time samples per cell at 50K", () => {
    const agg = createAggregator({ leadTimeSampleCap: 1000 });
    for (let i = 0; i < 50; i++) agg.ingest({ sweep_value: 5, result: makeResult(2, 80, 100) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.lead_time_samples.length).toBeLessThanOrEqual(1000);
    expect(cell.run_count).toBe(50);
  });

  it("stores at most one representative cfd per cell (most recent)", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(2.1, 82) });
    expect(agg.snapshot().cells.get(5)?.representative_cfd).toBeDefined();
  });

  it("aggregates worker time accounting totals", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.time_accounting_totals.hours_working).toBe(200);
    expect(cell.time_accounting_totals.hours_switching).toBe(40);
  });
});

// Type re-export check (compile-time)
const _check: CellStats = {} as unknown as CellStats;
void _check;
