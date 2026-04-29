import { formatInt, formatEta } from "../lib/format.js";

type Props = {
  runsCompleted: number;
  runsTotal: number;
  workerCount: number;
  runsPerSec: number | null;
  etaSeconds: number | null;
  isRunning: boolean;
};

export function Counter({ runsCompleted, runsTotal, workerCount, runsPerSec, etaSeconds, isRunning }: Props) {
  return (
    <div className="run-counter mono">
      {formatInt(runsCompleted)} / {formatInt(runsTotal)} runs
      {isRunning && ` · ${formatEta(etaSeconds)}`}
      {` · ${workerCount} workers`}
      {runsPerSec !== null && ` · ${Math.round(runsPerSec)} runs/sec`}
    </div>
  );
}
