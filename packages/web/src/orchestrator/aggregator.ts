import type { CfdSnapshot, ColumnId, RunResult } from "@kanbansim/engine";

export type TimeAccountingTotals = {
  hours_working: number;
  hours_switching: number;
  hours_blocked: number;
  hours_idle: number;
};

export type ColumnCountMeans = Record<ColumnId, number>;

export type CellStats = {
  sweep_value: number;
  run_count: number;
  mean_throughput: number;
  p05_throughput: number;
  p95_throughput: number;
  mean_median_lead_time: number;
  p05_median_lead_time: number;
  p95_median_lead_time: number;
  lead_time_samples: number[];        // raw completed-item lead_time_hours, capped
  representative_cfd: CfdSnapshot[] | null;
  time_accounting_totals: TimeAccountingTotals;
  column_count_means: ColumnCountMeans; // avg # items in each column, averaged across all snapshots × runs
};

export type AggregatorSnapshot = {
  total_runs: number;
  cells: Map<number, CellStats>;
};

export type IngestArgs = { sweep_value: number; result: RunResult };

export type AggregatorOptions = { leadTimeSampleCap?: number };

type CellInternal = {
  sweep_value: number;
  throughput_samples: number[];
  median_lead_time_samples: number[];
  lead_time_samples: number[];
  representative_cfd: CfdSnapshot[] | null;
  time_accounting_totals: TimeAccountingTotals;
  column_count_sums: ColumnCountMeans;       // running sums of column counts across snapshots × runs
  column_count_observations: number;          // total snapshots ingested across all runs in this cell
  run_count: number;
};

export function createAggregator(options: AggregatorOptions = {}) {
  const cap = options.leadTimeSampleCap ?? 50_000;
  const cells = new Map<number, CellInternal>();
  let totalRuns = 0;

  function ingest({ sweep_value, result }: IngestArgs): void {
    let cell = cells.get(sweep_value);
    if (!cell) {
      cell = {
        sweep_value,
        throughput_samples: [],
        median_lead_time_samples: [],
        lead_time_samples: [],
        representative_cfd: null,
        time_accounting_totals: { hours_working: 0, hours_switching: 0, hours_blocked: 0, hours_idle: 0 },
        column_count_sums: { backlog: 0, ready: 0, in_progress: 0, validation: 0, done: 0 },
        column_count_observations: 0,
        run_count: 0,
      };
      cells.set(sweep_value, cell);
    }
    cell.run_count++;
    totalRuns++;
    cell.throughput_samples.push(result.summary.throughput_per_day);
    cell.median_lead_time_samples.push(result.summary.median_lead_time_hours);
    cell.representative_cfd = result.cfd;
    for (const ta of result.time_accounting) {
      cell.time_accounting_totals.hours_working += ta.hours_working;
      cell.time_accounting_totals.hours_switching += ta.hours_switching;
      cell.time_accounting_totals.hours_blocked += ta.hours_blocked;
      cell.time_accounting_totals.hours_idle += ta.hours_idle;
    }
    for (const snap of result.cfd) {
      cell.column_count_sums.backlog += snap.counts.backlog;
      cell.column_count_sums.ready += snap.counts.ready;
      cell.column_count_sums.in_progress += snap.counts.in_progress;
      cell.column_count_sums.validation += snap.counts.validation;
      cell.column_count_sums.done += snap.counts.done;
      cell.column_count_observations++;
    }
    for (const item of result.completed_items) {
      if (cell.lead_time_samples.length < cap) {
        cell.lead_time_samples.push(item.lead_time_hours);
      } else {
        // Reservoir-style replacement to keep the sample uniform.
        const j = Math.floor(Math.random() * (cell.run_count + cell.lead_time_samples.length));
        if (j < cap) cell.lead_time_samples[j] = item.lead_time_hours;
      }
    }
  }

  function snapshot(): AggregatorSnapshot {
    const out = new Map<number, CellStats>();
    for (const [sv, c] of cells) {
      const obs = Math.max(1, c.column_count_observations);
      out.set(sv, {
        sweep_value: c.sweep_value,
        run_count: c.run_count,
        mean_throughput: mean(c.throughput_samples),
        p05_throughput: percentile(c.throughput_samples, 0.05),
        p95_throughput: percentile(c.throughput_samples, 0.95),
        mean_median_lead_time: mean(c.median_lead_time_samples),
        p05_median_lead_time: percentile(c.median_lead_time_samples, 0.05),
        p95_median_lead_time: percentile(c.median_lead_time_samples, 0.95),
        lead_time_samples: c.lead_time_samples.slice(),
        representative_cfd: c.representative_cfd,
        time_accounting_totals: { ...c.time_accounting_totals },
        column_count_means: {
          backlog: c.column_count_sums.backlog / obs,
          ready: c.column_count_sums.ready / obs,
          in_progress: c.column_count_sums.in_progress / obs,
          validation: c.column_count_sums.validation / obs,
          done: c.column_count_sums.done / obs,
        },
      });
    }
    return { total_runs: totalRuns, cells: out };
  }

  return { ingest, snapshot };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}
