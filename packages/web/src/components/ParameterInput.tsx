import { Tooltip } from "./Tooltip.js";
import { TOOLTIPS } from "../lib/tooltips.js";

export type ParameterInputProps = {
  label: string;
  path: string;
  value: number | null;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  randomizable?: boolean;
  randomized?: boolean;
  onToggleRandomize?: () => void;
};

export function ParameterInput(props: ParameterInputProps) {
  const tip = TOOLTIPS[props.path] ?? "";
  return (
    <div className="param-row">
      <label className="param-label">
        <span>{props.label}</span>
        {tip && (
          <Tooltip content={tip}>
            <span className="param-help" aria-label="Help">?</span>
          </Tooltip>
        )}
      </label>
      <div className="param-control">
        <input
          type="number"
          className="param-input mono"
          value={props.value === null || props.value === undefined || !Number.isFinite(props.value) ? "" : props.value}
          step={props.step ?? 1}
          {...(props.min !== undefined ? { min: props.min } : {})}
          {...(props.max !== undefined ? { max: props.max } : {})}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = raw === "" ? Number.NaN : parseFloat(raw);
            props.onChange(parsed);
          }}
        />
        {props.unit && <span className="param-unit mono">{props.unit}</span>}
        {props.randomizable && (
          <button
            type="button"
            className={`param-randomize ${props.randomized ? "on" : ""}`}
            onClick={props.onToggleRandomize}
            aria-pressed={props.randomized}
          >
            🎲
          </button>
        )}
      </div>
    </div>
  );
}
