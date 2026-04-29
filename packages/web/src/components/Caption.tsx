import type { ExperimentStatus } from "../orchestrator/useExperiment.js";

export const CAPTIONS = {
  ucurve: {
    running: "Each point is a sweep value; the band tightens as more runs land. The sweet spot will become obvious before the cliff does.",
    complete: "A clean U-curve. Below the optimum, the team is starved — workers idle when items block. Above it, multitasking tax dominates and lead time blows up. The sweet spot is broader than most teams assume — that's the manager's permission to experiment.",
  },
  cfd: {
    running: "A representative run animates as the sim plays out. Watch the bands try to stay parallel — that's stable flow.",
    complete: "The bands are roughly parallel — items move through the board at a steady rate. If WIP were too high, the In Progress band would swell and lag behind Done. If WIP were too low, Done would crawl. This is what stable flow looks like.",
  },
  histogram: {
    running: "Every completed item across all runs lands in this distribution. The tail will keep growing — long tails are real.",
    complete: "The distribution is right-skewed (as real cycle times always are). When you tell a stakeholder \"lead time is N days,\" you're describing the median — but 1 in 20 items takes much longer. That tail is what teams need to plan around, not the mean.",
  },
  timeAccounting: {
    running: "Worker-hours accumulate per cell. The contrast between optimal and overloaded sharpens as runs land.",
    complete: "At higher WIP the team works less on actual items — the rest evaporates into context-switching and blocked-waiting. This is the multitasking tax made visible. Idle time goes down at high WIP not because work is getting done, but because workers are always juggling something.",
  },
};

export function Caption({ kind, status }: { kind: keyof typeof CAPTIONS; status: ExperimentStatus }) {
  const isRunning = status === "running";
  return <span>{isRunning ? CAPTIONS[kind].running : CAPTIONS[kind].complete}</span>;
}
