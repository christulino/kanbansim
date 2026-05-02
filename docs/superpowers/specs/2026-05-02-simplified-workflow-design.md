# Simplified Workflow Design

**Date:** 2026-05-02  
**Branch:** `claude/nifty-haibt-e00ab7`  
**Status:** Approved — ready for implementation

---

## Problem

The current engine has a `validation` column with its own WIP limit, blocking-response modes, and per-tick worker decision logic that adds complexity without adding pedagogical value for the core lesson (WIP limit → throughput/lead-time trade-off). The pull/replenishment behavior is also opaque: items trickle into in_progress via individual per-tick worker decisions that don't match how real teams (or managers) think about starting work.

---

## Goal

Simplify to a three-column model (`backlog → in_progress → done`) with a clear, realistic replenishment rule driven by a behavioral premise: **workers are eager to start work and will fill available WIP slots as fast as they can**, because managers reward being "busy." This makes high-WIP behavior understandable and the sweep lesson legible.

---

## Column Model

| Before | After |
|--------|-------|
| backlog → in_progress → validation → done | backlog → in_progress → done |

`"validation"` is removed from `ColumnId`. Items move directly from `in_progress` to `done` when `effort_done_hours >= effort_required_hours`.

---

## Behavioral Premise

Workers are eager. They never pass up an open WIP slot. They give teammates equal opportunity (fairest worker wins the next slot). The simulation reveals the throughput cost of that eagerness as WIP climbs.

---

## Config Changes

### Remove
- `board.wip_validation` — only one WIP knob now
- `work.validation_effort` — no validation stage
- `team.blocking_response` — only meaningful behavior is "idle when WIP full and all items blocked"; modes collapse
- `team.worker_pick_policy` — replaced by fewest-assignments rule

### Rename
- `board.wip_in_progress` → `board.wip_limit`

### Add / Change
- `work.arrival_rate_per_day` slider step: 0.1 (was 1.0), range 0.1–10.0 — enables modeling under-loaded teams

### Keep
- `team.size`
- `team.productive_hours_per_day`
- `team.switch_cost_minutes`
- `work.arrival_rate_per_day` (value, Poisson sub-daily arrivals unchanged)
- `work.effort_dist`
- `work.block_probability_per_day`
- `work.block_duration_dist`
- `simulation.sim_days`
- `simulation.tick_size_hours`

---

## Item Model

- Remove `validation_effort_hours` field
- Total work for an item is `effort_required_hours` only
- Effort calibration: old scenarios had `effort_dist.mu ≈ 24h` dev + 30% validation ≈ 31h total. New `effort_dist.mu` should be adjusted to ~31h to preserve calibration (throughput numbers stay comparable to prior runs).
- All other item fields unchanged (`arrived`, `state`, `blocked_until_tick`, `author_worker_id`, `current_worker_id`, `done_tick`)

---

## Per-Tick Engine Loop

### Step 1 — Resolve due events
- `arrival` events: flip `item.arrived = true` (item becomes pullable)
- `unblock` events: flip `item.state = "in_column"`, clear `blocked_until_tick`

### Step 2 — Sample new blocks
- Only items in `in_progress` with `state === "in_column"` are candidates (validation gone)
- Mechanics unchanged: `block_probability_per_day / productive_hours_per_day × tick_size_hours` per item per tick

### Step 3 — Replenishment phase (new)
While `in_progress count < wip_limit` AND any arrived backlog item exists:
1. Find the worker with the fewest current assigned items (tie-break: lowest worker id)
2. Find the oldest arrived backlog item (lowest `arrival_tick`, then lowest `id`)
3. Pull it: set `item.column = "in_progress"`, assign `author_worker_id` and `current_worker_id` to that worker, add to `worker.active_item_ids`
4. Mark that pull as a switch event for that worker this tick (they pay switch cost)
5. Repeat until WIP full or backlog empty

