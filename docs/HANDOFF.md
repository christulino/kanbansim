# KanbanSim — Session Handoff

**Last updated:** 2026-05-04  
**Status:** On `main`, 28 commits ahead of origin (not yet pushed this session). Live site at https://christulino.github.io/kanbansim/ will update on push.

---

## Where we are

The simulator has been significantly simplified and sharpened for educational use and public release:

- **3-column model:** Backlog → In Progress → Done (validation column removed)
- **Weinberg multitasking formula:** `useful_time = 4/(K+3)`, replaces linear switch-cost model. Citable, asymptotic, empirically grounded (Weinberg, 1992)
- **Eager-worker replenishment:** workers always fill available WIP slots (FIFO, fewest-assigned wins). Models "managers reward being busy" behavior that the simulation teaches against
- **Three scenarios:** Sweet Spot (WIP sweep 1→50), Arrival Pressure (arrival rate sweep 0.2→4.0), Multitasking Tax (WIP sweep 1→25 at 2/day)
- **107 tests passing** (58 engine + 49 web) with zero TypeScript errors
- **Code review passed** — PRNG docs corrected, dead fields removed, engine inline comments added for educational readers
- **Learn page** has Monte Carlo explanation + full simulation model reference with Weinberg citation

---

## What changed in the most recent session

### Engine simplification

1. **Removed validation column.** `ColumnId` is now `"backlog" | "in_progress" | "done"`. Deleted `board.ts`, `worker.ts`, `multitasking.ts`. The complex per-worker decision tree is replaced by a centralized FIFO replenishment loop in `tick.ts`.

2. **Weinberg multitasking model.** Replaced `(K-1) × switch_cost_hours` daily overhead with `4/(K+3)` productivity fraction. Switch cost minutes removed from config entirely. Formula matches Weinberg (1992) at K=1,2,5 and extrapolates hyperbolicly beyond K=5.

3. **Longer block durations.** `block_duration_dist.mu` changed from 4h → 12h (≈2 working days), matching realistic "waiting for a decision or dependency" blocks.

4. **Removed:** `validation_effort`, `wip_validation`, `blocking_response`, `worker_pick_policy`, `switch_cost_minutes`, `blocked_hours` (was always 0), `validation_started_tick`.

### Web changes

- Board tab: single "WIP Limit" slider (was two sliders)
- Team tab: no switch cost input
- Monte Carlo sweep options updated; arrival rate step is now 0.1
- Results nav: loads last experiment from `localStorage` (fixes "always empty" issue when clicking Results in nav)
- Preset cards updated for new scenarios
- Learn page: new Monte Carlo section + "Simulation model" reference section

### Scenarios

| Scenario | Sweep | Config |
|---|---|---|
| Sweet Spot | `board.wip_limit` 1→50 | 1.0/day, effort μ=31h |
| Arrival Pressure | `work.arrival_rate_per_day` 0.2→4.0 | fixed WIP=5 |
| Multitasking Tax | `board.wip_limit` 1→25 | 2.0/day, high demand |

---

## Architecture

```
kanbansim/
├── README.md                      # public-facing intro
├── LICENSE                        # MIT
├── .github/workflows/deploy.yml   # auto-deploy to GH Pages on push to main
├── packages/
│   ├── engine/    # pure TS — types, prng, distributions, item, events,
│   │              # tick (replenishment + Weinberg work phase), runSimulation,
│   │              # metrics, sweep helpers
│   ├── cli/       # Node CLI runner
│   └── web/       # React + Vite — the deployed site
│       ├── src/
│       │   ├── orchestrator/  # pool, aggregator, seeds, useExperiment hook
│       │   ├── state/         # urlCodec, presets, randomization, useConfigurator
│       │   ├── charts/        # UCurveChart, BoardLoadChart, HistogramChart, TimeAccountingChart
│       │   ├── components/    # Header, ConfigStrip, Caption, ParameterInput, PresetCard, etc.
│       │   └── pages/         # Landing, Build (configurator), RunResults, Learn
│       └── public/scenarios/  # JSON copies of the three presets (synced from /scenarios)
├── scenarios/                # source of truth for the three preset JSONs
└── docs/
    ├── HANDOFF.md            # this file
    └── superpowers/          # specs and implementation plans
```

**Key files for extenders:**
- `packages/engine/src/tick.ts` — the full tick loop with inline comments on each step
- `packages/engine/src/types.ts` — complete type definitions
- `packages/web/src/pages/Learn.tsx` — the educational reference (model rules + citations)

---

## Decisions

- **3-column model (dropped validation).** Simplifies the model and the code. Lesson about QA bottlenecks rephrased as "arrival pressure" scenario.
- **Weinberg 4/(K+3) instead of linear switch cost.** Citable, asymptotic, matches K=1/2/5 empirical data, teaches the non-linearity more honestly.
- **Eager workers.** Never refuse an open slot — models the "rewarded for busyness" behavior the tool teaches against.
- **MIT license, public repo.** `christulino/kanbansim`. Educational tool should be openly hackable.
- **GitHub Pages deploy.** Auto-deploys on push to `main` via Actions.

---

## Right Now

- All work committed to local `main`, not yet pushed to `origin`.
- Manual cleanup needed: `git branch -D claude/nifty-haibt-e00ab7` (feature branch that wasn't fully deleted due to worktree shell issue).

## Next Up

1. **Push to origin** — deploys to https://christulino.github.io/kanbansim/ (~3 min in Actions).
2. **Play with the new Weinberg curves** — the Sweet Spot and Multitasking Tax scenarios have different shapes than before; check they tell the right story.
3. **Add CLAUDE.md** to the repo root — useful for contributors and for AI sessions starting cold.
4. **Playwright E2E** — spec exists at `packages/web/e2e/happy-path.spec.ts`; update it for 3-column model and run against deployed site.

## Blockers

None.

---

## How to verify state in a new session

```bash
cd /Users/chris/Documents/ai/kanbansim
git status                               # clean on main, ahead of origin
git log --oneline | head -5
pnpm install                             # idempotent
pnpm --filter @kanbansim/engine test     # 58 tests pass
pnpm --filter @kanbansim/web test        # 49 pass, 1 skip
pnpm --filter @kanbansim/engine exec tsc --noEmit   # exit 0
pnpm --filter @kanbansim/web exec tsc --noEmit       # exit 0
pnpm --filter @kanbansim/web dev         # dev at http://localhost:5173
```

Live site: https://christulino.github.io/kanbansim/ — refresh after pushing to `main`.

---

## Known issues / observations

1. **Survivor bias on lead time at over-capacity WIP.** At very high WIP, only items that arrived early enough to complete make it into the sample — median lead time can look artificially low at the extreme right of the sweep. Mitigated by "items unfinished" in U-curve hover.

2. **Lead time shape.** Under the new Weinberg model, lead time at low WIP is high (workers idle when single items block), drops to a minimum at ≈1 item/person, then rises on the right driven by multitasking. Right-side rise is gentler than the old linear model — intentional per Weinberg's asymptotic formula.

3. **`totalTicks` in runSimulation.ts assumes `tick_size_hours = 1`.** Noted inline. Don't change `tick_size_hours` without updating the loop bound.
