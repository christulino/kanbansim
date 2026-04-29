import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { decodeExperiment, type ExperimentState } from "../state/urlCodec.js";

export function RunResults() {
  const location = useLocation();
  const [state, setState] = useState<ExperimentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
    const e = params.get("e");
    if (!e) { setError("No experiment in URL. Visit /build to configure one."); return; }
    const decoded = decodeExperiment(e);
    if (!decoded) { setError("Could not parse experiment from URL."); return; }
    setState(decoded);
  }, [location.search, location.hash]);

  if (error) {
    return <main data-surface="paper" className="build-page"><p>{error}</p></main>;
  }
  if (!state) {
    return <main data-surface="paper" className="build-page"><p>Loading…</p></main>;
  }
  return (
    <main data-surface="paper" className="run-page">
      <h1>Run / Results — phase D placeholder</h1>
      <p className="mono">runs: {state.runs} · sweep: {state.sweep?.variable ?? "(none)"}</p>
    </main>
  );
}
