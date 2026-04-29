import { useEffect, useRef, useState } from "react";
import { generateSweepValues, setAtPath, type ExperimentConfig } from "@kanbansim/engine";
import { runPool, type PoolJob, type PoolHandle } from "./pool.js";
import { deriveSeed } from "./seeds.js";
import type { AggregatorSnapshot } from "./aggregator.js";
import type { ExperimentState } from "../state/urlCodec.js";
import { applyRandomization } from "../state/randomization.js";

export type ExperimentStatus = "idle" | "running" | "complete" | "cancelled" | "error";

export type UseExperimentReturn = {
  snapshot: AggregatorSnapshot | null;
  status: ExperimentStatus;
  runsCompleted: number;
  runsTotal: number;
  startedAt: number | null;
  etaSeconds: number | null;
  runsPerSec: number | null;
  workerCount: number;
  start: (state: ExperimentState) => void;
  cancel: () => void;
};

const MAX_WORKERS = 8;

export function useExperiment(): UseExperimentReturn {
  const [snapshot, setSnapshot] = useState<AggregatorSnapshot | null>(null);
  const [status, setStatus] = useState<ExperimentStatus>("idle");
  const [runsTotal, setRunsTotal] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [runsPerSec, setRunsPerSec] = useState<number | null>(null);
  const handleRef = useRef<PoolHandle | null>(null);
  const workerCount = Math.min(MAX_WORKERS, typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4);

  useEffect(() => {
    return () => { handleRef.current?.cancel(); };
  }, []);

  function start(state: ExperimentState) {
    handleRef.current?.cancel();
    const jobs = buildJobs(state);
    setSnapshot(null);
    setStatus("running");
    setRunsTotal(jobs.length);
    const t0 = Date.now();
    setStartedAt(t0);
    setEtaSeconds(null);
    setRunsPerSec(null);

    const handle = runPool({
      jobs,
      workerCount,
      throttleMs: 50,
      onProgress: (snap) => {
        setSnapshot(snap);
        const elapsedSec = (Date.now() - t0) / 1000;
        if (elapsedSec > 0.4 && snap.total_runs > 0) {
          const rps = snap.total_runs / elapsedSec;
          setRunsPerSec(rps);
          const remaining = jobs.length - snap.total_runs;
          setEtaSeconds(rps > 0 ? remaining / rps : null);
        }
      },
    });
    handleRef.current = handle;
    handle.done.then((finalSnap) => {
      setSnapshot(finalSnap);
      setStatus("complete");
      setEtaSeconds(0);
    }).catch((err) => {
      if ((err as { cancelled?: boolean }).cancelled) {
        setStatus("cancelled");
      } else {
        setStatus("error");
      }
    });
  }

  function cancel() {
    handleRef.current?.cancel();
  }

  return {
    snapshot, status,
    runsCompleted: snapshot?.total_runs ?? 0,
    runsTotal, startedAt, etaSeconds, runsPerSec,
    workerCount,
    start, cancel,
  };
}

function buildJobs(state: ExperimentState): PoolJob[] {
  const out: PoolJob[] = [];
  const sweepValues = state.sweep
    ? generateSweepValues(state.sweep.min, state.sweep.max, state.sweep.step)
    : [Number.NaN];
  const masterSeed = BigInt(state.master_seed);
  for (let cellIdx = 0; cellIdx < sweepValues.length; cellIdx++) {
    const sv = sweepValues[cellIdx]!;
    const cellConfig: ExperimentConfig = state.sweep
      ? setAtPath(state.config, state.sweep.variable, sv)
      : state.config;
    for (let r = 0; r < state.runs; r++) {
      const seed = deriveSeed(masterSeed, cellIdx, r);
      const runConfig = applyRandomization(cellConfig, state.randomized, seed);
      out.push({ sweep_value: Number.isNaN(sv) ? 0 : sv, config: runConfig, seed: seed.toString() });
    }
  }
  return out;
}
