import { useMemo } from "react";
import type { AggregatorSnapshot, CellStats } from "../orchestrator/aggregator.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  productive_hours_per_day: number;
};

const BIN_COUNT = 22;

export function HistogramChart({ snapshot, productive_hours_per_day }: Props) {
  const cell = useMemo(() => pickOptimalCell(snapshot), [snapshot]);

  if (!cell || cell.lead_time_samples.length === 0) {
    return <div className="card-loading">Collecting completed items…</div>;
  }

  const samplesDays = cell.lead_time_samples.map((h) => h / productive_hours_per_day);
  const sorted = samplesDays.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const sampleMax = sorted[sorted.length - 1] ?? 0;

  // Bin from 0 to P99 so the shape is visible. Anything above P99 spills into the last overflow bin.
  const binMin = 0;
  const binMax = Math.max(p99, 1);
  const binWidth = binMax / BIN_COUNT;
  const bins = Array.from({ length: BIN_COUNT }, () => 0);
  for (const v of samplesDays) {
    const i = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((v - binMin) / binWidth)));
    bins[i]!++;
  }
  const peak = Math.max(...bins, 1);

  return (
    <div>
      <div className="hist-bars">
        {bins.map((b, i) => (
          <div key={i} className="hist-bar" style={{ height: `${(b / peak) * 100}%` }} title={`${b} items in ${(i * binWidth).toFixed(1)}–${((i + 1) * binWidth).toFixed(1)}d`} />
        ))}
      </div>
      <div className="hist-axis">
        <span>0d</span>
        <span>{(binMax * 0.25).toFixed(0)}d</span>
        <span>{(binMax * 0.5).toFixed(0)}d</span>
        <span>{(binMax * 0.75).toFixed(0)}d</span>
        <span>{binMax.toFixed(0)}d+</span>
      </div>
      <div className="hist-stats">
        <Stat k="Median" v={`${median.toFixed(1)} d`} />
        <Stat k="Mean" v={`${mean.toFixed(1)} d`} />
        <Stat k="P85" v={`${p85.toFixed(1)} d`} />
        <Stat k="P95" v={`${p95.toFixed(1)} d`} />
        <Stat k="Max" v={`${sampleMax.toFixed(1)} d`} />
      </div>
      <div className="hist-meta mono">
        Y-axis: count of completed items per bin (peak bin = full height, {peak.toLocaleString()} items).
        Cumulative across {samplesDays.length.toLocaleString()} items finished at the optimal sweep cell, all runs combined.
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="stat"><div className="key">{k}</div><div className="val">{v}</div></div>;
}

function pickOptimalCell(snapshot: AggregatorSnapshot | null): CellStats | null {
  if (!snapshot) return null;
  let best: CellStats | null = null;
  for (const c of snapshot.cells.values()) {
    if (c.run_count === 0) continue;
    if (!best || c.mean_median_lead_time < best.mean_median_lead_time) best = c;
  }
  return best;
}
