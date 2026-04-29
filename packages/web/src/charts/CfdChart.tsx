import { useEffect, useMemo, useRef, useState } from "react";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { CfdSnapshot } from "@kanbansim/engine";

type Props = {
  snapshot: AggregatorSnapshot | null;
  isComplete: boolean;
  productive_hours_per_day: number;
};

const COLUMNS = ["done", "validation", "in_progress", "ready", "backlog"] as const;
type Column = (typeof COLUMNS)[number];
const COLORS: Record<Column, string> = {
  done: "var(--series-1)",
  validation: "var(--series-3)",
  in_progress: "var(--series-2)",
  ready: "var(--series-4)",
  backlog: "var(--series-5)",
};
const ANIMATION_MS = 8000;

export function CfdChart({ snapshot, isComplete, productive_hours_per_day }: Props) {
  const currentCfd = useMemo(() => pickRepresentativeCfd(snapshot), [snapshot]);

  // Hold the previous run as a "ghost" while a new one redraws over it.
  const ghostRef = useRef<CfdSnapshot[] | null>(null);
  const lastIdentityRef = useRef<CfdSnapshot[] | null>(null);
  if (currentCfd && currentCfd !== lastIdentityRef.current) {
    if (lastIdentityRef.current) ghostRef.current = lastIdentityRef.current;
    lastIdentityRef.current = currentCfd;
  }
  const ghost = ghostRef.current;

  // Sticky max scale (only ratchets up).
  const stickyMaxRef = useRef(1);

  // Playhead: 0..1 fraction of the chart drawn. Animates left-to-right while running.
  const [playhead, setPlayhead] = useState(isComplete ? 1 : 0);
  useEffect(() => {
    if (isComplete) {
      setPlayhead(1);
      return;
    }
    let raf = 0;
    let startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - startedAt) % ANIMATION_MS;
      setPlayhead(elapsed / ANIMATION_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isComplete, currentCfd]);

  if (!currentCfd || currentCfd.length === 0) {
    return <div className="card-loading">Waiting for the first run to complete…</div>;
  }

  const W = 1180;
  const H = 280;
  const days = currentCfd.length / productive_hours_per_day;

  const totalAtTick = (snap: CfdSnapshot) =>
    snap.counts.done + snap.counts.validation + snap.counts.in_progress + snap.counts.ready + snap.counts.backlog;
  const observedMax = Math.max(
    ...currentCfd.map(totalAtTick),
    ...(ghost ? ghost.map(totalAtTick) : []),
    1,
  );
  if (observedMax > stickyMaxRef.current) stickyMaxRef.current = observedMax;
  const maxTotal = stickyMaxRef.current;

  const buildPaths = (cfd: CfdSnapshot[]) => {
    const xScale = (tick: number) => (tick / Math.max(1, cfd.length - 1)) * W;
    const yScale = (count: number) => H - (count / maxTotal) * H;
    return COLUMNS.map((_, i) => {
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
  };

  const newPaths = buildPaths(currentCfd);
  const ghostPaths = ghost ? buildPaths(ghost) : null;
  const playheadX = isComplete ? W : playhead * W;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="cfd-svg" style={{ height: 280 }}>
        <defs>
          <clipPath id="cfd-reveal-new">
            <rect x="0" y="0" height={H} width={Math.max(0, playheadX)} />
          </clipPath>
          <clipPath id="cfd-keep-old">
            <rect x={Math.max(0, playheadX)} y="0" height={H} width={Math.max(0, W - playheadX)} />
          </clipPath>
        </defs>

        {/* Ghost (old run) — only visible to the right of the playhead, faded. */}
        {ghostPaths && (
          <g clipPath="url(#cfd-keep-old)" opacity="0.35">
            {ghostPaths.map((d, i) => (
              <path key={`ghost-${COLUMNS[i]}`} d={d} fill={COLORS[COLUMNS[i]!]} fillOpacity={0.85 - i * 0.05} />
            ))}
          </g>
        )}

        {/* New run — only visible to the left of the playhead. */}
        <g clipPath="url(#cfd-reveal-new)">
          {newPaths.map((d, i) => (
            <path key={`new-${COLUMNS[i]}`} d={d} fill={COLORS[COLUMNS[i]!]} fillOpacity={0.85 - i * 0.05} />
          ))}
        </g>

        {/* Playhead vertical line */}
        {!isComplete && (
          <line
            x1={playheadX}
            x2={playheadX}
            y1={0}
            y2={H}
            stroke="var(--text)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity="0.55"
          />
        )}
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

function labelFor(col: Column): string {
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
