import { useMemo } from "react";
import type { AggregatorSnapshot, CellStats } from "../orchestrator/aggregator.js";

type Props = { snapshot: AggregatorSnapshot | null };

const SEG = ["hours_working", "hours_switching", "hours_blocked", "hours_idle"] as const;
const COLORS: Record<(typeof SEG)[number], string> = {
  hours_working: "var(--series-1)",
  hours_switching: "var(--series-3)",
  hours_blocked: "var(--series-2)",
  hours_idle: "var(--text-faint)",
};
const LABELS: Record<(typeof SEG)[number], string> = {
  hours_working: "Working",
  hours_switching: "Switching",
  hours_blocked: "Blocked",
  hours_idle: "Idle",
};

export function TimeAccountingChart({ snapshot }: Props) {
  const { optimal, overloaded } = useMemo(() => pickPair(snapshot), [snapshot]);

  if (!optimal) return <div className="card-loading">Need at least one run to summarize time…</div>;

  return (
    <div>
      <Row title={`Sweep = ${optimal.sweep_value}`} flavor="optimal" cell={optimal} />
      {overloaded && overloaded.sweep_value !== optimal.sweep_value && (
        <Row title={`Sweep = ${overloaded.sweep_value}`} flavor="overloaded" cell={overloaded} />
      )}
      <div className="time-legend">
        {SEG.map((k) => (
          <span key={k}><span className="swatch" style={{ background: COLORS[k] }} />{LABELS[k]}</span>
        ))}
      </div>
    </div>
  );
}

function Row({ title, flavor, cell }: { title: string; flavor: "optimal" | "overloaded"; cell: CellStats }) {
  const t = cell.time_accounting_totals;
  const total = t.hours_working + t.hours_switching + t.hours_blocked + t.hours_idle || 1;
  return (
    <div className="time-row">
      <div className="row-head">
        <span className="row-label">{title} <span className={flavor === "optimal" ? "tag-optimal" : "tag-overloaded"}>({flavor})</span></span>
        <span className="mono">{Math.round(total).toLocaleString()} worker-hours</span>
      </div>
      <div className="time-bar">
        {SEG.map((k) => {
          const pct = (t[k] / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div key={k} className="time-segment" style={{ width: `${pct}%`, background: COLORS[k] }}>
              {pct >= 8 ? `${Math.round(pct)}% ${LABELS[k]}` : `${Math.round(pct)}%`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pickPair(snapshot: AggregatorSnapshot | null): { optimal: CellStats | null; overloaded: CellStats | null } {
  if (!snapshot) return { optimal: null, overloaded: null };
  let optimal: CellStats | null = null;
  let overloaded: CellStats | null = null;
  for (const c of snapshot.cells.values()) {
    if (c.run_count === 0) continue;
    if (!optimal || c.mean_median_lead_time < optimal.mean_median_lead_time) optimal = c;
    if (!overloaded || c.sweep_value > overloaded.sweep_value) overloaded = c;
  }
  return { optimal, overloaded };
}
