# KanbanSim — Design Spec

**Date:** 2026-04-28
**Status:** v1 / MVP scope
**Owner:** Chris Tulino

---

## 1. Overview

KanbanSim is an open-source, browser-based simulator that lets a manager *see, in five minutes,* what would happen to their team's lead time and throughput if they lowered (or raised) their WIP limits — across thousands of plausible alternate realities.

**The argument the product makes:** *"You don't have to guess whether lowering WIP will help your team. Configure a virtual team that looks like yours, sweep WIP across a range, run 10,000 simulations, and look at the curve. The sweet spot will be obvious. So will the cliffs."*

It is a static website, no login, no backend; the simulation runs entirely in the user's browser via Web Workers. Source-of-truth for shareable experiments is a URL that encodes the full configuration plus the seed (deterministic engine → bit-identical reproduction).

## 2. Audience and Lessons

**Target visitor profile:** A manager, team lead, or agile coach who has read or heard of Kanban, recognizes that their team is overloaded, and is *afraid to lower WIP because they don't know what the right number is.*

**Primary lesson:** Little's Law made tangible — there is a sweet spot for WIP, with cliffs on both sides. Below it, the team is starved; above it, multitasking tax dominates.

**Secondary lessons** (demonstrable via different scenarios):
- Multitasking is a tax — switching costs are real and compound with N items.
- Variability + WIP interact violently — high variance in item size combined with high WIP produces unpredictability.
- Per-column WIP imbalance creates handoff bottlenecks (the "QA backlog" phenomenon).
- High arrival rate vs. team capacity collapses nonlinearly.

The site does not push the manager toward any specific WIP number. It gives them a tool to find their own answer for their own team.

## 3. User Journey

Four surfaces. State is URL-encoded continuously so the URL bar is the share link.

### 3.1 Landing (`/`) — Quiet Scientific style

- Hero: short framing of the problem and the proposition. ~400 words max, skim-friendly.
- One inline animated CFD as ambient hero illustration.
- **Three preset experiment cards** (the front door):
  1. *The Sweet Spot* — runs by default on landing (auto-streams U-curve within ~2 sec).
  2. *The QA Bottleneck* — click-to-run.
  3. *The Multitasking Tax* — click-to-run.
- One link: **"Build your own experiment →"** to the configurator.

### 3.2 Configurator (`/build`) — Lab Notebook style

Tabbed single-page (not a multi-step wizard):

1. **Team** — size, productive hours/day, switch cost (min), pace penalty (%/extra-item).
2. **Work** — arrival rate (Poisson), item-effort distribution `(μ, σ, skewness)`, block probability, block-duration distribution.
3. **Board** — 5 fixed columns (Backlog → Ready → In Progress → Validation → Done). Per-column WIP limits configurable on Ready, In Progress, and Validation (or "unlimited"). Worker blocking-response policy: `wait` / `start_new` / `help_validate` / `swarm_unblock`.
4. **Monte Carlo** — list of every parameter from the previous tabs with a "Randomize this" toggle. When toggled, the parameter is sampled per-run from a `(μ, σ, skewness)` triplet replacing the fixed value. Plus: number of runs (slider 100 → 10,000), and the variable to *sweep* (e.g., `wip_in_progress: 1 → 15 in steps of 1`).

Persistent "Run Experiment" button top-right. Configurator state is URL-encoded continuously.

### 3.3 Run (`/run`) — Lab Notebook style

The run view and the results view are **the same page in different states.** No jarring transition between them; the page animates from sparse-and-streaming to complete as the last run lands.

#### Layout (identical to results)

- Same header.
- Same title block, but the stamp reads **"Running · 1,247 / 10,000"** with a soft pulse animation, instead of "Run Complete."
- Same configuration strip — locked (parameters cannot be changed mid-run).
- Same four chart cards, full-width, stacked vertically.
- Persistent **Cancel** button floating top-right of the page header.

#### What each chart does during the run

