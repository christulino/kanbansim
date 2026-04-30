import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { ExperimentState } from "../state/urlCodec.js";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function svgElementToString(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGElement, filename: string): void {
  const xml = svgElementToString(svg);
  downloadBlob(new Blob([xml], { type: "image/svg+xml" }), filename);
}

export async function downloadPng(svg: SVGElement, filename: string, scale = 2): Promise<void> {
  const xml = svgElementToString(svg);
  const blob = new Blob([xml], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = svg.clientWidth || 1100;
    const h = svg.clientHeight || 360;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.fillStyle = "#FAF6EC";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
    );
    downloadBlob(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export function snapshotToCsv(snapshot: AggregatorSnapshot, productive_hours_per_day: number): string {
  const header = ["sweep_value", "run_count", "mean_items_completed", "p05_items_completed", "p95_items_completed", "mean_median_lead_time_days", "p05_median_lead_time_days", "p95_median_lead_time_days"];
  const rows = [header.join(",")];
  for (const c of [...snapshot.cells.values()].sort((a, b) => a.sweep_value - b.sweep_value)) {
    rows.push([
      c.sweep_value,
      c.run_count,
      c.mean_items_completed.toFixed(2),
      c.p05_items_completed.toFixed(2),
      c.p95_items_completed.toFixed(2),
      (c.mean_median_lead_time / productive_hours_per_day).toFixed(4),
      (c.p05_median_lead_time / productive_hours_per_day).toFixed(4),
      (c.p95_median_lead_time / productive_hours_per_day).toFixed(4),
    ].join(","));
  }
  return rows.join("\n");
}

export function snapshotToJson(snapshot: AggregatorSnapshot, state: ExperimentState): string {
  const cellsArr = [...snapshot.cells.values()].map((c) => ({
    sweep_value: c.sweep_value,
    run_count: c.run_count,
    mean_items_completed: c.mean_items_completed,
    p05_items_completed: c.p05_items_completed,
    p95_items_completed: c.p95_items_completed,
    mean_median_lead_time_hours: c.mean_median_lead_time,
    lead_time_sample_count: c.lead_time_samples.length,
    time_accounting_totals: c.time_accounting_totals,
  }));
  return JSON.stringify({ experiment: state, cells: cellsArr, total_runs: snapshot.total_runs }, null, 2);
}
