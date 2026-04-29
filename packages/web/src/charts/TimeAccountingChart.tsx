import { useMemo } from "react";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
};

const SEG = ["hours_working", "hours_switching", "hours_blocked", "hours_idle"] as const;
type Seg = (typeof SEG)[number];
const COLORS: Record<Seg, string> = {
  hours_working: "var(--series-1)",
  hours_switching: "var(--series-3)",
  hours_blocked: "var(--series-2)",
  hours_idle: "var(--text-faint)",
};
const LABELS: Record<Seg, string> = {
  hours_working: "Working",
  hours_switching: "Switching",
  hours_blocked: "Blocked",
  hours_idle: "Idle",
};

const W = 1100;
const H = 320;
const M_LEFT = 60;
const M_RIGHT = 20;
const M_TOP = 20;
const M_BOTTOM = 50;

type Slice = { x: number; pct: Record<Seg, number> };

export function TimeAccountingChart({ snapshot, sweep }: Props) {
  const slices = useMemo<Slice[]>(() => {
    if (!snapshot) return [];
    const out: Slice[] = [];
    for (const c of snapshot.cells.values()) {
      if (c.run_count === 0) continue;
      const t = c.time_accounting_totals;
      const total = t.hours_working + t.hours_switching + t.hours_blocked + t.hours_idle;
      if (total <= 0) continue;
      out.push({
        x: c.sweep_value,
        pct: {
          hours_working: t.hours_working / total,
          hours_switching: t.hours_switching / total,
          hours_blocked: t.hours_blocked / total,
          hours_idle: t.hours_idle / total,
        },
      });
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }, [snapshot]);

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see the trend.</div>;
  }
  if (slices.length === 0) {
    return <div className="card-loading">Need at least one run to start the trend…</div>;
  }

  const xScale = (v: number) =>
    M_LEFT + ((v - sweep.min) / Math.max(1, sweep.max - sweep.min)) * (W - M_LEFT - M_RIGHT);
  const yScale = (frac: number) => M_TOP + (1 - frac) * (H - M_TOP - M_BOTTOM);

  // Build cumulative stacked paths bottom-up: idle, blocked, switching, working.
  // Order matters: bottom band sits on the x-axis, each subsequent band is layered above.
  const bottomUp: Seg[] = ["hours_idle", "hours_blocked", "hours_switching", "hours_working"];

  const paths = bottomUp.map((seg, idx) => {
    const cumLower = (s: Slice) => {
      let v = 0;
      for (let k = 0; k < idx; k++) v += s.pct[bottomUp[k]!];
      return v;
    };
    const cumUpper = (s: Slice) => cumLower(s) + s.pct[seg];
    if (slices.length === 1) {
      // Single point: render a thin vertical bar centred on x.
      const cx = xScale(slices[0]!.x);
      const yU = yScale(cumUpper(slices[0]!));
      const yL = yScale(cumLower(slices[0]!));
      return `M ${cx - 6},${yU} L ${cx + 6},${yU} L ${cx + 6},${yL} L ${cx - 6},${yL} Z`;
    }
    const top = slices.map((s) => `${xScale(s.x)},${yScale(cumUpper(s))}`).join(" L ");
    const bot = slices.slice().reverse().map((s) => `${xScale(s.x)},${yScale(cumLower(s))}`).join(" L ");
    return `M ${top} L ${bot} Z`;
  });

  // Y ticks at 0%, 25%, 50%, 75%, 100%
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {/* Y grid + labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={M_LEFT} x2={W - M_RIGHT} y1={yScale(t)} y2={yScale(t)} stroke="var(--rule-soft)" strokeDasharray="2 4" />
            <text x={M_LEFT - 8} y={yScale(t) + 3} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="var(--text-soft)">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        {/* Stacked areas */}
        {paths.map((d, i) => (
          <path key={bottomUp[i]} d={d} fill={COLORS[bottomUp[i]!]} fillOpacity={0.85} />
        ))}

        {/* X axis baseline */}
        <line x1={M_LEFT} x2={W - M_RIGHT} y1={H - M_BOTTOM} y2={H - M_BOTTOM} stroke="var(--rule)" />

        {/* X tick labels — one per slice but only if there's room */}
        {slices.map((s, i) => {
          const skip = slices.length > 12 && i % 2 !== 0;
          if (skip) return null;
          return (
            <text
              key={`xlabel-${s.x}`}
              x={xScale(s.x)}
              y={H - M_BOTTOM + 16}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontSize="11"
              fill="var(--text-soft)"
            >
              {s.x}
            </text>
          );
        })}
        <text
          x={(M_LEFT + W - M_RIGHT) / 2}
          y={H - 10}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
          fill="var(--text-soft)"
          letterSpacing="0.12em"
        >
          {sweep.variable.toUpperCase()}
        </text>
      </svg>

      <div className="time-legend">
        {bottomUp.slice().reverse().map((seg) => (
          <span key={seg}>
            <span className="swatch" style={{ background: COLORS[seg] }} />
            {LABELS[seg]}
          </span>
        ))}
      </div>
    </div>
  );
}