**Hero U-curve chart**
- t=0: empty axis frame, no data points.
- t≈0.5s: scattered points appear at each WIP value as runs land — sample size per WIP cell grows independently.
- t≈2s: ~1,000 runs across cells; the U-curve shape is visibly forming.
- t≈5–10s: confidence bands appear as semi-transparent fills, *tightening* as variance shrinks per cell.
- The "optimal WIP ≈ N" hand-drawn annotation only appears once ≥50% of runs are done. We don't display annotations on noisy data — wrong claims are worse than no claims.

**CFD (single representative run)**
- Plays continuously as an animation — one full 6-month simulation animates across ~8 seconds wall-clock, then loops with a fresh representative run sampled from the in-flight result stream.
- This is the **ambient motion** that signals "the engine is running" without a spinner.
- After all runs complete: the animation pauses on the median-throughput run at the optimal WIP value.

**Lead-time histogram**
- Bars grow vertically as more completed-item lead times accumulate.
- Stat row (Median / Mean / P85 / P95 / Max) updates live, settling visibly as the distribution fills out.
- Subtitle initially shows "Sample size: 247 items" and updates with the count.

**Time-accounting bars**
- Each row needs runs at its specific WIP value (optimal vs. overloaded). Until at least ~50 runs have landed at that cell, the row shows "Filling..." with a faint progress fill.
- Once data is sufficient, the row reveals its proportions and animates from gray to colored segments.

#### Counter and ETA

Below the title block, in mono:

```
1,247 / 10,000 runs · ~38 sec remaining · 4 workers · 326 runs/sec
```

The runs/sec rate stabilizes within the first ~2 seconds and is what the ETA is calculated from. Slower machines show longer ETAs naturally; no calibration required.

#### Action bar (bottom)

- **During run**: download / share / "Edit experiment" buttons are visible but dimmed (disabled). Right-side primary CTA shows nothing — Cancel is the only action.
- **Once complete**: stamp flips from "Running" to "Run Complete," all action buttons enable, primary CTA becomes "Run a New One →"

#### Cancel behavior

- Click → `worker.terminate()` on every Web Worker, instant halt. No zombies.
- Stamp flips to **"Cancelled · 1,247 / 10,000"** in warning color (terracotta).
- Charts retain partial data; the user can still download what they have, copy the share URL, or run a new experiment.
- No re-confirm dialog — the user explicitly clicked Cancel; respect their input.

#### What we deliberately do not show

