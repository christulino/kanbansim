# KanbanSim

> Browser-based Monte Carlo simulator for Kanban teams. Sweep WIP limits, run thousands of sims, see the U-curve.

**KanbanSim** is an open-source, browser-based simulator for managers and team leads who suspect their team is overloaded but don't know what WIP limit is right. Configure a virtual team that looks like yours, sweep your WIP limit across a range, run thousands of Monte Carlo simulations in your browser, and look at the curve. The sweet spot will be obvious. So will the cliffs.

The simulator is educational and open source. The engine is a deterministic, isomorphic TypeScript module — same config and seed produce bit-identical results in CLI and browser, so any URL is a complete reproduction. There's no backend, no login, no telemetry. The lesson is Little's Law made tangible: lead time grows linearly with WIP, throughput is bounded by team capacity, and multitasking has a real cost.

Built with TypeScript, React, Vite, Web Workers, and Observable Plot. Pure static site, deployable anywhere.

## What it does

- **Configure a virtual team:** size, productive hours per day, switch cost, pace penalty, blocking response policy.
- **Configure work:** arrival rate, effort distribution `(μ, σ, skew)`, validation effort, block probability and duration.
- **Configure the board:** five fixed columns (Backlog → Ready → In Progress → Validation → Done) with per-column WIP limits.
- **Sweep one variable** (WIP, switch cost, team size, etc.) across a range.
- **Run Monte Carlo:** N runs at every sweep value (default 100), in parallel via Web Workers.
- **Watch four charts stream live:** lead-time-and-throughput U-curve, board-load by sweep value, lead-time box plots per cell, time accounting across the sweep.
- **Cancel mid-run:** instantly halt all workers; partial results stay on screen.
- **Share by URL:** every URL contains the full experiment + master seed. Paste into a new tab and reproduce bit-for-bit.

## Quick start

```bash
# Requires Node 20+ and pnpm 9+
pnpm install
pnpm --filter @kanbansim/web dev      # dev server at http://localhost:5173
```

Build for production:

```bash
pnpm --filter @kanbansim/web build    # static output in packages/web/dist
```

Run a sweep from the CLI:

```bash
pnpm --filter @kanbansim/cli exec tsx src/index.ts \
  --config scenarios/sweet-spot.json \
  --runs 100 \
  --seed 1 \
  --out results.json
```

Run all tests:

```bash
pnpm -r test
```

## Repository layout

```
packages/
├── engine/      Pure isomorphic TypeScript — the simulation, no DOM, no I/O
├── cli/         Node CLI runner; uses the engine directly
└── web/         React + Vite + Observable Plot — the deployable site
scenarios/       Three preset experiments (Sweet Spot, QA Bottleneck, Multitasking Tax)
docs/            Design spec and implementation plans
```

## Engine model

Five fixed columns; hourly lockstep ticks; generalist team with peer-review validation rule. Each tick, every worker spreads productive hours across all unblocked active items they're carrying — `pace_factor × tick_hours / N_unblocked` per item, where `pace_factor` accounts for context overhead from the total carry. Switch cost is charged once per pull. Blocked items still occupy a worker's attention but get no progress. Items move between columns when their effort is reached, subject to destination WIP. Full details in `docs/superpowers/specs/`.

## Determinism

All randomness flows through a `mulberry32` PRNG seeded by a 64-bit value per run. Each run's seed is derived from a master seed via `master ^ (cellIndex * 0x9e3779b97f4a7c15) ^ (runIndex * 0xbf58476d1ce4e5b9)`, so a CLI run and a browser run with the same master seed produce bit-identical results. The share URL encodes the full config plus the master seed, so a recipient reproduces the exact experiment.

## License

MIT. See [LICENSE](LICENSE).
