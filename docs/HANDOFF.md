# KanbanSim — Session Handoff

**Last updated:** 2026-04-29 (after Plan 1 ship)
**Status:** Plan 1 complete on `main`. Plan 2 (web UI) is the next plan to write and execute.

---

## Where we are

**Plan 1 (engine + CLI) shipped.** All 33 tasks complete, 25+ commits squashed onto `main` via fast-forward merge from `feat/engine-mvp`. 57 tests passing across the engine and CLI packages. The simulator is fully functional from the command line — the user can run any of the three preset scenarios (or any custom scenario JSON) and produce reproducible Monte Carlo results.

**Plan 2 (web UI) has not started.** It will build the deployable static site on top of the Plan 1 engine. Estimated 40–50 tasks: Vite + React scaffold, Web Worker orchestrator, streaming aggregator with cancel, tabbed configurator, run/results page with 4 hero charts (Observable Plot + raw SVG marginalia), landing page + 3 preset cards, downloads + share URL, learn page, lab mode toggle, Playwright E2E, GitHub Pages / Netlify deploy.

---

## Source of truth — read these in order to re-orient

1. **Design spec** — [docs/superpowers/specs/2026-04-28-kanbansim-design.md](superpowers/specs/2026-04-28-kanbansim-design.md). Covers the full v1/MVP including everything Plan 2 still needs to build (sections 3, 4, 8, 11). Read sections 3 (User Journey) and 8 (Visualization Plan) carefully — they are the spec for the web UI.
2. **Plan 1 (executed)** — [docs/superpowers/plans/2026-04-28-kanbansim-engine-mvp.md](superpowers/plans/2026-04-28-kanbansim-engine-mvp.md). Shows the conventions used for plan execution under `superpowers:subagent-driven-development`. Plan 2 should follow the same structure (TDD pairs, exact file paths, exact commit messages, single-commit-per-task discipline).
3. **Visual reference** — [docs/visual-reference/results-mockup.html](visual-reference/results-mockup.html). The Lab Notebook style for the working surfaces (Run / Results pages). This is the reference Plan 2's chart styling and typography must match. Open it in a browser to see it; resize for the mobile-correct breakpoints.

---

## Repo layout (current)

```
kanbansim/
├── package.json                    # pnpm workspace root, type: module, packageManager pnpm@9.0.0
├── pnpm-workspace.yaml             # packages: ["packages/*"]
├── pnpm-lock.yaml
├── tsconfig.base.json              # strict TS, ES2022, Bundler resolution, noUncheckedIndexedAccess, etc.
├── .nvmrc                          # 20
├── .gitignore                      # node_modules, dist, .vite, .superpowers/, etc.
├── packages/
│   ├── engine/                     # Pure isomorphic TS — the simulation
│   │   ├── package.json            # @kanbansim/engine
│   │   ├── src/                    # 12 files: types, prng, distributions, item, board, worker,
│   │   │                           #          multitasking, events, tick, metrics, runSimulation, index
│   │   └── test/                   # 11 test files + 3 fixtures (determinism, sanity_edges, regression_baseline)
│   └── cli/                        # Node CLI runner
│       ├── package.json            # @kanbansim/cli
│       ├── src/                    # index.ts (entry), sweep.ts (setAtPath, generateSweepValues)
│       └── test/                   # cli.test.ts (smoke test using execFileSync)
├── scenarios/                      # 3 preset configs (sweet-spot, qa-bottleneck, multitasking-tax)
└── docs/
    ├── HANDOFF.md                  # this file
    ├── superpowers/
    │   ├── specs/                  # Design spec
    │   └── plans/                  # Plan 1 (engine MVP)
    └── visual-reference/           # results-mockup.html
```

---

## How to verify the state quickly in a new session

```bash
cd /Users/chris/Documents/ai/kanbansim
git status                          # should be clean on main
git log --oneline | head -5         # most recent commit: 4acd915 test(cli): smoke test
pnpm install                        # idempotent
pnpm typecheck                      # both packages exit 0
pnpm test                           # 57 tests pass (56 engine + 1 cli)
```

To run a preset:

```bash
pnpm --filter @kanbansim/cli exec tsx src/index.ts \
  --config ../../scenarios/sweet-spot.json --runs 1000 \
  --out /tmp/sweet-spot-1k.json --seed 1
```

---

## Decisions already locked (don't relitigate)

These came out of long brainstorming Q&A and are recorded in the spec. Any of them changing should be a deliberate scope change, not a drift.

