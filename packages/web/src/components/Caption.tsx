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
    running: "Each box is one sweep value. The middle line is the median lead time; the box covers the middle 50% of finished items; the whiskers go to the 10th and 90th percentiles. Watch the boxes settle and the whiskers stretch.",
    complete: "Lower medians and tighter boxes are healthier teams. As multitasking grows, the box gets taller (variance grows) and shifts up (median gets worse). Real-world teams live in the boxes — what you tell stakeholders is the median, but what they remember is the p90.",
  },
  timeAccounting: {
    running: "The working band is the team's actual output. Watch it shrink and the switching/blocked bands swell as you sweep into overload.",
    complete: "At low WIP, idle dominates — the team is starved. At the sweet spot, working dominates. Past it, switching and blocked eat the day. This is the multitasking tax made visible across the whole sweep, not just two arbitrary points.",
  },
};

export function Caption({ kind, status }: { kind: keyof typeof CAPTIONS; status: ExperimentStatus }) {
  const isRunning = status === "running";
  return <span>{isRunning ? CAPTIONS[kind].running : CAPTIONS[kind].complete}</span>;
}
