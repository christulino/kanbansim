import { useMemo } from "react";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { CfdSnapshot } from "@kanbansim/engine";

type Props = {
  snapshot: AggregatorSnapshot | null;
  isComplete: boolean;
  productive_hours_per_day: number;
};

const COLUMNS = ["done", "validation", "in_progress", "ready", "backlog"] as const;
const COLORS: Record<(typeof COLUMNS)[number], string> = {
  done: "var(--series-1)",
  validation: "var(--series-3)",
  in_progress: "var(--series-2)",
  ready: "var(--series-4)",
  backlog: "var(--series-5)",
};

export function CfdChart({ snapshot, isComplete, productive_hours_per_day }: Props) {
  const cfd = useMemo(() => pickRepresentativeCfd(snapshot), [snapshot]);

  if (!cfd || cfd.length === 0) {
    return <div className="card-loading">Waiting for the first run to complete…</div>;
  }

  const W = 1180;
  const H = 280;
  const days = cfd.length / productive_hours_per_day;
  const xScale = (tick: number) => (tick / (cfd.length - 1)) * W;
  const totalAtTick = (snap: CfdSnapshot) =>
    snap.counts.done + snap.counts.validation + snap.counts.in_progress + snap.counts.ready + snap.counts.backlog;
  const maxTotal = Math.max(...cfd.map(totalAtTick), 1);
  const yScale = (count: number) => H - (count / maxTotal) * H;

  const paths = COLUMNS.map((_, i) => {
    const cumulativeUpTo = (snap: CfdSnapshot, idx: number) => {
      let s = 0;
      for (let k = 0; k <= idx; k++) s += snap.counts[COLUMNS[k]!];
      return s;
    };
    const top: string[] = [];
    for (let t = 0; t < cfd.length; t++) {
      top.push(`${xScale(t)},${yScale(cumulativeUpTo(cfd[t]!, i))}`);
    }
    if (i === 0) {
      return `M ${top.join(" L ")} L ${xScale(cfd.length - 1)},${H} L ${xScale(0)},${H} Z`;
    }
    const bot: string[] = [];
    for (let t = cfd.length - 1; t >= 0; t--) {
      bot.push(`${xScale(t)},${yScale(cumulativeUpTo(cfd[t]!, i - 1))}`);
    }
    return `M ${top.join(" L ")} L ${bot.join(" L ")} Z`;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="cfd-svg" style={{ height: 280 }}>
        <defs>
          <clipPath id="cfd-reveal">
            <rect x="0" y="0" height={H} width={W} className={isComplete ? "" : "cfd-reveal-anim"} />
          </clipPath>
        </defs>
        <g clipPath="url(#cfd-reveal)">
          {paths.map((d, i) => <path key={COLUMNS[i]} d={d} fill={COLORS[COLUMNS[i]!]} fillOpacity={0.85 - i * 0.05} />)}
        </g>
      </svg>
      <div className="hist-axis" style={{ borderTop: "none", paddingTop: 8 }}>
        <span>day 1</span>
        <span>day {Math.round(days / 6)}</span>
        <span>day {Math.round(days / 3)}</span>
        <span>day {Math.round(days / 2)}</span>
        <span>day {Math.round((2 * days) / 3)}</span>
        <span>day {Math.round((5 * days) / 6)}</span>
        <span>day {Math.round(days)}</span>
      </div>
      <div className="cfd-legend">
        {COLUMNS.map((col) => (
          <span key={col}><span className="cfd-swatch" style={{ background: COLORS[col] }} />{labelFor(col)}</span>
        ))}
      </div>
    </div>
  );
}

function labelFor(col: (typeof COLUMNS)[number]): string {
  if (col === "in_progress") return "In Progress";
  if (col === "done") return "Done";
  if (col === "validation") return "Validation";
  if (col === "ready") return "Ready";
  return "Backlog";
}

function pickRepresentativeCfd(snapshot: AggregatorSnapshot | null): CfdSnapshot[] | null {
  if (!snapshot || snapshot.cells.size === 0) return null;
  let best: { lt: number; cfd: CfdSnapshot[] | null } = { lt: Infinity, cfd: null };
  for (const c of snapshot.cells.values()) {
    if (c.run_count > 0 && c.mean_median_lead_time < best.lt && c.representative_cfd) {
      best = { lt: c.mean_median_lead_time, cfd: c.representative_cfd };
    }
  }
  return best.cfd;
}
