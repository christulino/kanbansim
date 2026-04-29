import { useNavigate } from "react-router-dom";
import type { ExperimentStatus } from "../orchestrator/useExperiment.js";
import type { ExperimentState } from "../state/urlCodec.js";
import { encodeExperiment } from "../state/urlCodec.js";

type Props = {
  status: ExperimentStatus;
  state: ExperimentState;
  onDownloadCharts: () => void;
  onDownloadRaw: () => void;
  onCopyShare: () => void;
  shareCopied: boolean;
};

export function ActionBar({ status, state, onDownloadCharts, onDownloadRaw, onCopyShare, shareCopied }: Props) {
  const navigate = useNavigate();
  const enabled = status === "complete" || status === "cancelled";
  const editHref = `/build?e=${encodeExperiment(state)}`;
  return (
    <div className="actions-bar">
      <div className="left">
        <button className="btn" disabled={!enabled} onClick={onDownloadCharts} type="button">↓ Download Charts</button>
        <button className="btn" disabled={!enabled} onClick={onDownloadRaw} type="button">↓ Download Results</button>
        <button className="btn" disabled={!enabled} onClick={onCopyShare} type="button">{shareCopied ? "✓ Copied" : "⎘ Copy Share URL"}</button>
      </div>
      <div className="right">
        <button className="btn" onClick={() => navigate(editHref)} type="button">Edit Experiment</button>
        <button className="btn btn-primary" disabled={!enabled} onClick={() => navigate("/build")} type="button">Run a New One →</button>
      </div>
    </div>
  );
}
