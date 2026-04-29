import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfigurator } from "../state/useConfigurator.js";
import { decodeExperiment, encodeExperiment, type ExperimentState } from "../state/urlCodec.js";
import { loadPreset } from "../state/presets.js";
import { TabBar, type TabId } from "./configurator/TabBar.js";
import { TeamTab } from "./configurator/TeamTab.js";
import { WorkTab } from "./configurator/WorkTab.js";
import { BoardTab } from "./configurator/BoardTab.js";
import { MonteCarloTab } from "./configurator/MonteCarloTab.js";

export function Build() {
  const navigate = useNavigate();
  const location = useLocation();
  const [initial, setInitial] = useState<ExperimentState | null>(null);
  const [tab, setTab] = useState<TabId>("team");

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
    const e = params.get("e");
    const decoded = e ? decodeExperiment(e) : null;
    if (decoded) { setInitial(decoded); return; }
    loadPreset("sweet-spot").then(setInitial).catch(() => setInitial(null));
  }, [location.search, location.hash]);

  if (!initial) return <main data-surface="paper" className="build-page"><p>Loading…</p></main>;

  return <BuildInner initial={initial} tab={tab} setTab={setTab} navigate={navigate} />;
}

function BuildInner({ initial, tab, setTab, navigate }: { initial: ExperimentState; tab: TabId; setTab: (t: TabId) => void; navigate: ReturnType<typeof useNavigate> }) {
  const cfg = useConfigurator(initial);

  function handleRun() {
    const encoded = encodeExperiment(cfg.state);
    navigate(`/run?e=${encoded}`);
  }

  return (
    <main data-surface="paper" className="build-page">
      <div className="build-head">
        <h1>Build an experiment</h1>
        <div className="actions">
          <button className="btn btn-primary" onClick={handleRun} type="button">Run experiment →</button>
        </div>
      </div>
      <TabBar active={tab} onChange={setTab} />
      {tab === "team" && <TeamTab state={cfg.state} update={cfg.update} />}
      {tab === "work" && <WorkTab state={cfg.state} update={cfg.update} toggleRandomize={cfg.toggleRandomize} />}
      {tab === "board" && <BoardTab state={cfg.state} update={cfg.update} />}
      {tab === "monte-carlo" && <MonteCarloTab state={cfg.state} setRuns={cfg.setRuns} setMasterSeed={cfg.setMasterSeed} setSweep={cfg.setSweep} />}
    </main>
  );
}
