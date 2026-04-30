import { useMemo, useRef, useState } from "react";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";
import type { ColumnId } from "@kanbansim/engine";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
};

const COLUMNS: ColumnId[] = ["backlog", "in_progress", "validation", "done"];
const COLORS: Record<ColumnId, string> = {
  backlog: "var(--series-5)",
  in_progress: "var(--series-2)",
  validation: "var(--series-3)",
  done: "var(--series-1)",
};
const LABELS: Record<ColumnId, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  validation: "Validation",
  done: "Done",
};

const W = 1100;
const H = 360;
const M_LEFT = 60;
const M_RIGHT = 20;
const M_TOP = 20;
const M_BOTTOM = 50;

type Bar = { x: number; means: Record<ColumnId, number>; total: number };
type HoverState = { screenX: number; screenY: number; bar: Bar };

export function BoardLoadChart({ snapshot, sweep }: Props) {
  const stickyMaxRef = useRef(1);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const bars = useMemo<Bar[]>(() => {
    if (!snapshot) return [];
    const out: Bar[] = [];
    for (const c of snapshot.cells.values()) {
      if (c.run_count === 0) continue;
      const m = c.column_count_means;
      const total = m.backlog + m.in_progress + m.validation + m.done;
      if (total <= 0) continue;
      out.push({ x: c.sweep_value, means: m, total });
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }, [snapshot]);

  // Per-category peaks: which sweep cell maximizes each column's average count?
  const peaks = useMemo<Record<ColumnId, { x: number; value: number } | null>>(() => {
    const init = { backlog: null, in_progress: null, validation: null, done: null } as Record<ColumnId, { x: number; value: number } | null>;
    if (bars.length === 0) return init;
    for (const col of COLUMNS) {
      let best: { x: number; value: number } | null = null;
      for (const b of bars) {
        const v = b.means[col];
        if (best === null || v > best.value) best = { x: b.x, value: v };
      }
      init[col] = best;
    }
    return init;
  }, [bars]);

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see board load.</div>;
  }
  if (bars.length === 0) {
    return <div className="card-loading">Need at least one run to populate board state…</div>;
  }

  const observedMax = Math.max(...bars.map((b) => b.total));
  if (observedMax > stickyMaxRef.current) stickyMaxRef.current = observedMax * 1.05;
  const yMax = stickyMaxRef.current;

  const xScale = (v: number) =>
    M_LEFT + ((v - sweep.min) / Math.max(1, sweep.max - sweep.min)) * (W - M_LEFT - M_RIGHT);
  const yScale = (count: number) => M_TOP + (1 - count / yMax) * (H - M_TOP - M_BOTTOM);

  const cellPx = (W - M_LEFT - M_RIGHT) / Math.max(1, (sweep.max - sweep.min) / sweep.step);
  const barW = Math.max(10, Math.min(60, cellPx * 0.7));

  const yTicks = niceTicks(0, yMax, 5);

  function showHover(bar: Bar, evt: React.MouseEvent) {
    if (!hostRef.current) return;
    const target = (evt.currentTarget as SVGElement).getBoundingClientRect();
    const host = hostRef.current.getBoundingClientRect();
    setHovered({
      screenX: target.left + target.width / 2 - host.left,
      screenY: target.top - host.top,
      bar,
    });
  }

  return (
    <div ref={hostRef} className="chart-host">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {/* Y grid + labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={M_LEFT} x2={W - M_RIGHT} y1={yScale(t)} y2={yScale(t)} stroke="var(--rule-soft)" strokeDasharray="2 4" />
            <text x={M_LEFT - 8} y={yScale(t) + 3} textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="var(--text-soft)">
              {t.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Stacked bars */}
        {bars.map((b) => {
          const cx = xScale(b.x);
          let cumLower = 0;
          // Invisible full-bar overlay used as the hover target so any segment of the column triggers the tooltip.
          const yTopFull = yScale(b.total);
          const yBotFull = yScale(0);
          return (
            <g key={`bar-${b.x}`}>
              {COLUMNS.map((col) => {
                const value = b.means[col];
                if (value <= 0) return null;
                const yTop = yScale(cumLower + value);
                const yBot = yScale(cumLower);
                cumLower += value;
                return (
                  <rect
                    key={col}
                    x={cx - barW / 2}
                    y={yTop}
                    width={barW}
                    height={Math.max(0.5, yBot - yTop)}
                    fill={COLORS[col]}
                    fillOpacity={0.85}
                  />
                );
              })}
              <rect
                x={cx - barW / 2}
                y={yTopFull}
                width={barW}
                height={Math.max(1, yBotFull - yTopFull)}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={(e) => showHover(b, e)}
                onMouseLeave={() => setHovered(null)}
              />
            </g>
          );
        })}

        {/* X axis */}
        <line x1={M_LEFT} x2={W - M_RIGHT} y1={H - M_BOTTOM} y2={H - M_BOTTOM} stroke="var(--rule)" />
        {bars.map((b, i) => {
          const skip = bars.length > 12 && i % 2 !== 0;
          if (skip) return null;
          return (
            <text
              key={`xlabel-${b.x}`}
              x={xScale(b.x)}
              y={H - M_BOTTOM + 16}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontSize="11"
              fill="var(--text-soft)"
            >
              {b.x}
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

        {/* Y axis label */}
        <text
          x={18}
          y={(M_TOP + H - M_BOTTOM) / 2}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize="11"
          fill="var(--text-soft)"
          letterSpacing="0.12em"
          transform={`rotate(-90 18 ${(M_TOP + H - M_BOTTOM) / 2})`}
        >
          AVG ITEMS PER COLUMN
        </text>
      </svg>

      {hovered && (
        <div className="chart-tooltip" style={{ left: hovered.screenX, top: hovered.screenY }}>
          <div className="tt-title">{sweep.variable} = {hovered.bar.x}</div>
          {COLUMNS.map((col) => (
            <div key={col} className="tt-row">
              <span className="tt-key">{LABELS[col]}</span>
              <span className="tt-val">{hovered.bar.means[col].toFixed(2)}</span>
            </div>
          ))}
          <div className="tt-row" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(244,238,220,0.18)" }}>
            <span className="tt-key">Total</span>
            <span className="tt-val">{hovered.bar.total.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="cfd-legend">
        {COLUMNS.map((col) => (
          <span key={col}>
            <span className="cfd-swatch" style={{ background: COLORS[col] }} />
            {LABELS[col]}
          </span>
        ))}
      </div>

      <div className="peaks-strip">
        <span className="peak-label">Highest of each:</span>
        {COLUMNS.map((col) => {
          const p = peaks[col];
          if (!p) return null;
          return (
            <span key={col}>
              <span className="cfd-swatch" style={{ background: COLORS[col], marginRight: 4 }} />
              <span>{LABELS[col]}: <span className="peak-val">{p.value.toFixed(1)}</span> @ {sweep.variable.split(".").pop()}={p.x}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function niceTicks(min: number, max: number, target: number): number[] {
  const range = max - min || 1;
  const rough = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => range / c <= target * 1.2) ?? candidates[candidates.length - 1]!;
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
