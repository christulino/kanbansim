import type { ExperimentStatus } from "../orchestrator/useExperiment.js";

export const CAPTIONS = {
  ucurve: {
    running: "Lead time on the left axis (terracotta line). Right axis stacks two bands: items completed (teal, bottom) and items unfinished (terracotta-shaded, top). Together they sum to items arrived. As the bands settle, the curves get sharper.",
    complete: "Read three signals together. The lead-time line shows how fast finished items moved (strict definition — completed only). The teal band is what the team got through. The terracotta band on top is wasted potential — work that arrived but never finished. At low WIP the team is starved; at high WIP the multitasking tax shrinks the teal band even as items keep arriving.",
  },
  cfd: {
    running: "Each bar is one sweep value. Heights reveal how items distribute across the board on average. As more runs land, the bars settle.",
    complete: "Read the bars left-to-right: at low WIP, Backlog and Ready dominate (team is starved waiting on a tiny in-flight pool). Around the sweet spot, the In Progress / Validation bands stay short — work flows. At high WIP, In Progress swells and Done gets there slower — multitasking tax in column form.",
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