- No traditional spinner or loading bar competing with chart updates — the streaming chart animations *are* the progress indicator.
- No "step-by-step debugger" view of a single simulation. (That's a candidate v1.5 "Inspect a single run" feature.)
- No intermediate "computing aggregates…" states. The aggregator update is throttled to 10–20Hz so the eye sees smooth chart motion, not flicker.
- No micro-interactions that distract from the chart updates (hover effects on disabled buttons, decorative animations, etc.). The data is the show.

### 3.4 Results (`/results`) — same page as Run, completed state

The `/results` URL is the same view as `/run` after the last run lands or after Cancel. The differences are state-driven:

- **Stamp** reads "Run Complete · 10,000 / 10,000" (or "Cancelled · 1,247 / 10,000" if cancelled).
- **All action buttons enabled**:
  - Download per chart: PNG and SVG.
  - "Download raw results (CSV / JSON)" — single export of the full result set.
  - "Copy share link" — copies a URL containing the full config + master seed, reproducing the experiment bit-for-bit on the recipient's machine.
  - "Edit experiment" — returns to `/build` with current config preloaded.
  - Primary CTA: "Run a New One →"
- **Each chart's caption** updates from running-state text to a one-paragraph "What this is showing you" written for a manager, not a statistician (see §8 for chart-specific captions).
- **CFD animation** stops on the median-throughput representative run at the optimal sweep cell.

Routing detail: when the user lands on `/run`, the page stays at `/run` until the last run completes; on completion the URL updates to `/results?...` (same query params) without a navigation event, so the back button still returns to `/build`. A user pasting a `/results?...` URL with a complete run-id triggers a fresh re-run from the seed (the URL is the experiment, not the result data — results are not server-stored in v1).

### 3.5 Cross-cutting

- `?` icons on every parameter pop tooltips with 2-sentence explanations.
- Persistent **Learn** link in header → longer-form Kanban concepts page.
- **Lab Mode (dark theme)** toggle in header.

## 4. Visual Style

**Direction D: Hybrid.**

- **Landing page**: Quiet Scientific. Off-white background, generous whitespace, restrained palette, Tufte-clean charts, minimal ornament.
- **Working surfaces** (configurator, run, results): Lab Notebook. Faint engineering-paper grid background, cream paper-toned cards, hand-drawn-feel marginalia (handwritten annotations, slightly tilted "Run Complete" stamp).

**Locked design tokens** (validated via mockup iterations stored in `.superpowers/brainstorm/`):

| Element | Spec |
|---|---|
| Headline serif | Fraunces (warm, slightly weird) |
| UI sans | Inter |
| Mono | JetBrains Mono — used for **all numeric values, parameter names, run counts**. Anything quantitative is mono. |
| Hand-feel | Caveat — used sparingly for marginalia |
| Light bg | Warm off-white `#FAF6EC`; paper card `#F4EEDC` |
| Dark bg ("Lab Mode") | Deep ink, warm cream text |
| Accent | Deep teal `#1F6F6B` |
| Warning | Terracotta `#C44834` |
| Chart palette | Categorical: teal / terracotta / ochre / slate / mauve. Confidence bands = 15% opacity fills of series hue. Direct labeling on series where possible (no legend hunt). |
| Motion | Used only when it conveys information. CFD animates because it *is* a time series. Bars/points fade in as runs land — that *is* the Monte Carlo arriving. No decorative motion. |

The unifying rule: *every number on screen is in monospace.* That single rule does enormous work for the "scientific" vibe. Words wear serif or sans; numbers wear mono.

The mobile-correct mockup at [docs/visual-reference/results-mockup.html](docs/visual-reference/results-mockup.html) is the reference for working-surface implementation.

## 5. Simulation Engine Model

### 5.1 Board

Five columns, fixed:

```
Backlog → Ready → In Progress → Validation → Done
```

- **Backlog**: unlimited; new items land here on arrival.
- **Ready**: optional WIP limit (`null` = unlimited). Holds groomed items waiting to be pulled. Items don't have "active work" performed here.
- **In Progress**: optional WIP limit. Items being worked. Can become blocked.
- **Validation**: optional WIP limit. Items being reviewed/tested. Can become blocked.
- **Done**: unlimited.

WIP limits are *per-column* (team-level constraints), not per-worker.

### 5.2 Workers

Generalist team. Every worker can perform any role.

**Peer-review rule:** A worker cannot validate an item they themselves authored. Any *other* worker can pull it into Validation.

**Pull policy** (used for Ready → In Progress, and any pull from Ready or Validation):
A worker may pull an item if (a) the destination column WIP allows it AND (b) the worker's current item-load is *not strictly the highest* on the team. Loads of [2, 2, 3] → both workers at 2 can pull; the worker at 3 cannot.

### 5.3 Time and Tick Mechanics

**Hourly lockstep ticks across the whole team.** All workers share the same simulated clock; a block fired at hour T is visible to every worker's hour T+1 decision.

**Per-tick processing order:**
1. **Resolve due events** — unblocks fire, scheduled arrivals enter Backlog/Ready.
2. **Sample new blocks** — each active In-Progress or Validation item rolls against `block_probability_per_hour` (= daily probability ÷ working hours). If blocked, schedule an unblock at sampled future hour drawn from a duration distribution.
3. **For each worker, in randomized order** (random shuffle per tick to avoid persistent ordering bias):
   - Examine current state (own active items, board state, last hour's chosen item).
   - Decide this hour's action via the worker decision tree (§5.4).
   - Apply one hour of work to the chosen item with adjustments (§5.5).
4. **Detect completions** — any item where `effort_done ≥ effort_required` moves to the next column (subject to destination WIP).
5. **Snapshot metrics** — tick-level state for CFD and time-accounting charts.

**Working day:** simulation runs only during productive hours per day (default 6). Default sim window: 6 working months ≈ 130 working days × 6 hrs = 780 ticks per run.

### 5.4 Worker Decision Tree

Each tick, the worker evaluates in order:

1. **If I have an active (unblocked) item I can keep working on**, choose one of my active items per the *worker pick policy*. Default: round-robin (least-recently-touched). Continue or switch.
2. **If all my items are blocked**, behavior follows the `blocking_response` parameter:
   - `wait` — sit idle until at least one of my items unblocks.
   - `start_new` — pull a fresh item from Ready (if column WIP and pull-policy allow). I'm now juggling more items.
   - `help_validate` — pick up an item in Validation (that isn't my own) and contribute progress.
   - `swarm_unblock` — contribute to the resolution of someone *else's* blocker (modeled as: contributing progress to the blocker's resolution timer).
3. **If I have no items and Ready has work**, pull from Ready (subject to column WIP and pull policy).
4. **If In Progress is at column WIP but Validation has non-mine items I can pull**, pull a Validation item.
5. **If everything is full or unavailable**, idle.
6. **Item complete in In Progress**: push to Validation if Validation WIP allows. If Validation is full, the *item blocks the worker* — they cannot pull more InProgress work. (This is the QA-bottleneck phenomenon.)

### 5.5 Multitasking Math

Per worker per tick, with the chosen item this hour:

- **Switch cost**: if the chosen item differs from last tick's chosen item, this hour's effective work time is reduced by `switch_cost` (default 0.25 h ≈ 15 min). First tick after pulling a brand-new item also pays the cost.
- **Pace penalty**: a general slowdown when juggling many items: `pace_factor = 1 - pace_penalty × (N - 1)`, where N = total active items the worker has (default penalty 0.05). Floor at 0.1 to avoid pathological negatives.

**Effective work this hour** = `(1 - switch_cost_if_switched) × pace_factor`.

This is added to `effort_done` for the chosen item. Items not worked on this tick gain no progress.

### 5.6 Item Lifecycle and Distributions

- **Arrival**: Poisson process at rate `arrival_rate_per_day`. Inter-arrival times pre-sampled at run start; arrivals fire at scheduled hours.
- **Effort**: drawn at item creation from a distribution parameterized by `(μ, σ, skewness)`. Default distribution: log-normal (positive, right-skewed; matches reality). Author of the item is noted (for peer-review rule).
- **Block probability**: per active item per hour. If it fires, item enters `blocked` state and `block_duration` is sampled from `(μ, σ, skewness)` log-normal. Unblock event scheduled for `now + block_duration` hours. Worker remains "owner" of the item but cannot progress it while blocked.
- **Validation effort**: drawn at the moment the item enters Validation. Source is configurable: either an independent `validation_effort_dist (μ, σ, skewness)` or `validation_effort_fraction × item.dev_effort` (default mode: fraction = 0.3, so a 10-hour dev item has a 3-hour validation effort, drawn deterministically from the item's own properties).
- **Done items**: lead time recorded as `done_time - arrival_time` (in working hours, converted to days for display).

### 5.7 Determinism

- A single 64-bit `seed` is supplied per run.
- Engine constructs a seeded PRNG (`mulberry32`) at run start.
- All random draws (arrivals, effort, blocks, durations, worker shuffle order, item pick under round-robin tie) flow through this PRNG.
- **Same config + same seed → bit-identical run result.** Tested via fixture #1.
- For Monte Carlo: each run gets a deterministic seed derived from a master seed (e.g., `master_seed XOR run_index`), so the entire experiment is reproducible from a single master seed in the share URL.

## 6. Experiment and Parameter Model

### 6.1 Experiment Definition

An experiment is a configuration object containing:

- **Team parameters**: `team_size`, `productive_hours_per_day`, `switch_cost_minutes`, `pace_penalty`, `worker_pick_policy` (default: round-robin), `blocking_response` (one of `wait` / `start_new` / `help_validate` / `swarm_unblock`).
- **Work parameters**: `arrival_rate_per_day`, `effort_dist` `(μ, σ, skewness)`, validation effort source (either `validation_effort_dist (μ, σ, skewness)` or `validation_effort_fraction` of dev effort; default mode is fraction = 0.3), `block_probability_per_day`, `block_duration_dist`.
- **Board parameters**: `wip_ready` (nullable int), `wip_in_progress`, `wip_validation`.
- **Simulation parameters**: `sim_days` (default 130 working days = 6 months), `tick_size_hours` (default 1).
- **Monte Carlo parameters**: `runs` (default 1,000), `master_seed`, `sweep_variable` (variable name + range + step), `randomized_variables` (list of `{ name, μ, σ, skewness }`).

### 6.2 Randomization

- Randomization is per-run: each run draws fresh values for any "randomized" variables before simulating.
- Default distribution for positive parameters: log-normal `(μ, σ, skewness)`.
- For probabilities: skew-normal truncated to [0, 1].
- For integer parameters (e.g., team_size sampled): round to nearest integer; clamp to ≥ 1.

### 6.3 Sweep

- One variable can be marked "sweep this" with a `(min, max, step)` range.
- Each sweep value is treated as a separate experimental cell; `runs` runs are performed at each value.
- Result aggregation reports per-cell statistics (mean, percentiles, confidence band).

### 6.4 Output

Per run, the engine returns:
- Per-completed-item: `{ id, arrival_tick, done_tick, lead_time_hours, blocked_hours, validation_started_tick }`.
- Per-tick CFD snapshot: column counts.
- Per-worker time accounting: total hours `working` / `switching` / `blocked` / `idle`.
- Summary stats: `{ throughput_per_day, median_lead_time, p85, p95, max }`.

Per Monte Carlo experiment, the orchestrator aggregates across runs: per-sweep-cell distributions and confidence bands.

## 7. Architecture (A\*)

Concentric, with strict purity at the core.

```
kanbansim/                                   # pnpm workspace root
├── packages/
│   ├── engine/      # pure isomorphic TS — the simulation
│   ├── web/         # React + Vite + Observable Plot — the deployed site
│   ├── cli/         # Node CLI runner
│   └── shared/      # types, distribution helpers (used by engine + web + cli)
├── scenarios/       # preset configs as JSON (3 presets + 3 test fixtures)
├── docs/superpowers/specs/   # this spec
└── .superpowers/    # brainstorm artifacts (gitignored)
```

### 7.1 Engine purity rules (load-bearing)

The engine must obey:

1. No environment-specific imports (no `worker_threads`, `fs`, `self.postMessage`, no DOM, no `window`).
2. No global state. PRNG is constructed inside `runSimulation()` from the config's seed.
3. No I/O. No `fetch`, no `console.log` (or use injected logger).
4. No wall-clock time. No `Date.now()`.
5. Plain JSON-serializable config in, plain JSON-serializable result out.
6. Deterministic given seed.

These rules are enforced by:
- `engine/package.json` declares no Node-only dependencies.
- A test (`engine/test/portability.test.ts`) imports the engine and runs it in pure Node — must produce identical results to the browser run of the same config + seed.
- The CLI (`packages/cli`) imports the engine directly with no shim — if it works there, the engine is portable.

### 7.2 Engine API

```typescript
// Single-run API (synchronous, deterministic)
runSimulation(config: ExperimentConfig, seed: bigint): RunResult

// Streaming run-events API (for live progress within a run)
*streamSimulation(config, seed): Generator<TickEvent>
```

`runSimulation` calls `streamSimulation` and accumulates. Both are pure; both work in Node and in browser.

### 7.3 Browser orchestration

- The web app spawns N Web Workers (default `navigator.hardwareConcurrency`, capped at 8).
- Each worker imports the engine module and accepts `{ config, runs: [seed1, seed2, ...] }` over `postMessage`.
- Workers post back `{ runIndex, summary }` per completed run; main thread aggregates incrementally.
- **Cancel**: main thread calls `worker.terminate()` on every worker → instant halt, no zombies. Partial aggregated results stay on screen.

### 7.4 Streaming aggregation in React (perf-critical)

To avoid re-render storms at 10K runs:

- Raw run-results live in a `useRef` (mutable; doesn't trigger re-renders).
- An *aggregator* is updated on each result (rolling per-sweep-cell stats: mean, percentiles).
- `setState` is called only with aggregator snapshots, throttled to 10–20 Hz.
- Charts redraw from the aggregator state.

This pattern is baked into the orchestration layer from day one. (Naive "set state per result" works at 100 runs and falls over above.)

### 7.5 Node CLI

```bash
node packages/cli/run.js --config experiment.json --runs 10000 --out results.json
```

Used for: overnight batch experiments, CI smoke tests, validating engine determinism cross-environment, debugging without a browser. Imports the engine directly; no Worker, no streaming UI — single-threaded loop.

## 8. Visualization Plan

Four MVP charts, all full-width, stacked vertically on the Results page. Configuration metadata sits in a horizontal strip above the charts.

### 8.1 Hero — Lead Time + Throughput vs. Sweep Variable

Dual-axis line chart with confidence bands. Sweep variable on X. Lead time on left Y; throughput on right Y. Annotations: a sweet-spot highlight band, "optimal ≈ N" note, and a "cliff →" note where applicable. Caption explains the U-curve.

This is the screenshot people share.

### 8.2 CFD — Cumulative Flow Diagram (single representative run)

Stacked area chart of items in each column over time. Iconic Kanban chart. One representative run sampled from the result set (default: median-throughput run at the optimal sweep value). Caption explains what stable flow looks like vs. what bottlenecks look like.

### 8.3 Lead Time Distribution Histogram

Histogram of all completed-item lead times across all runs at the optimal sweep value. Stat row: median, mean, P85, P95, max. Caption emphasizes that the median is a comfortable story; the tail is the truth.

### 8.4 Time Accounting

Stacked horizontal bars showing % of total worker-hours spent `Working` / `Switching` / `Blocked` / `Idle`, for two configs side-by-side: optimal sweep value vs. a deliberately-overloaded value (e.g., 2.5× optimal). Caption explicitly calls out the multitasking tax: "at WIP=N your team works half as much on actual items."

### 8.5 Library

**Observable Plot** for the four data-driven charts. **Raw SVG** layered on top for marginalia (handwritten annotations, the rotated "Run Complete" stamp, "← optimal ≈ N" hand-arrows).

## 9. Tech Stack (Locked)

| Layer | Choice |
|---|---|
| Language | TypeScript strict |
| UI framework | React 18+ |
| Build | Vite |
| Monorepo | pnpm workspaces |
| Charts | Observable Plot + raw SVG marginalia |
| Styling | Plain CSS + custom properties (no Tailwind) |
| State | React `useState`/`useReducer`/Context (no external state lib for MVP) |
| Routing | `react-router-dom` |
| PRNG | `mulberry32` (in-tree, no dep) |
| Tests | Vitest (engine + unit), Playwright (E2E) |
| Deploy | Static site — GitHub Pages or Netlify |

**Bundle target:** under 250 KB gzipped for the deployed site.

## 10. Feature Breakdown

### MVP (this spec)

Engine, configurator, monte carlo runner with streaming + cancel, 4 hero charts, 3 presets, lab-mode toggle, share URLs, downloads, learn page.

### v1.5 (next)

- Compare two configs side-by-side mode.
- Throughput run chart, WIP-over-time chart, per-column heatmap.
- Parameter sensitivity / tornado chart.
- Import CSV of cycle times → autoconfig (the "your team in particular" feature).
- More preset scenarios (8–12 total).
- Multi-stage worker specialization (developer / validator / generalist roles).

### v2+

- Saved/named experiments with optional backend.
- Cross-experiment compare and library.
- Multi-team simulation with handoffs.
- Server-side compute mode for very large sweeps.
- Worker skill differences, learning curves.

### Explicitly cut from MVP

- Worker role specialization.
- Compare-two-configs mode.
- Sub-hourly ticks.
- Account / login / saved experiments.
- Real Jira/Linear API integration.
- Mobile-first or PWA features (responsive only).

## 11. Scenarios

### 11.1 Front-door presets (user-facing, on landing page)

| Preset | Parameters | Lesson |
|---|---|---|
| **The Sweet Spot** *(auto-runs on landing)* | Team=5, productive_hrs=6, switch_cost=15min, pace_penalty=5%, arrival=4/day, effort μ=8h σ=3.5h skew=+1.2, block_prob=0.04/day. Sweep In-Progress WIP from 1→15. 10K runs. | Little's Law made visible — there is a sweet spot, and there are cliffs. |
| **The QA Bottleneck** | Same team. In-Progress WIP=8, Validation WIP swept 1→6. 10K runs. | Per-column WIP must be balanced; bottlenecks form at the lowest-capacity column. |
| **The Multitasking Tax** | Team=5, In-Progress WIP=15 (deliberately too high). Sweep `switch_cost` from 0 → 60 min. 10K runs. | Multitasking has a real cost; "give them more in flight" slows everything down once switching is realistic. |

Each preset's results page leads with a manager-targeted "What you just saw" caption and a fork-and-modify link to the configurator.

### 11.2 Test fixtures (dev-only, in `engine/test/fixtures/`)

| # | Fixture | Asserts |
|---|---|---|
| 1 | **`determinism`** | Same config + same seed produces bit-identical results across two runs. Validates the share-URL feature works. |
| 2 | **`sanity_edges`** | WIP=1, WIP=∞, team=1, arrivals=0 do not crash, do not hang, terminate cleanly. |
| 3 | **`regression_baseline`** | One "moderate everything" config has recorded median lead time and throughput. Baseline is updated only deliberately; unintended drift fails the test. |

Plus implicit cross-runtime fixture: the **CLI must produce identical results to the browser** for the same config + seed. Validates engine portability.

## 12. Out-of-Scope / Open Questions Tracked Forward

- **Engine event/message protocol detail.** Folded into §7.2 and §7.3 at a high level. Concrete protocol shape (event names, payload schemas) will be defined during implementation; no open question that blocks the spec.
- **Landing page mockup.** Not produced as a separate visual artifact; the Quiet Scientific direction described in §4 is sufficient guidance. If the landing page diverges materially in implementation, we'll mock it before merging.
- **Logo / final brand name.** "KanbanSim" is the working name. Renaming is a search-and-replace; not a structural decision. Defer until v1 ships.
- **Accessibility.** Charts will be SVG (screen-reader-targetable); interactive elements will follow standard React a11y patterns. Full WCAG audit is v1.5+.
- **Performance instrumentation.** A simple `performance.mark` log of run time per worker is helpful and cheap; included in MVP.

---

## Acceptance criteria for "MVP shipped"

- The site loads on `kanban-sim.org` (or chosen domain) as a static site.
- Visiting the landing page auto-runs The Sweet Spot preset; the U-curve is visible within ~2 seconds and complete within ~30 seconds on a modern laptop.
- Each of the three presets runs end-to-end without error.
- The configurator round-trips: every parameter shown can be changed, the URL updates, copying the URL and pasting in a fresh tab reproduces the configuration.
- Cancel during an in-flight experiment halts all workers and leaves partial results on screen.
- Downloads work for PNG (per chart), SVG (per chart), and CSV/JSON (raw run results).
- The Node CLI runs `runSimulation` against a preset config and produces a JSON output whose summary stats match the browser run for the same seed (within rounding).
- All Vitest tests pass (the three fixtures + any unit tests written along the way).
- Site is responsive down to phone-portrait widths (no overflow, no broken layouts).
- Lab Mode (dark theme) toggle works; preference is remembered in localStorage.
