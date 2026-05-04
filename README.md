# KanbanSim

> Browser-based Monte Carlo simulator for Kanban teams. Sweep WIP limits, run thousands of sims, see the U-curve.

**KanbanSim** is an open-source, browser-based simulator for managers and team leads who suspect their team is overloaded but don't know what WIP limit is right. Configure a virtual team that looks like yours, sweep your WIP limit across a range, run thousands of Monte Carlo simulations in your browser, and look at the curve. The sweet spot will be obvious. So will the cliffs.

The simulator is educational and open source. The engine is a deterministic, isomorphic TypeScript module — same config and seed produce bit-identical results in CLI and browser, so any URL is a complete reproduction. There's no backend, no login, no telemetry. The lesson is Little's Law made tangible: lead time grows with WIP, throughput is bounded by team capacity, and multitasking has a real cost.

Built with TypeScript, React, Vite, and Web Workers. Pure static site, deployable anywhere.

## What it does

- **Configure a virtual team:** size and productive hours per day.
- **Configure work:** arrival rate, effort distribution `(μ, σ, skew)`, block probability and duration.
- **Configure the board:** one WIP limit caps the In Progress column. Three columns total: Backlog → In Progress → Done.
- **Sweep one variable** (WIP limit, arrival rate, team size, etc.) across a range.
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
└── web/         React + Vite — the deployable site
scenarios/       Three preset experiments (Sweet Spot, Arrival Pressure, Multitasking Tax)
docs/            Design specs and implementation plans
```

## Engine model

Three fixed columns (Backlog → In Progress → Done); hourly ticks; generalist team with eager-pull replenishment. Each tick, arrived backlog items fill open WIP slots FIFO — the worker with the fewest active items gets each new slot. A worker with K unblocked items retains `4 / (K + 3)` of their productive capacity per day (Weinberg, 1992 — *Quality Software Management*): K=1 → 100%, K=2 → 80%, K=5 → 50%, asymptotically → 0%. That fraction is split equally across the K unblocked items. Blocked items sit idle, still occupying their WIP slot. Full details in `packages/web/src/pages/Learn.tsx` and `docs/superpowers/specs/`.

## Determinism

All randomness flows through a `mulberry32` PRNG seeded by a 64-bit value per run. Each run's seed is derived from a master seed via `master ^ (cellIndex * 0x9e3779b97f4a7c15) ^ (runIndex * 0xbf58476d1ce4e5b9)`, so a CLI run and a browser run with the same master seed produce bit-identical results. The share URL encodes the full config plus the master seed, so a recipient reproduces the exact experiment.

## License

MIT. See [LICENSE](LICENSE).