- **Scope:** Educational, open-source, standalone (not a FlowOS feature). Audience: managers afraid to lower WIP. Primary lesson: Little's Law / WIP-limit U-curve.
- **Engine model:** 5 columns (Backlog → Ready → In Progress → Validation → Done). Hourly lockstep ticks, all workers act in parallel. Generalist team with peer-review validation rule (a worker cannot validate their own item).
- **Multitasking math:** explicit `switch_cost` paid per actual switch, plus a multiplicative `pace_penalty` that scales with N active items. Floor at 0.1 to prevent negatives.
- **Pull policy:** worker may pull only if their load is *not strictly the highest* on the team. Single-worker special case: always allowed (no peers to compare).
- **Determinism:** mulberry32 PRNG seeded by `bigint`. Same config + same seed → bit-identical results. The share-URL feature depends on this. Guarded by `test/portability.test.ts`.
- **Tech stack for Plan 2:** TypeScript + React + Vite + Observable Plot + plain CSS (custom properties, no Tailwind) + react-router-dom. Web Workers for orchestration. State via React's built-in primitives (no Redux/Zustand for MVP).
- **React perf for streaming:** raw run-results in `useRef` (mutable), aggregator updates throttled to 10–20Hz, charts redraw from aggregator state. Critical at 10K runs.
- **Visual style:** Direction D (hybrid). Landing = Quiet Scientific. Working surfaces (configurator, run, results) = Lab Notebook. Typography: Fraunces (serif), Inter (sans), JetBrains Mono (mono), Caveat (handwriting). Every numeric value on screen is in monospace.
- **Charts:** 4 MVP charts — U-curve hero (lead time + throughput vs sweep, dual axis, confidence bands), CFD (single-run animated stacked area), lead time histogram, time accounting (stacked bars).
- **Run UX:** `/run` and `/results` are the same page in different states. Streaming chart updates, ambient animated CFD during run, real Cancel via `worker.terminate()`. Stamp flips Running → Run Complete.

---

## Known issues / observations from Task 33 (not blockers)

1. **Sweet Spot scenario shows only the bottom of the U-curve.** With arrival rate 4/day and team capacity ~2.3/day, the system is permanently saturated — multitasking tax can't push throughput below the saturation floor. Throughput plateaus at WIP≥6 instead of dropping at high WIP. **Possible fix:** lower `arrival_rate_per_day` to 3, or increase `pace_penalty` to 0.10. Easier to iterate after the chart UI exists. Defer to Plan 2 design or v1.5.
2. **Round-robin worker pick is buggy for N≥3 active items.** `pickItemRoundRobin` returns "first non-last-chosen item," which oscillates between the first 2 items and never reaches the 3rd until one of the first two completes. Real round-robin would cycle through all N. Doesn't affect Plan 1's preset scenarios meaningfully (their dynamics are dominated by other factors), but worth fixing in v1.5 as part of better multitasking modeling.
3. **Single-worker team can't validate items** (peer-review rule blocks self-validation). The `wip_one_single_worker` sanity fixture passes vacuously (items_completed=0 is allowed). Not user-facing — all 3 presets have team_size=5. Document but don't fix unless a single-worker scenario becomes important.
4. **`completed_items.blocked_hours` is hardcoded to 0** (and `validation_started_tick` to null). The fields exist in the type but aren't populated yet. Would need item-level event tracking added to the tick processor. Defer until a v1.5 chart needs them.
5. **Git committer identity** is auto-derived from `Christopher Tulino <chris@Christophers-MacBook-Air.local>`. If the user wants commits authored as `christulino@gmail.com`, they should run `git config user.name` / `git config user.email` in the project. Not blocking.

---

## What the next session should do

**The user wants Plan 2 written and executed so the website is functional and they can change variables and run experiments interactively.**

Suggested approach:

1. Re-orient: read [docs/superpowers/specs/](superpowers/specs/) §3 (User Journey), §4 (Visual Style), §8 (Visualization Plan), §10 (Feature Breakdown — MVP scope only).
2. Open [docs/visual-reference/results-mockup.html](visual-reference/results-mockup.html) in a browser.
3. Invoke `superpowers:writing-plans` and produce **Plan 2: web UI** at `docs/superpowers/plans/YYYY-MM-DD-kanbansim-web-mvp.md`. Same task structure as Plan 1 (TDD pairs where they apply, exact file paths, exact commit messages, single-commit-per-task discipline).
4. Phases (suggested decomposition):
   - **Phase A:** Scaffold `packages/web/` — Vite + React + TS + react-router-dom + Observable Plot + plain CSS. Routing skeleton (/, /build, /run, /results, /learn). Theme tokens (Lab Mode toggle).
   - **Phase B:** Web Worker orchestrator — wraps `engine.runSimulation` in a Worker. Spawns N workers (default `navigator.hardwareConcurrency`, capped at 8). Streaming results aggregator with `useRef` + throttled state updates. Cancel via `worker.terminate()`.
   - **Phase C:** Configurator (`/build`) — tabbed page (Team / Work / Board / Monte Carlo). All parameter inputs. URL-encoded state. Run button.
   - **Phase D:** Run/Results page — shared layout, stamp + counter + ETA, 4 charts (U-curve hero, CFD, histogram, time accounting). Streaming chart updates. Cancel button. Action bar (download, share, edit, run new).
   - **Phase E:** Landing (`/`) — Quiet Scientific style, hero + 3 preset cards, ambient CFD.
   - **Phase F:** Downloads + share — PNG/SVG per chart, CSV/JSON for raw results, copy share URL.
   - **Phase G:** Learn page (`/learn`) — Kanban concepts reference. Lab Mode toggle wired up with localStorage.
   - **Phase H:** Playwright E2E — happy path (visit landing → run preset → see U-curve → cancel → download). Vite production build config. GitHub Pages or Netlify deploy config.
5. Execute Plan 2 via `superpowers:subagent-driven-development` on a new feature branch (e.g., `feat/web-mvp`). Same review discipline: full reviews for substantive React/UI work; inline trivials for pure scaffolding.

**Open product decision** the user may want to weigh in on before Plan 2:
- The `sweet-spot.json` arrival rate (currently 4/day → only shows bottom half of U-curve). Lower to 3/day before Plan 2 starts so the landing-page auto-run experience produces the full U-curve out of the box? Or address inside Plan 2 once the chart UI is live.
