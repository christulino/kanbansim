# KanbanSim — Session Handoff

**Last updated:** 2026-04-30 (after Plan 2 ship + extensive model + UI iteration)
**Status:** Live at https://christulino.github.io/kanbansim/ — public, MIT-licensed, auto-deployed on push to `main`. Engine model tuned to a state where the three preset scenarios produce clear pedagogical curves.

---

## Where we are

**Plan 2 (web UI) shipped.** All 42 tasks complete; 56+ commits on `main`. Site is live on GitHub Pages and auto-redeploys via `.github/workflows/deploy.yml` on every push to `main`. 119 tests pass across engine (68), web (50), and cli (1).

The simulator is fully functional end-to-end:
- Visit `/`, see the Sweet Spot ambient run start streaming a U-curve in the hero.
- Click a preset card or "Build your own experiment →" to configure.
- Configure across four tabs (Team / Work / Board / Monte Carlo) with `?` tooltips and per-parameter Randomize toggles.
- Run, watch four streaming charts populate, cancel mid-run if you want, copy the share URL, download charts (PNG/SVG) and raw results (CSV/JSON).

---

## What changed since Plan 2 first shipped

The original Plan 2 produced a working app, but the model and visualizations needed multiple rounds of refinement based on live use. Key iterations:

### Engine model (load-bearing — affects every output)

1. **Parallel time-slicing replaced single-item-per-tick.** Original model picked one item per worker per tick (round-robin); new model spreads useful hours across all unblocked active items per day. Matches how overloaded knowledge workers actually work. See `packages/engine/src/multitasking.ts` and `tick.ts`.

2. **switch_cost is the only multitasking tax.** `pace_penalty` was double-taxing alongside switch_cost. Removed entirely from `ExperimentConfig`. New formula: `useful_per_day = max(0, productive_hours - (N_progressing - 1) × switch_cost_hours)`, then split per item.

3. **Block events charge switch_cost.** When a dependency goes red, the worker loses one switch_cost worth of context-load time. `tick.ts` step 2 collects `blocksByWorker` and `applyAction` deducts via `extraDisruptionHours`.

4. **Default `block_probability_per_day`: 0.04 → 0.10.** A 7-day item now blocks at least once with ~52% probability (was 25%) — matches "real teams get blocked often" intuition.

5. **Ready column dropped.** Four columns: Backlog → In Progress → Validation → Done. Items get a new `arrived: boolean` flag; pre-arrival items are hidden from CFD and pull policy. Backlog count is now meaningful (live queue, not phantom future arrivals).

### Visualizations (the four panels)

1. **U-curve (panel 1):** dual annotations ("shortest lead time ≈ N", "most items completed ≈ N") that track their data points, not fixed y. Hover snaps to nearest sweep cell, shows lead time median + p5–p95, items completed mean, items arrived, items unfinished. Y-axes auto-anchor near data, not at zero.

2. **Board Load (panel 2, replaced CFD):** stacked bar per sweep value showing avg items in each column (Backlog / IP / Validation / Done). Hover shows the full breakdown. "Highest of each:" peaks strip below the legend.

3. **Lead Time Distribution (panel 3):** box plot per sweep cell (p10/p25/median/p75/p90 whiskers + box + median line). Optimal cell highlighted in accent. Hover shows full stats + sample size.

4. **Time Accounting (panel 4):** stacked area across the sweep (Working / Switching / Blocked / Idle as fractions). Hover gives a vertical guideline + percentages at the nearest cell.

### Preset retune

All three scenarios use:
- Effort: μ=24h, σ=8h, skew=0.5
- Validation: 0.3 × dev (fraction mode)
- Arrival: 1.0/day (mildly above team capacity at the optimum)
- Block prob: 0.10/day, μ=4h block duration
- Default runs: 100

Sweet Spot sweeps `wip_in_progress` 1→50 (was 1→15). QA Bottleneck sweeps `wip_validation` 1→8. Multitasking Tax sweeps `switch_cost_minutes` 0→60 at WIP=20.

---

## Architecture as it stands now

```
kanbansim/
├── README.md                      # public-facing intro
├── LICENSE                        # MIT
├── .github/workflows/deploy.yml   # auto-deploy to GH Pages on push to main
├── package.json                   # pnpm workspace root, packageManager pnpm@9
├── packages/
│   ├── engine/    # pure TS — types, prng, distributions, item, board, worker decisions, multitasking math, tick, runSimulation, metrics, sweep helpers
│   ├── cli/       # Node CLI runner (used for parity verification + overnight batches)
│   └── web/       # React + Vite — the deployed site
│       ├── src/
│       │   ├── orchestrator/  # seeds, aggregator, throttle, web-worker pool, useExperiment hook
│       │   ├── state/         # urlCodec (share-URL encoder), presets loader, randomization sampler, useConfigurator
│       │   ├── charts/        # UCurveChart, BoardLoadChart, HistogramChart (box plot), TimeAccountingChart
│       │   ├── components/    # Header, Stamp, Counter, ConfigStrip, ChartCard, Caption, ParameterInput, Tooltip, PresetCard, AmbientUCurve
│       │   ├── pages/         # Landing, Build (configurator), RunResults, Learn
│       │   └── styles/        # plain CSS with custom properties; Lab Mode dark via [data-theme="dark"]
│       ├── public/scenarios/  # JSON copies of the three presets
│       └── e2e/               # Playwright spec (config exists; never run live)
├── scenarios/                # source of truth for the three preset JSONs
└── docs/
    ├── HANDOFF.md            # this file
    ├── superpowers/specs/    # original design spec
    ├── superpowers/plans/    # Plan 1 (engine) + Plan 2 (web)
    └── visual-reference/     # results-mockup.html (Lab Notebook style guide)
```

