export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatHoursAsDays(hours: number, productive_hours_per_day: number): string {
  const days = hours / productive_hours_per_day;
  return `${days.toFixed(1)} d`;
}

export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatThroughput(perDay: number): string {
  return `${perDay.toFixed(2)} / day`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "estimating…";
  if (seconds <= 0.5) return "done";
  if (seconds < 60) return `~${Math.round(seconds)} sec remaining`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds - m * 60);
    return `~${m} min ${s} sec remaining`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  return `~${h} hr ${m} min remaining`;
}
