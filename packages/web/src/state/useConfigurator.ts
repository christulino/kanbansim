import { useCallback, useEffect, useState } from "react";
import { setAtPath } from "@kanbansim/engine";
import { encodeExperiment, type ExperimentState, type RandomizedVar, type SweepSpec } from "./urlCodec.js";

export function useConfigurator(initial: ExperimentState) {
  const [state, setState] = useState<ExperimentState>(initial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const encoded = encodeExperiment(state);
    const newHash = `${window.location.hash.split("?")[0]}?e=${encoded}`;
    if (newHash !== window.location.hash) {
      window.history.replaceState(null, "", newHash);
    }
  }, [state]);

  const update = useCallback((path: string, value: number | null) => {
    setState((s) => ({ ...s, config: setAtPath(s.config, path, value) }));
  }, []);

  const toggleRandomize = useCallback((path: string, defaults: { mu: number; sigma: number; skewness: number }) => {
    setState((s) => {
      const i = s.randomized.findIndex((r) => r.path === path);
      if (i >= 0) {
        return { ...s, randomized: s.randomized.filter((_, j) => j !== i) };
      }
      const next: RandomizedVar = { path, ...defaults };
      return { ...s, randomized: [...s.randomized, next] };
    });
  }, []);

  const setSweep = useCallback((sweep: SweepSpec | null) => {
    setState((s) => ({ ...s, sweep }));
  }, []);

  const setRuns = useCallback((runs: number) => {
    setState((s) => ({ ...s, runs }));
  }, []);

  const setMasterSeed = useCallback((master_seed: string) => {
    setState((s) => ({ ...s, master_seed }));
  }, []);

  const setName = useCallback((name: string) => {
    setState((s) => ({ ...s, name }));
  }, []);

  const replace = useCallback((next: ExperimentState) => {
    setState(next);
  }, []);

  return { state, update, toggleRandomize, setSweep, setRuns, setMasterSeed, setName, replace };
}