---

## Decisions locked in (chronological)

- **Educational, open-source, standalone.** Audience: managers afraid to lower WIP. Primary lesson: Little's Law, sweet spot, cliffs.
- **5 → 4 columns.** Backlog → IP → Validation → Done. Item.arrived distinguishes pre-arrival from queued.
- **Parallel time-slicing engine.** All unblocked items get a daily share of productive hours.
- **switch_cost is the only multitasking tax.** No pace_penalty.
- **Block events disrupt.** One switch_cost per block, charged to the worker on that tick.
- **Items completed (count), not throughput rate.** Right axis of the U-curve is per-run completed items.
- **Lead time stays strict.** Completed items only. Survivor bias acknowledged; "items unfinished" surfaced via hover, not blended into the LT metric.
- **GitHub Pages deploy.** Public, free, auto-on-push. Subdomain: `christulino.github.io/kanbansim/`.
- **Repo: `christulino/kanbansim`.** Public, MIT licensed.

---

## Right Now

- User is iterating live on the deployed site, surfacing model and chart issues which we patch and re-deploy. Most recent: block disruption charge + 0.10/day default just shipped (`279ac64`).

## Next Up

1. **User browser walk-through.** The user is running real experiments and reporting quirks — that loop is the highest-leverage iteration channel right now.
2. **Playwright E2E run.** Spec exists at `packages/web/e2e/happy-path.spec.ts`; never executed against the deployed site. To run locally: `pnpm --filter @kanbansim/web e2e:install && pnpm --filter @kanbansim/web e2e`.
3. **Possible v1.5 features that came up but were deferred:**
   - Expose independent validation-effort distribution in the configurator UI (engine supports it; UI defaults to fraction mode).
   - Custom domain (e.g., `labs.christulino.com/kanbansim` or new project domain) — currently shipping at the GH Pages default URL.
   - Move "items unfinished" to its own panel (or back onto the U-curve in some form) if hover discoverability isn't enough.
   - Adjust Sweet Spot arrival rate to push the right-side cliff harder if it's still too gentle once the user has tested broadly.

## Blockers

None.

---

## How to verify state in a new session

```bash
cd /Users/chris/Documents/ai/kanbansim
git status                                   # clean on main
git log --oneline | head -5                  # most recent: 279ac64 feat(engine): block events charge a switch_cost
pnpm install                                 # idempotent
pnpm typecheck                               # exits 0 across all 3 packages
pnpm -r test                                 # 119 tests pass (68 engine + 50 web + 1 cli)
pnpm --filter @kanbansim/web build           # production build, ~165 KB gzipped
pnpm --filter @kanbansim/web dev             # local dev at http://localhost:5173/
```

To run a CLI sweep against any preset:

```bash
pnpm --filter @kanbansim/cli exec tsx packages/cli/src/index.ts \
  --config scenarios/sweet-spot.json --runs 100 --seed 1 \
  --out /tmp/results.json
```

Live site: https://christulino.github.io/kanbansim/ — refresh after pushing to `main` and the deploy workflow finishes (~3 min in Actions tab).

---

## Known issues / observations carried forward

1. **Survivor bias on lead time at over-capacity WIP.** At very high WIP, only items that arrived early enough to clear the queue make it into the completed sample. Median lead time can therefore look artificially low at extreme right of the sweep. Mitigation: items_unfinished surfaced in U-curve hover; the visual cue is "items completed shrinks while items unfinished grows."

2. **Single-worker teams complete zero items.** Peer-review rule blocks self-validation. Not user-facing — all presets use team_size=5. Document only.

3. **`completed_items.blocked_hours` is hardcoded to 0** and `validation_started_tick` is null. Fields exist on the type, tick processor doesn't populate them. No chart consumes them. Defer.

4. **Time-accounting tooltip + chart-tooltip CSS.** The hover line for time accounting works correctly; the U-curve, box plot, and Board Load tooltips all use `position: absolute` inside `.chart-host` (now `overflow: visible`). z-index is 1000.

5. **Worker pool partition.** Pool partitions jobs round-robin across workers; for small experiments this means the first worker gets one extra job. Acceptable.
