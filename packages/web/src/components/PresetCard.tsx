import { useNavigate } from "react-router-dom";
import { encodeExperiment } from "../state/urlCodec.js";
import { loadPreset, type PresetId, PRESET_DESCRIPTIONS } from "../state/presets.js";

const TITLES: Record<PresetId, string> = {
  "sweet-spot": "The Sweet Spot",
  "qa-bottleneck": "The QA Bottleneck",
  "multitasking-tax": "The Multitasking Tax",
};

const LESSONS: Record<PresetId, string> = {
  "sweet-spot": "Little's Law made visible — find the sweet spot, see the cliffs.",
  "qa-bottleneck": "Per-column WIP must be balanced; bottlenecks form at the lowest-capacity column.",
  "multitasking-tax": "Multitasking has a real cost. Watch the team grind to a halt.",
};

export function PresetCard({ id }: { id: PresetId }) {
  const navigate = useNavigate();
  async function go() {
    const state = await loadPreset(id);
    const encoded = encodeExperiment(state);
    navigate(`/run?e=${encoded}`);
  }
  return (
    <button type="button" className="preset-card" onClick={go}>
      <div className="label">Preset</div>
      <h3>{TITLES[id]}</h3>
      <p className="lesson">{LESSONS[id]}</p>
      <p className="lesson" style={{ color: "var(--text-faint)" }}>{PRESET_DESCRIPTIONS[id]}</p>
      <div className="cta">Run preset →</div>
    </button>
  );
}