### Step 4 — Work phase (new daily-amortized allocation)
For each worker:
- `K` = number of unblocked assigned items (`state === "in_column"` and `column === "in_progress"`)
- `pulls_today` = number of new items pulled by this worker in Step 3 this tick
- `switch_cost_hours` = `switch_cost_minutes / 60`
- `daily_useful_hours = productive_hours_per_day − (max(0, K − 1) + pulls_today) × switch_cost_hours`
  - Clamped to `[0, productive_hours_per_day]`
- `per_item_per_tick = daily_useful_hours / K / productive_hours_per_day × tick_size_hours`
- Add `per_item_per_tick` to `effort_done_hours` for every unblocked assigned item

**Rationale:** Workers minimize switches by chunking their day (one big block per item), so the tax is `(K-1)` transitions per day rather than per tick. Every unblocked assigned item gets touched every tick (proportional to its share of the day). Blocked items don't count toward K and get no progress.

**Time accounting per worker per tick:**
- `working` = `daily_useful_hours / productive_hours_per_day × tick_size_hours`  
- `switching` = `((K − 1 + pulls_today) × switch_cost_hours) / productive_hours_per_day × tick_size_hours`
- `blocked` = if K = 0 and worker has assigned items (all blocked)
- `idle` = if worker has no assigned items

### Step 5 — Detect completions
Items where `effort_done_hours >= effort_required_hours` and `column === "in_progress"`:
- Set `column = "done"`, `done_tick = currentTick`, `current_worker_id = null`
- Remove from `worker.active_item_ids`
- WIP slot is now free — Step 3 on the next tick will fill it

### Step 6 — Cleanup
- `worker.active_item_ids`: remove any items now in `done`

---

## Scenarios

All three scenarios updated:
- Drop `wip_validation`, `blocking_response`, `worker_pick_policy`, `validation_effort`
- Adjust `effort_dist.mu` to fold in old validation effort (~+30%)
- `multitasking-tax`: keep existing `switch_cost_minutes`; accept that the amortized-per-day model produces a milder tax — this is honest. Tune only if the U-curve disappears entirely after seeing real output.

---

## Web UI Changes

**Remove controls:**
- Validation WIP slider
- Blocking response dropdown
- Worker pick policy dropdown
- Validation effort fraction/distribution control

**Rename:**
- "WIP In Progress" → "WIP Limit"

**Arrival rate slider:**
- Step: 0.1 (was 1.0)
- Range: 0.1–10.0/day

**Board view:**
- Drop Validation column. Three columns: Backlog, In Progress, Done.

**CFD / stacked area:**
- Drop validation series. Three series: backlog, in_progress, done.

**Learn page / tooltips:**
- Scrub all references to validation, blocking response, worker pick policy.

**Time accounting chart:**
- No changes to semantics (working / switching / blocked / idle). Simpler dynamics, same chart.

---

## Dead Code to Remove

- `computeTickAllocation` in `multitasking.ts` (replaced by per-day amortization in tick.ts)
- `decideWorkerAction` in `worker.ts` and its full decision tree
- `findValidationCandidate`, `resolveBlockingResponse`, `canPullFromBacklog` helpers
- `swarm_unblock` action type and all branches
- `WorkerAction` type (worker.ts exports gone)
- Validation column references in `board.ts`
- `help_validate`, `start_new`, `swarm_unblock` branches in tick.ts/worker.ts

All removed via git — recoverable if needed.

---

## Tests

**Engine unit tests (new):**
- Replenishment respects `wip_limit` (never exceeds)
- FIFO pull order (oldest `arrival_tick` first)
- Fewest-assignments assignment rule
- Switch cost charged on pull
- Daily allocation math: K items → (K-1) switches per day, all items get progress
- Blocked items excluded from K and get no progress
- Completion frees WIP slot for next-tick replenishment

**Update existing tests:**
- Remove validation column assertions
- Remove blocking_response / worker_pick_policy test cases
- Update Playwright e2e: no validation slider, no validation column in board view, WIP limit renamed

---

## What Does Not Change

- Sub-daily Poisson arrivals and `arrived` flag mechanic
- Block mechanics (probability sampling, duration distribution, unblock events)
- PRNG and seeding
- Sweep machinery
- Lead time / throughput summary stats
- Build and CI infrastructure
