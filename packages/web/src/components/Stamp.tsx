import type { ExperimentStatus } from "../orchestrator/useExperiment.js";

type Props = { status: ExperimentStatus; runsCompleted: number; runsTotal: number };

export function Stamp({ status, runsCompleted, runsTotal }: Props) {
  if (status === "running") {
    return <span className="stamp stamp-running">Running · {runsCompleted.toLocaleString()} / {runsTotal.toLocaleString()}</span>;
  }
  if (status === "cancelled") {
    return <span className="stamp stamp-warning">Cancelled · {runsCompleted.toLocaleString()} / {runsTotal.toLocaleString()}</span>;
  }
  if (status === "complete") {
    return <span className="stamp">Run Complete · {runsTotal.toLocaleString()} / {runsTotal.toLocaleString()}</span>;
  }
  if (status === "error") {
    return <span className="stamp stamp-warning">Error</span>;
  }
  return <span className="stamp stamp-idle">Idle</span>;
}
