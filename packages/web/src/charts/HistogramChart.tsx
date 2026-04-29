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
  const max = Math.max(...samplesDays);
  const min = Math.min(...samplesDays);
  const span = Math.max(0.1, max - min);
  const binWidth = span / BIN_COUNT;
  const bins = Array.from({ length: BIN_COUNT }, () => 0);
  for (const v of samplesDays) {
    const i = Math.min(BIN_COUNT - 1, Math.floor((v - min) / binWidth));
    bins[i]!++;
  }
  const peak = Math.max(...bins, 1);

  const sorted = samplesDays.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const sampleMax = sorted[sorted.length - 1] ?? 0;

  return (
    <div>
      <div className="hist-bars">
        {bins.map((b, i) => (
          <div key={i} className="hist-bar" style={{ height: `${(b / peak) * 100}%` }} />
        ))}
      </div>
      <div className="hist-axis">
        <span>{min.toFixed(0)}d</span>
        <span>{(min + span * 0.25).toFixed(0)}d</span>
        <span>{(min + span * 0.5).toFixed(0)}d</span>
        <span>{(min + span * 0.75).toFixed(0)}d</span>
        <span>{max.toFixed(0)}d</span>
      </div>
      <div className="hist-stats">
        <Stat k="Median" v={`${median.toFixed(1)} d`} />
        <Stat k="Mean" v={`${mean.toFixed(1)} d`} />
        <Stat k="P85" v={`${p85.toFixed(1)} d`} />
        <Stat k="P95" v={`${p95.toFixed(1)} d`} />
        <Stat k="Max" v={`${sampleMax.toFixed(1)} d`} />
      </div>
      <div className="hist-meta mono">Sample size: {samplesDays.length.toLocaleString()} items at sweep = {cell.sweep_value}</div>
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
