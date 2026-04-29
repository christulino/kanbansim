import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
  productive_hours_per_day: number;
  totalRunsExpected: number;
};

type CellPoint = { x: number; throughput: number; lt_days: number; tp_lo: number; tp_hi: number; lt_lo: number; lt_hi: number };

const SVG_NS = "http://www.w3.org/2000/svg";

export function UCurveChart({ snapshot, sweep, productive_hours_per_day, totalRunsExpected }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!sweep || !snapshot) return;

    const points: CellPoint[] = [];
    for (const [sv, c] of snapshot.cells) {
      points.push({
        x: sv,
        throughput: c.mean_throughput,
        lt_days: c.mean_median_lead_time / productive_hours_per_day,
        tp_lo: c.p05_throughput, tp_hi: c.p95_throughput,
        lt_lo: c.p05_median_lead_time / productive_hours_per_day,
        lt_hi: c.p95_median_lead_time / productive_hours_per_day,
      });
    }
    points.sort((a, b) => a.x - b.x);
    if (points.length === 0) return;

    const ltMax = Math.max(...points.map((p) => p.lt_hi)) * 1.1 || 1;
    const tpMax = Math.max(...points.map((p) => p.tp_hi)) * 1.1 || 1;

    const fig = Plot.plot({
      width: 1100,
      height: 360,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" },
      x: { label: sweep.variable, domain: [sweep.min, sweep.max], grid: false },
      y: { label: "Lead time (days)", domain: [0, ltMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "lt_lo", y2: "lt_hi", fill: "var(--series-2)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "lt_days", stroke: "var(--series-2)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "lt_days", fill: "var(--series-2)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "lt_days", text: () => "Lead Time", dx: 8, dy: -6, fill: "var(--series-2)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const fig2 = Plot.plot({
      width: 1100,
      height: 360,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", position: "absolute", top: 0, left: 0, pointerEvents: "none" },
      x: { domain: [sweep.min, sweep.max], axis: null },
      y: { axis: "right", label: "Throughput (items/day)", domain: [0, tpMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "tp_lo", y2: "tp_hi", fill: "var(--series-1)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "throughput", stroke: "var(--series-1)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "throughput", fill: "var(--series-1)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "throughput", text: () => "Throughput", dx: 8, dy: -6, fill: "var(--series-1)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.appendChild(fig);
    wrap.appendChild(fig2);

    if (snapshot.total_runs >= totalRunsExpected * 0.5 && points.length >= 3) {
      const optimal = points.reduce((acc, p) => (p.lt_days < acc.lt_days ? p : acc), points[0]!);
      const ann = document.createElementNS(SVG_NS, "svg");
      ann.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;");
      ann.setAttribute("viewBox", "0 0 1100 360");
      const text = document.createElementNS(SVG_NS, "text");
      const xPos = ((optimal.x - sweep.min) / (sweep.max - sweep.min)) * 980 + 60;
      text.setAttribute("x", String(xPos));
      text.setAttribute("y", "40");
      text.setAttribute("font-family", "Caveat, cursive");
      text.setAttribute("font-size", "20");
      text.setAttribute("fill", "var(--accent)");
      text.textContent = `optimal ≈ ${optimal.x.toFixed(0)}`;
      ann.appendChild(text);
      wrap.appendChild(ann);
    }

    host.appendChild(wrap);
    return () => { while (host.firstChild) host.removeChild(host.firstChild); };
  }, [snapshot, sweep, productive_hours_per_day, totalRunsExpected]);

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see the U-curve.</div>;
  }
  if (!snapshot || snapshot.total_runs === 0) {
    return <div className="card-loading">Waiting for first runs…</div>;
  }
  return <div ref={ref} />;
}
