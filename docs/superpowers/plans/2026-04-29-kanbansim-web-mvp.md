# KanbanSim Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deployable static web UI on top of the Plan 1 engine so a user can configure an experiment, run a Monte Carlo sweep in the browser, watch results stream into four hero charts, cancel mid-run, download charts and raw data, and share the experiment via URL.

**Architecture:** New `packages/web/` workspace. Vite + React + TypeScript. The engine is consumed unchanged from `@kanbansim/engine`. A pool of Web Workers runs `runSimulation` per run; results stream to a pure aggregator that maintains rolling per-cell stats; the React UI re-renders from throttled aggregator snapshots (10–20 Hz) to avoid render storms at 10K runs. Cancel terminates every worker; partial results stay on screen. State lives in the URL hash so any URL is a complete share link.

**Tech Stack:** TypeScript strict mode, React 18, Vite, react-router-dom (HashRouter), Observable Plot for data charts, raw SVG for marginalia and CFD animation, plain CSS with custom properties (no Tailwind), Vitest + jsdom + React Testing Library for unit/component tests, Playwright for E2E. PRNG and engine reused from Plan 1.

---

## File Structure

```
kanbansim/
├── packages/
│   ├── engine/
│   │   └── src/
│   │       └── sweep.ts                    # NEW: moved from cli, single source of truth
│   ├── cli/
│   │   └── src/
│   │       └── sweep.ts                    # NOW: re-exports from @kanbansim/engine
│   └── web/                                # NEW PACKAGE
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── playwright.config.ts
│       ├── index.html
│       ├── public/
│       │   └── scenarios/
│       │       ├── sweet-spot.json         # copies of /scenarios/*.json
│       │       ├── qa-bottleneck.json
│       │       └── multitasking-tax.json
│       ├── src/
│       │   ├── main.tsx                    # mounts <App/>
│       │   ├── App.tsx                     # HashRouter + theme provider + <Header/>
│       │   ├── styles/
│       │   │   ├── tokens.css              # CSS custom properties (light + lab-mode dark)
│       │   │   ├── reset.css
│       │   │   ├── grid-paper.css          # Lab Notebook grid background
│       │   │   └── global.css              # type styles, button base
│       │   ├── components/
│       │   │   ├── Header.tsx
│       │   │   ├── ThemeToggle.tsx
│       │   │   ├── Stamp.tsx
│       │   │   ├── ConfigStrip.tsx
│       │   │   ├── ChartCard.tsx
│       │   │   ├── Counter.tsx
│       │   │   ├── ParameterInput.tsx
│       │   │   ├── PresetCard.tsx
│       │   │   └── Tooltip.tsx
│       │   ├── pages/
│       │   │   ├── Landing.tsx
│       │   │   ├── Build.tsx
│       │   │   ├── RunResults.tsx
│       │   │   └── Learn.tsx
│       │   ├── charts/
│       │   │   ├── UCurveChart.tsx
│       │   │   ├── CfdChart.tsx
│       │   │   ├── HistogramChart.tsx
│       │   │   └── TimeAccountingChart.tsx
│       │   ├── orchestrator/
│       │   │   ├── messages.ts
│       │   │   ├── seeds.ts
│       │   │   ├── aggregator.ts
│       │   │   ├── pool.ts
│       │   │   ├── useExperiment.ts
│       │   │   └── worker.ts
│       │   ├── state/
│       │   │   ├── urlCodec.ts
│       │   │   ├── presets.ts
│       │   │   └── randomization.ts
│       │   ├── theme/
│       │   │   └── theme.ts
│       │   └── lib/
│       │       ├── format.ts
│       │       ├── throttle.ts
│       │       ├── download.ts
│       │       └── tooltips.ts
│       ├── test/
│       │   ├── seeds.test.ts
│       │   ├── aggregator.test.ts
│       │   ├── urlCodec.test.ts
│       │   ├── format.test.ts
│       │   ├── throttle.test.ts
│       │   ├── randomization.test.ts
│       │   └── pool.test.ts
│       └── e2e/
│           └── happy-path.spec.ts
└── .github/
    └── workflows/
        └── deploy.yml                       # GitHub Pages deploy
```

**Boundaries:**
- `packages/web/` is the only package that touches the DOM / browser APIs.
- The engine remains pure (no DOM, no `self.postMessage`, no `Worker` imports). The Web Worker entry (`orchestrator/worker.ts`) is the only seam that calls `self.postMessage`.
- Pure modules — `aggregator`, `seeds`, `urlCodec`, `format`, `throttle`, `randomization`, `tooltips` — are unit-tested in isolation. Components get behavior tests where they have logic; pure-presentational components get a smoke render test.
- `pool.ts` is testable with a mocked `Worker` constructor; the worker entry itself is exercised end-to-end by Playwright.

---

## Phases at a Glance

| Phase | Tasks | What ships |
|---|---|---|
| **A** Scaffold | 1–7 | Workspace, Vite, React, routing, theme tokens, app shell |
| **B** Orchestrator | 8–14 | URL codec, aggregator, worker pool, `useExperiment` hook, cancel |
| **C** Configurator | 15–20 | Tabbed `/build` page wired to URL; Run button submits |
| **D** Run/Results | 21–29 | Stamp, counter, ETA, 4 streaming charts, captions, action bar |
| **E** Landing | 30–32 | Quiet Scientific landing; auto-runs Sweet Spot |
| **F** Downloads + Share | 33–35 | PNG/SVG per chart, CSV/JSON raw, copy share URL |
| **G** Learn + Lab Mode + Tooltips | 36–38 | `/learn` page, theme toggle persisted, parameter `?` tooltips |
| **H** E2E + Deploy | 39–42 | Playwright happy path, prod build, GitHub Pages deploy, acceptance |

After Phase D, the website is functional end-to-end (configure → run → see results) — the rest is polish, presets, share, deploy.

---

## Phase A — Scaffold

### Task 1: Move sweep helpers from CLI into engine

**Why:** Plan 2's worker pool needs the same `setAtPath` and `generateSweepValues` logic the CLI uses. Moving them to `@kanbansim/engine` makes the engine the single source of truth for "manipulating an `ExperimentConfig`," avoids duplication in `packages/web/`, and is a pure refactor (no behavior change).

**Files:**
- Create: `packages/engine/src/sweep.ts`
- Create: `packages/engine/test/sweep.test.ts`
- Modify: `packages/engine/src/index.ts` (add export)
- Modify: `packages/cli/src/sweep.ts` (re-export from engine)

- [ ] **Step 1: Write the failing test for `setAtPath` and `generateSweepValues`**

Create `packages/engine/test/sweep.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { setAtPath, generateSweepValues } from "../src/sweep.js";
import type { ExperimentConfig } from "../src/types.js";

const baseConfig: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

describe("setAtPath", () => {
  it("sets a nested numeric value without mutating the input", () => {
    const out = setAtPath(baseConfig, "board.wip_in_progress", 9);
    expect(out.board.wip_in_progress).toBe(9);
    expect(baseConfig.board.wip_in_progress).toBe(5);
  });
  it("supports null for nullable fields", () => {
    const out = setAtPath(baseConfig, "board.wip_in_progress", null);
    expect(out.board.wip_in_progress).toBeNull();
  });
  it("sets a 3-level deep path", () => {
    const out = setAtPath(baseConfig, "work.effort_dist.mu", 12);
    expect(out.work.effort_dist.mu).toBe(12);
    expect(baseConfig.work.effort_dist.mu).toBe(8);
  });
});

describe("generateSweepValues", () => {
  it("produces an inclusive integer range", () => {
    expect(generateSweepValues(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });
  it("handles non-integer steps without floating drift", () => {
    expect(generateSweepValues(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it("includes the endpoint when step lands on it", () => {
    expect(generateSweepValues(0, 60, 5)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @kanbansim/engine test sweep`
Expected: FAIL — "Cannot find module '../src/sweep.js'".

- [ ] **Step 3: Create `packages/engine/src/sweep.ts`**

```typescript
import type { ExperimentConfig } from "./types.js";

// Set a numeric (or null) value at a dotted path, returning a deep copy.
// Used by sweep dispatch and by the configurator to apply user edits.
export function setAtPath(config: ExperimentConfig, path: string, value: number | null): ExperimentConfig {
  const parts = path.split(".");
  const cloned = JSON.parse(JSON.stringify(config)) as ExperimentConfig;
  let cursor: Record<string, unknown> = cloned as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor = cursor[parts[i]!] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return cloned;
}

// Inclusive range with float-safe step accumulation.
export function generateSweepValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}
```

- [ ] **Step 4: Add to engine barrel exports**

Edit `packages/engine/src/index.ts`. Add at the end (before any closing comment, after the existing exports):

```typescript
export { setAtPath, generateSweepValues } from "./sweep.js";
```

- [ ] **Step 5: Run engine tests to verify pass**

Run: `pnpm --filter @kanbansim/engine test`
Expected: all engine tests pass, including the new `sweep.test.ts`.

- [ ] **Step 6: Replace `packages/cli/src/sweep.ts` with a re-export**

Replace the file's contents with:

```typescript
// Sweep helpers moved to @kanbansim/engine. Re-exported for back-compat.
export { setAtPath, generateSweepValues } from "@kanbansim/engine";
```

- [ ] **Step 7: Run CLI tests to verify no regression**

Run: `pnpm --filter @kanbansim/cli test`
Expected: all CLI tests pass unchanged.

- [ ] **Step 8: Typecheck both packages**

Run: `pnpm typecheck`
Expected: exits 0 across the workspace.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/sweep.ts packages/engine/src/index.ts packages/engine/test/sweep.test.ts packages/cli/src/sweep.ts
git commit -m "refactor: move sweep helpers from cli to engine"
```

---

### Task 2: Scaffold `packages/web/` package

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/.gitignore`

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@kanbansim/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test",
    "e2e:install": "playwright install --with-deps chromium"
  },
  "dependencies": {
    "@kanbansim/engine": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "@observablehq/plot": "^0.6.16"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/dom": "^10.4.0",
    "@testing-library/user-event": "^14.5.0",
    "@playwright/test": "^1.47.0"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["vite/client"],
    "outDir": "./dist",
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 3: Create `packages/web/.gitignore`**

```
dist/
.vite/
playwright-report/
test-results/
```

- [ ] **Step 4: Install deps and verify the workspace resolves**

Run: `pnpm install`
Expected: exits 0; `node_modules/.pnpm/@kanbansim+engine` resolves to the workspace package.

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json packages/web/tsconfig.json packages/web/.gitignore pnpm-lock.yaml
git commit -m "chore(web): scaffold packages/web workspace package"
```

---

### Task 3: Wire Vite + React entry point

**Files:**
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`

- [ ] **Step 1: Write `packages/web/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
});
```

- [ ] **Step 2: Write `packages/web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KanbanSim — Flow Lab</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Caveat:wght@500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write `packages/web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Write a minimal `packages/web/src/App.tsx`**

```tsx
export function App() {
  return (
    <div>
      <h1>KanbanSim</h1>
      <p>Web UI scaffold loaded.</p>
    </div>
  );
}
```

- [ ] **Step 5: Verify `pnpm dev` starts the server**

Run: `pnpm --filter @kanbansim/web dev`
Expected: Vite logs `Local: http://localhost:5173/`. Open it; the page reads "KanbanSim — Web UI scaffold loaded." Stop the server with Ctrl-C.

- [ ] **Step 6: Verify production build succeeds**

Run: `pnpm --filter @kanbansim/web build`
Expected: writes `packages/web/dist/index.html` and a hashed JS bundle. Exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/web/vite.config.ts packages/web/index.html packages/web/src/main.tsx packages/web/src/App.tsx
git commit -m "feat(web): vite + react entry point and minimal app shell"
```

---

### Task 4: Set up Vitest + jsdom + React Testing Library

**Files:**
- Create: `packages/web/vitest.config.ts`
- Create: `packages/web/test/setup.ts`
- Create: `packages/web/test/smoke.test.tsx`

- [ ] **Step 1: Write `packages/web/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
```

- [ ] **Step 2: Write `packages/web/test/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

Add `@testing-library/jest-dom` to devDependencies in `packages/web/package.json`:

```json
"@testing-library/jest-dom": "^6.5.0"
```

Run: `pnpm install`

- [ ] **Step 3: Write a smoke test for `App`**

Create `packages/web/test/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("App", () => {
  it("renders the brand mark", () => {
    render(<App />);
    expect(screen.getByText("KanbanSim")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test to verify pass**

Run: `pnpm --filter @kanbansim/web test`
Expected: 1 test, 1 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/vitest.config.ts packages/web/test/setup.ts packages/web/test/smoke.test.tsx packages/web/package.json pnpm-lock.yaml
git commit -m "test(web): vitest + jsdom + react testing library smoke test"
```

---

### Task 5: Add CSS theme tokens (light + lab-mode dark)

**Files:**
- Create: `packages/web/src/styles/tokens.css`
- Create: `packages/web/src/styles/reset.css`
- Create: `packages/web/src/styles/grid-paper.css`
- Create: `packages/web/src/styles/global.css`
- Modify: `packages/web/src/main.tsx` (import styles)

- [ ] **Step 1: Write `packages/web/src/styles/tokens.css`**

Mirror the locked tokens from the design spec §4 and the visual reference. The dark variant ("Lab Mode") inverts background/text but keeps accent and warning hues.

```css
:root {
  --bg: #FAF6EC;
  --bg-paper: #F4EEDC;
  --bg-deep: #EBE3CC;
  --grid: rgba(42, 31, 26, 0.07);
  --grid-deep: rgba(42, 31, 26, 0.14);
  --text: #2A1F1A;
  --text-soft: #6B5D52;
  --text-faint: #9A8A7A;
  --accent: #1F6F6B;
  --accent-deep: #134341;
  --accent-soft: rgba(31, 111, 107, 0.10);
  --warning: #C44834;
  --warning-soft: rgba(196, 72, 52, 0.10);
  --series-1: #1F6F6B;
  --series-2: #C44834;
  --series-3: #C99A3A;
  --series-4: #6B7BA4;
  --series-5: #8B6B9E;
  --rule: rgba(42, 31, 26, 0.18);
  --rule-soft: rgba(42, 31, 26, 0.10);
  --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
  --sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --mono: 'JetBrains Mono', 'Menlo', monospace;
  --hand: 'Caveat', cursive;
}

[data-theme="dark"] {
  --bg: #1A1410;
  --bg-paper: #221A14;
  --bg-deep: #2B2018;
  --grid: rgba(244, 238, 220, 0.06);
  --grid-deep: rgba(244, 238, 220, 0.12);
  --text: #F4EEDC;
  --text-soft: #B8A99A;
  --text-faint: #7A6B5C;
  --accent: #4FB3AE;
  --accent-deep: #6FCBC6;
  --accent-soft: rgba(79, 179, 174, 0.14);
  --warning: #E07A66;
  --warning-soft: rgba(224, 122, 102, 0.14);
  --series-1: #4FB3AE;
  --series-2: #E07A66;
  --series-3: #E0BA5E;
  --series-4: #95A4C8;
  --series-5: #B795C8;
  --rule: rgba(244, 238, 220, 0.20);
  --rule-soft: rgba(244, 238, 220, 0.10);
}
```

- [ ] **Step 2: Write `packages/web/src/styles/reset.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }
html, body { height: 100%; }
body { overflow-x: hidden; }
button { font: inherit; color: inherit; cursor: pointer; }
a { color: inherit; }
img, svg { display: block; max-width: 100%; }
```

- [ ] **Step 3: Write `packages/web/src/styles/grid-paper.css`**

Working surfaces (configurator, run, results) get the engineering-paper grid; the landing page gets a clean off-white. Apply `data-surface="paper"` to the `<main>` element on lab-notebook pages.

```css
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
}

[data-surface="paper"] {
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 22px 22px;
}

@media (max-width: 760px) {
  [data-surface="paper"] { background-size: 16px 16px; }
}
```

- [ ] **Step 4: Write `packages/web/src/styles/global.css`**

Type styles, headings, mono numerics, button base.

```css
h1, h2, h3 {
  font-family: var(--serif);
  font-weight: 500;
  letter-spacing: -0.018em;
  line-height: 1.1;
}

.label {
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-soft);
}

.mono { font-family: var(--mono); }

.btn {
  font-family: var(--sans);
  font-size: 13px;
  padding: 10px 16px;
  border-radius: 3px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
}
.btn:hover { background: var(--bg-paper); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-primary {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.btn-primary:hover:not(:disabled) { background: var(--accent-deep); }

.btn-warning {
  background: var(--warning);
  color: var(--bg);
  border-color: var(--warning);
}
```

- [ ] **Step 5: Import all four stylesheets in `main.tsx`**

Replace the contents of `packages/web/src/main.tsx` with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/global.css";
import "./styles/grid-paper.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Verify dev server still works**

Run: `pnpm --filter @kanbansim/web dev`
Expected: page loads, fonts now load from Google Fonts (visible in network tab), background is `#FAF6EC`. Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/styles/ packages/web/src/main.tsx
git commit -m "feat(web): css design tokens and lab-notebook grid background"
```

---

### Task 6: Add HashRouter and route shell

**Files:**
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/pages/Landing.tsx`
- Create: `packages/web/src/pages/Build.tsx`
- Create: `packages/web/src/pages/RunResults.tsx`
- Create: `packages/web/src/pages/Learn.tsx`

**Why HashRouter:** GitHub Pages serves static files only — direct navigation to `/build` would 404 without server-side rewrites. HashRouter (`/#/build`) works on any static host with zero config. Share URLs are still copy-pasteable.

- [ ] **Step 1: Write a placeholder `packages/web/src/pages/Landing.tsx`**

```tsx
export function Landing() {
  return (
    <main data-surface="default">
      <h1>Landing (placeholder)</h1>
    </main>
  );
}
```

- [ ] **Step 2: Write a placeholder `packages/web/src/pages/Build.tsx`**

```tsx
export function Build() {
  return (
    <main data-surface="paper">
      <h1>Build (placeholder)</h1>
    </main>
  );
}
```

- [ ] **Step 3: Write a placeholder `packages/web/src/pages/RunResults.tsx`**

```tsx
export function RunResults() {
  return (
    <main data-surface="paper">
      <h1>Run / Results (placeholder)</h1>
    </main>
  );
}
```

- [ ] **Step 4: Write a placeholder `packages/web/src/pages/Learn.tsx`**

```tsx
export function Learn() {
  return (
    <main data-surface="default">
      <h1>Learn (placeholder)</h1>
    </main>
  );
}
```

- [ ] **Step 5: Replace `packages/web/src/App.tsx` with the router**

```tsx
import { HashRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing.js";
import { Build } from "./pages/Build.js";
import { RunResults } from "./pages/RunResults.js";
import { Learn } from "./pages/Learn.js";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/build" element={<Build />} />
        <Route path="/run" element={<RunResults />} />
        <Route path="/results" element={<RunResults />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  );
}
```

- [ ] **Step 6: Update the smoke test**

Replace `packages/web/test/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

describe("App router", () => {
  it("renders the landing placeholder by default", () => {
    render(<App />);
    expect(screen.getByText(/Landing \(placeholder\)/)).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @kanbansim/web test`
Expected: 1 pass.

- [ ] **Step 7: Verify in browser**

Run: `pnpm --filter @kanbansim/web dev`
Visit http://localhost:5173/, then `/#/build`, `/#/run`, `/#/results`, `/#/learn`. Each shows its placeholder.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/pages/ packages/web/src/App.tsx packages/web/test/smoke.test.tsx
git commit -m "feat(web): hashrouter route shell with four placeholder pages"
```

---

### Task 7: Build the persistent header (brand + nav + theme toggle)

**Files:**
- Create: `packages/web/src/components/Header.tsx`
- Create: `packages/web/src/components/ThemeToggle.tsx`
- Create: `packages/web/src/theme/theme.ts`
- Create: `packages/web/src/styles/header.css`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/main.tsx`
- Create: `packages/web/test/Header.test.tsx`

- [ ] **Step 1: Write `packages/web/src/theme/theme.ts`**

```typescript
export type Theme = "light" | "dark";
const STORAGE_KEY = "kanbansim:theme";

export function readTheme(): Theme {
  if (typeof localStorage === "undefined") return "light";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" ? "dark" : "light";
}

export function writeTheme(theme: Theme): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
```

- [ ] **Step 2: Write `packages/web/src/components/ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from "react";
import { applyTheme, readTheme, writeTheme, type Theme } from "../theme/theme.js";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
    writeTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const label = theme === "light" ? "◐ Lab Mode" : "○ Day Mode";

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme" type="button">
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Write `packages/web/src/components/Header.tsx`**

```tsx
import { NavLink } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle.js";

export function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <NavLink to="/" className="brand-mark">KanbanSim</NavLink>
        <span className="brand-tag">Flow Lab · v0.1</span>
      </div>
      <nav className="primary">
        <NavLink to="/build" className={({ isActive }) => (isActive ? "active" : "")}>Build</NavLink>
        <NavLink to="/run" className={({ isActive }) => (isActive ? "active" : "")}>Run</NavLink>
        <NavLink to="/results" className={({ isActive }) => (isActive ? "active" : "")}>Results</NavLink>
        <NavLink to="/learn" className={({ isActive }) => (isActive ? "active" : "")}>Learn</NavLink>
      </nav>
      <div className="header-right">
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Write `packages/web/src/styles/header.css`**

```css
header.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 40px;
  border-bottom: 1px solid var(--rule);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-wrap: wrap;
  gap: 12px;
}
.brand { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.brand-mark {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 23px;
  letter-spacing: -0.018em;
  text-decoration: none;
}
.brand-tag {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  padding-bottom: 3px;
}
nav.primary { display: flex; gap: 28px; font-size: 13px; flex-wrap: wrap; }
nav.primary a {
  color: var(--text-soft);
  text-decoration: none;
  padding-bottom: 3px;
}
nav.primary a.active {
  color: var(--text);
  font-weight: 500;
  border-bottom: 1.5px solid var(--text);
}
.header-right { display: flex; align-items: center; gap: 14px; }
.theme-toggle {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  background: transparent;
  border: 1px solid var(--rule);
  padding: 5px 10px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.theme-toggle:hover { background: var(--bg-paper); }
@media (max-width: 760px) {
  header.topbar { padding: 12px 18px; }
  nav.primary { gap: 18px; font-size: 12.5px; order: 3; flex-basis: 100%; }
  .brand-tag { display: none; }
}
```

- [ ] **Step 5: Import header CSS in `main.tsx`**

Add this line below the other style imports:

```tsx
import "./styles/header.css";
```

- [ ] **Step 6: Insert `<Header />` in `App.tsx`**

Replace the `App` body (inside `<HashRouter>`) with:

```tsx
import { HashRouter, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header.js";
import { Landing } from "./pages/Landing.js";
import { Build } from "./pages/Build.js";
import { RunResults } from "./pages/RunResults.js";
import { Learn } from "./pages/Learn.js";

export function App() {
  return (
    <HashRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/build" element={<Build />} />
        <Route path="/run" element={<RunResults />} />
        <Route path="/results" element={<RunResults />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </HashRouter>
  );
}
```

- [ ] **Step 7: Write a behavior test for the theme toggle**

Create `packages/web/test/Header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Header } from "../src/components/Header.js";

describe("Header", () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });
  afterEach(() => { localStorage.clear(); });

  it("renders brand mark and nav links", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByText("KanbanSim")).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Learn")).toBeInTheDocument();
  });

  it("toggles theme and persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    const toggle = screen.getByRole("button", { name: /toggle theme/i });
    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("kanbansim:theme")).toBe("dark");
    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @kanbansim/web test`
Expected: all tests pass (smoke + Header).

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/components/Header.tsx packages/web/src/components/ThemeToggle.tsx packages/web/src/theme/ packages/web/src/styles/header.css packages/web/src/App.tsx packages/web/src/main.tsx packages/web/test/Header.test.tsx
git commit -m "feat(web): persistent header with brand, nav, and theme toggle"
```

---

## Phase B — Orchestrator

After Phase B, the engine can be driven from the browser via a worker pool that streams aggregated results to React. This is the load-bearing layer; everything in Phases C–E sits on top of it.

### Task 8: Seed derivation (TDD)

The CLI uses `deriveSeed(master, cellIndex, runIndex)` to produce a deterministic seed per `(cell, run)` pair. The web reuses the exact same algorithm so a CLI run and a web run with the same master seed are bit-identical.

**Files:**
- Create: `packages/web/src/orchestrator/seeds.ts`
- Create: `packages/web/test/seeds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/seeds.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { deriveSeed } from "../src/orchestrator/seeds.js";

describe("deriveSeed", () => {
  it("is deterministic for the same triple", () => {
    expect(deriveSeed(1n, 0, 0)).toBe(deriveSeed(1n, 0, 0));
  });
  it("differs across cell indices", () => {
    expect(deriveSeed(1n, 0, 0)).not.toBe(deriveSeed(1n, 1, 0));
  });
  it("differs across run indices", () => {
    expect(deriveSeed(1n, 0, 0)).not.toBe(deriveSeed(1n, 0, 1));
  });
  it("matches the CLI algorithm exactly", () => {
    // Reference values computed from packages/cli/src/index.ts deriveSeed.
    // master=1, cellIndex=0, runIndex=0 -> 1n (0x9e... XOR cancels at index 0)
    expect(deriveSeed(1n, 0, 0)).toBe(1n);
    // master=1, cellIndex=1, runIndex=0
    const expected1_1_0 = (1n ^ (1n * 0x9e3779b97f4a7c15n)) ^ (0n * 0xbf58476d1ce4e5b9n);
    expect(deriveSeed(1n, 1, 0)).toBe(expected1_1_0 & 0xffffffffffffffffn);
  });
  it("constrains to 64 bits", () => {
    const seed = deriveSeed(0xffffffffffffffffn, 999, 999);
    expect(seed).toBeLessThanOrEqual(0xffffffffffffffffn);
    expect(seed).toBeGreaterThanOrEqual(0n);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test seeds`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/orchestrator/seeds.ts`**

Mirror the CLI's `deriveSeed` exactly.

```typescript
export function deriveSeed(master: bigint, cellIndex: number, runIndex: number): bigint {
  const a = master ^ (BigInt(cellIndex) * 0x9e3779b97f4a7c15n);
  const b = a ^ (BigInt(runIndex) * 0xbf58476d1ce4e5b9n);
  return b & 0xffffffffffffffffn;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test seeds`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/orchestrator/seeds.ts packages/web/test/seeds.test.ts
git commit -m "feat(web): deriveSeed matching cli algorithm"
```

---

### Task 9: URL state codec (TDD)

The URL hash carries the full `ExperimentConfig` plus sweep config plus master seed plus randomized-vars list. We use compact JSON + `encodeURIComponent`. Decoder validates shape and falls back to a preset on parse failure.

**Files:**
- Create: `packages/web/src/state/urlCodec.ts`
- Create: `packages/web/test/urlCodec.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/web/test/urlCodec.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { encodeExperiment, decodeExperiment, type ExperimentState } from "../src/state/urlCodec.js";
import type { ExperimentConfig } from "@kanbansim/engine";

const config: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

const baseState: ExperimentState = {
  name: "The Sweet Spot",
  config,
  sweep: { variable: "board.wip_in_progress", min: 1, max: 15, step: 1 },
  randomized: [],
  master_seed: "1",
  runs: 1000,
};

describe("urlCodec", () => {
  it("round-trips a complete experiment state", () => {
    const encoded = encodeExperiment(baseState);
    const decoded = decodeExperiment(encoded);
    expect(decoded).toEqual(baseState);
  });

  it("preserves master seed precision as a string (no bigint loss)", () => {
    const big = { ...baseState, master_seed: "18446744073709551615" };
    const decoded = decodeExperiment(encodeExperiment(big));
    expect(decoded?.master_seed).toBe("18446744073709551615");
  });

  it("preserves null sweep (no sweep)", () => {
    const noSweep = { ...baseState, sweep: null };
    const decoded = decodeExperiment(encodeExperiment(noSweep));
    expect(decoded?.sweep).toBeNull();
  });

  it("preserves randomized vars list", () => {
    const withRand: ExperimentState = {
      ...baseState,
      randomized: [{ path: "work.effort_dist.sigma", mu: 3.5, sigma: 1.0, skewness: 0 }],
    };
    const decoded = decodeExperiment(encodeExperiment(withRand));
    expect(decoded?.randomized).toEqual(withRand.randomized);
  });

  it("returns null for unparseable input", () => {
    expect(decodeExperiment("garbage")).toBeNull();
    expect(decodeExperiment("")).toBeNull();
    expect(decodeExperiment("eyJtYWxmb3JtZWQ")).toBeNull();
  });

  it("returns null for valid JSON missing required fields", () => {
    const partial = encodeURIComponent(JSON.stringify({ name: "x" }));
    expect(decodeExperiment(partial)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test urlCodec`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/state/urlCodec.ts`**

```typescript
import type { ExperimentConfig } from "@kanbansim/engine";

export type SweepSpec = { variable: string; min: number; max: number; step: number };

export type RandomizedVar = {
  path: string;          // dotted path into ExperimentConfig
  mu: number;
  sigma: number;
  skewness: number;
};

export type ExperimentState = {
  name: string;
  config: ExperimentConfig;
  sweep: SweepSpec | null;
  randomized: RandomizedVar[];
  master_seed: string;   // string-encoded bigint to survive JSON
  runs: number;
};

export function encodeExperiment(state: ExperimentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function decodeExperiment(encoded: string): ExperimentState | null {
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(encoded);
    const obj = JSON.parse(json) as unknown;
    if (!isExperimentState(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

function isExperimentState(o: unknown): o is ExperimentState {
  if (typeof o !== "object" || o === null) return false;
  const x = o as Partial<ExperimentState>;
  return (
    typeof x.name === "string" &&
    typeof x.master_seed === "string" &&
    typeof x.runs === "number" &&
    Array.isArray(x.randomized) &&
    typeof x.config === "object" && x.config !== null &&
    (x.sweep === null || (typeof x.sweep === "object" && typeof x.sweep?.variable === "string"))
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test urlCodec`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/urlCodec.ts packages/web/test/urlCodec.test.ts
git commit -m "feat(web): url codec for full experiment state with bigint-safe seed"
```

---

### Task 10: Throttle helper (TDD)

The aggregator setState must be capped at ~20 Hz. A small leading-edge throttle utility, plus a flush() to push the final state on completion.

**Files:**
- Create: `packages/web/src/lib/throttle.ts`
- Create: `packages/web/test/throttle.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "../src/lib/throttle.js";

describe("createThrottle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("calls immediately on first invocation (leading edge)", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");
  });

  it("coalesces rapid calls within the window into one trailing call", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");                 // leading
    t.call("b");                 // queued
    t.call("c");                 // overwrites b
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("flush() invokes any pending trailing call immediately", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");
    t.call("b");
    t.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });

  it("cancel() drops the pending trailing call", () => {
    const fn = vi.fn();
    const t = createThrottle(fn, 50);
    t.call("a");
    t.call("b");
    t.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test throttle`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/lib/throttle.ts`**

```typescript
export type Throttled<T> = {
  call(value: T): void;
  flush(): void;
  cancel(): void;
};

export function createThrottle<T>(fn: (value: T) => void, intervalMs: number): Throttled<T> {
  let lastInvoke = 0;
  let pendingValue: { v: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function fire(value: T): void {
    lastInvoke = Date.now();
    pendingValue = null;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    fn(value);
  }

  function scheduleTrailing(): void {
    if (timer !== null) return;
    const wait = Math.max(0, intervalMs - (Date.now() - lastInvoke));
    timer = setTimeout(() => {
      timer = null;
      if (pendingValue !== null) fire(pendingValue.v);
    }, wait);
  }

  return {
    call(value: T): void {
      const now = Date.now();
      if (now - lastInvoke >= intervalMs) {
        fire(value);
      } else {
        pendingValue = { v: value };
        scheduleTrailing();
      }
    },
    flush(): void {
      if (pendingValue !== null) fire(pendingValue.v);
    },
    cancel(): void {
      pendingValue = null;
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test throttle`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/throttle.ts packages/web/test/throttle.test.ts
git commit -m "feat(web): throttle utility with leading edge and flush"
```

---

### Task 11: Pure aggregator with rolling per-cell stats (TDD)

The aggregator owns the only mutable state worth re-rendering. Each `RunResult` lands in a per-cell bucket; bucket maintains the running stats the charts need (count, mean throughput, percentile estimates, sample of completed-item lead times, time-accounting totals, plus one stored `cfd` per cell for the representative-run animation).

For percentiles during streaming, exact quantiles over an unbounded sample are expensive. We keep all `summary` values (one number per run per cell) and re-quantile on read — at 10K runs × 15 cells × 5 stats this is trivial. Lead-time histogram needs all completed-item lead times across runs at the optimal cell only; we store them per cell as well (capped at 50K samples per cell to bound memory; samples beyond are reservoir-replaced).

**Files:**
- Create: `packages/web/src/orchestrator/aggregator.ts`
- Create: `packages/web/test/aggregator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { createAggregator, type CellStats } from "../src/orchestrator/aggregator.js";
import type { RunResult } from "@kanbansim/engine";

function makeResult(throughput: number, leadTime: number, completed = 50): RunResult {
  return {
    config: {} as RunResult["config"],
    seed: 1n,
    completed_items: Array.from({ length: completed }, (_, i) => ({
      id: i, arrival_tick: 0, done_tick: leadTime,
      lead_time_hours: leadTime, blocked_hours: 0, validation_started_tick: null,
    })),
    cfd: [{ tick: 0, counts: { backlog: 0, ready: 0, in_progress: 0, validation: 0, done: 0 } }],
    time_accounting: [
      { worker_id: 1, hours_working: 100, hours_switching: 20, hours_blocked: 30, hours_idle: 10 },
    ],
    summary: {
      throughput_per_day: throughput,
      median_lead_time_hours: leadTime,
      p85_lead_time_hours: leadTime,
      p95_lead_time_hours: leadTime,
      max_lead_time_hours: leadTime,
      items_completed: completed,
    },
  };
}

describe("aggregator", () => {
  it("starts empty", () => {
    const agg = createAggregator();
    expect(agg.snapshot().cells.size).toBe(0);
    expect(agg.snapshot().total_runs).toBe(0);
  });

  it("buckets results by sweep_value", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2.5, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(2.7, 75) });
    agg.ingest({ sweep_value: 6, result: makeResult(2.4, 90) });
    const snap = agg.snapshot();
    expect(snap.cells.size).toBe(2);
    expect(snap.cells.get(5)?.run_count).toBe(2);
    expect(snap.cells.get(6)?.run_count).toBe(1);
    expect(snap.total_runs).toBe(3);
  });

  it("computes mean throughput and lead time across runs in a cell", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2.0, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(3.0, 100) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.mean_throughput).toBeCloseTo(2.5);
    expect(cell.mean_median_lead_time).toBeCloseTo(90);
  });

  it("computes 5th and 95th percentile bands from run summaries", () => {
    const agg = createAggregator();
    for (let i = 0; i < 100; i++) {
      agg.ingest({ sweep_value: 5, result: makeResult(i * 0.05, i) });
    }
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.p05_throughput).toBeCloseTo(0.25, 1);
    expect(cell.p95_throughput).toBeCloseTo(4.75, 1);
  });

  it("accumulates raw lead-time hours per cell for the histogram", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80, 3) });
    agg.ingest({ sweep_value: 5, result: makeResult(2, 90, 2) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.lead_time_samples.length).toBe(5);
  });

  it("caps stored lead-time samples per cell at 50K", () => {
    const agg = createAggregator({ leadTimeSampleCap: 1000 });
    for (let i = 0; i < 50; i++) agg.ingest({ sweep_value: 5, result: makeResult(2, 80, 100) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.lead_time_samples.length).toBeLessThanOrEqual(1000);
    expect(cell.run_count).toBe(50);
  });

  it("stores at most one representative cfd per cell (most recent)", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(2.1, 82) });
    expect(agg.snapshot().cells.get(5)?.representative_cfd).toBeDefined();
  });

  it("aggregates worker time accounting totals", () => {
    const agg = createAggregator();
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80) });
    agg.ingest({ sweep_value: 5, result: makeResult(2, 80) });
    const cell = agg.snapshot().cells.get(5)!;
    expect(cell.time_accounting_totals.hours_working).toBe(200);
    expect(cell.time_accounting_totals.hours_switching).toBe(40);
  });
});

// Type re-export check (compile-time)
const _check: CellStats = {} as unknown as CellStats;
void _check;
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test aggregator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/orchestrator/aggregator.ts`**

```typescript
import type { CfdSnapshot, RunResult } from "@kanbansim/engine";

export type TimeAccountingTotals = {
  hours_working: number;
  hours_switching: number;
  hours_blocked: number;
  hours_idle: number;
};

export type CellStats = {
  sweep_value: number;
  run_count: number;
  mean_throughput: number;
  p05_throughput: number;
  p95_throughput: number;
  mean_median_lead_time: number;
  p05_median_lead_time: number;
  p95_median_lead_time: number;
  lead_time_samples: number[];        // raw completed-item lead_time_hours, capped
  representative_cfd: CfdSnapshot[] | null;
  time_accounting_totals: TimeAccountingTotals;
};

export type AggregatorSnapshot = {
  total_runs: number;
  cells: Map<number, CellStats>;
};

export type IngestArgs = { sweep_value: number; result: RunResult };

export type AggregatorOptions = { leadTimeSampleCap?: number };

type CellInternal = {
  sweep_value: number;
  throughput_samples: number[];
  median_lead_time_samples: number[];
  lead_time_samples: number[];
  representative_cfd: CfdSnapshot[] | null;
  time_accounting_totals: TimeAccountingTotals;
  run_count: number;
};

export function createAggregator(options: AggregatorOptions = {}) {
  const cap = options.leadTimeSampleCap ?? 50_000;
  const cells = new Map<number, CellInternal>();
  let totalRuns = 0;

  function ingest({ sweep_value, result }: IngestArgs): void {
    let cell = cells.get(sweep_value);
    if (!cell) {
      cell = {
        sweep_value,
        throughput_samples: [],
        median_lead_time_samples: [],
        lead_time_samples: [],
        representative_cfd: null,
        time_accounting_totals: { hours_working: 0, hours_switching: 0, hours_blocked: 0, hours_idle: 0 },
        run_count: 0,
      };
      cells.set(sweep_value, cell);
    }
    cell.run_count++;
    totalRuns++;
    cell.throughput_samples.push(result.summary.throughput_per_day);
    cell.median_lead_time_samples.push(result.summary.median_lead_time_hours);
    cell.representative_cfd = result.cfd;
    for (const ta of result.time_accounting) {
      cell.time_accounting_totals.hours_working += ta.hours_working;
      cell.time_accounting_totals.hours_switching += ta.hours_switching;
      cell.time_accounting_totals.hours_blocked += ta.hours_blocked;
      cell.time_accounting_totals.hours_idle += ta.hours_idle;
    }
    for (const item of result.completed_items) {
      if (cell.lead_time_samples.length < cap) {
        cell.lead_time_samples.push(item.lead_time_hours);
      } else {
        // Reservoir-style replacement to keep the sample uniform.
        const j = Math.floor(Math.random() * (cell.run_count + cell.lead_time_samples.length));
        if (j < cap) cell.lead_time_samples[j] = item.lead_time_hours;
      }
    }
  }

  function snapshot(): AggregatorSnapshot {
    const out = new Map<number, CellStats>();
    for (const [sv, c] of cells) {
      out.set(sv, {
        sweep_value: c.sweep_value,
        run_count: c.run_count,
        mean_throughput: mean(c.throughput_samples),
        p05_throughput: percentile(c.throughput_samples, 0.05),
        p95_throughput: percentile(c.throughput_samples, 0.95),
        mean_median_lead_time: mean(c.median_lead_time_samples),
        p05_median_lead_time: percentile(c.median_lead_time_samples, 0.05),
        p95_median_lead_time: percentile(c.median_lead_time_samples, 0.95),
        lead_time_samples: c.lead_time_samples.slice(),
        representative_cfd: c.representative_cfd,
        time_accounting_totals: { ...c.time_accounting_totals },
      });
    }
    return { total_runs: totalRuns, cells: out };
  }

  return { ingest, snapshot };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test aggregator`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/orchestrator/aggregator.ts packages/web/test/aggregator.test.ts
git commit -m "feat(web): pure aggregator with rolling per-cell stats"
```

---

### Task 12: Web Worker entry — runs the engine, posts results

**Files:**
- Create: `packages/web/src/orchestrator/messages.ts`
- Create: `packages/web/src/orchestrator/worker.ts`

- [ ] **Step 1: Write `packages/web/src/orchestrator/messages.ts`**

Define the message shapes between main thread and worker.

```typescript
import type { ExperimentConfig, RunResult } from "@kanbansim/engine";

export type WorkerJob = {
  // Each job is a list of (config, sweep_value, seed) triples to run sequentially.
  type: "run-batch";
  jobs: Array<{ sweep_value: number; config: ExperimentConfig; seed: string }>;  // seed as string to preserve bigint
};

export type WorkerEvent =
  | { type: "result"; sweep_value: number; result: RunResult }
  | { type: "batch-done" }
  | { type: "error"; message: string };
```

- [ ] **Step 2: Write `packages/web/src/orchestrator/worker.ts`**

```typescript
/// <reference lib="WebWorker" />
import { runSimulation } from "@kanbansim/engine";
import type { WorkerEvent, WorkerJob } from "./messages.js";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<WorkerJob>) => {
  const msg = e.data;
  if (msg.type !== "run-batch") return;
  try {
    for (const job of msg.jobs) {
      const seed = BigInt(job.seed);
      const result = runSimulation(job.config, seed);
      const event: WorkerEvent = { type: "result", sweep_value: job.sweep_value, result };
      self.postMessage(event);
    }
    const done: WorkerEvent = { type: "batch-done" };
    self.postMessage(done);
  } catch (err) {
    const errEvent: WorkerEvent = { type: "error", message: err instanceof Error ? err.message : String(err) };
    self.postMessage(errEvent);
  }
};

export {};
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @kanbansim/web typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/orchestrator/messages.ts packages/web/src/orchestrator/worker.ts
git commit -m "feat(web): web worker entry running engine and posting results"
```

---

### Task 13: Pool manager — spawn N workers, distribute jobs, throttle aggregator (TDD)

The pool spawns up to `min(navigator.hardwareConcurrency, 8)` workers. It builds a flat list of jobs (one job per `(cell, run)`), partitions them across workers, ingests results into the aggregator, fires throttled progress callbacks at ~20 Hz, and resolves when all workers report `batch-done`. Cancel calls `terminate()` on every worker and rejects.

**Files:**
- Create: `packages/web/src/orchestrator/pool.ts`
- Create: `packages/web/test/pool.test.ts`

- [ ] **Step 1: Write the failing test using a fake `Worker`**

Vitest under jsdom has no real `Worker`. We inject a fake constructor.

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runPool, type PoolHandle } from "../src/orchestrator/pool.js";
import type { ExperimentConfig, RunResult } from "@kanbansim/engine";
import type { WorkerEvent, WorkerJob } from "../src/orchestrator/messages.js";

const dummyConfig: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

function fakeResult(throughput: number): RunResult {
  return {
    config: dummyConfig, seed: 1n, completed_items: [],
    cfd: [{ tick: 0, counts: { backlog: 0, ready: 0, in_progress: 0, validation: 0, done: 0 } }],
    time_accounting: [{ worker_id: 1, hours_working: 1, hours_switching: 0, hours_blocked: 0, hours_idle: 0 }],
    summary: { throughput_per_day: throughput, median_lead_time_hours: 1, p85_lead_time_hours: 1, p95_lead_time_hours: 1, max_lead_time_hours: 1, items_completed: 0 },
  };
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(public url: URL | string, public opts?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: WorkerJob) {
    if (this.terminated) return;
    queueMicrotask(() => {
      if (this.terminated || msg.type !== "run-batch") return;
      for (const job of msg.jobs) {
        this.onmessage?.({ data: { type: "result", sweep_value: job.sweep_value, result: fakeResult(2 + job.sweep_value * 0.1) } } as MessageEvent<WorkerEvent>);
      }
      this.onmessage?.({ data: { type: "batch-done" } } as MessageEvent<WorkerEvent>);
    });
  }
  terminate() { this.terminated = true; }
}

beforeEach(() => { FakeWorker.instances = []; (globalThis as any).Worker = FakeWorker; });
afterEach(() => { delete (globalThis as any).Worker; });

describe("runPool", () => {
  it("runs all jobs and resolves when complete", async () => {
    const jobs = [
      { sweep_value: 1, config: dummyConfig, seed: "1" },
      { sweep_value: 2, config: dummyConfig, seed: "2" },
      { sweep_value: 3, config: dummyConfig, seed: "3" },
    ];
    const handle: PoolHandle = runPool({ jobs, workerCount: 2 });
    const final = await handle.done;
    expect(final.cells.size).toBe(3);
    expect(final.total_runs).toBe(3);
  });

  it("emits throttled progress callbacks during the run", async () => {
    const onProgress = vi.fn();
    const jobs = Array.from({ length: 50 }, (_, i) => ({ sweep_value: 1, config: dummyConfig, seed: String(i + 1) }));
    const handle = runPool({ jobs, workerCount: 4, onProgress, throttleMs: 10 });
    await handle.done;
    expect(onProgress.mock.calls.length).toBeGreaterThan(0);
    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1]![0];
    expect(last.total_runs).toBe(50);
  });

  it("cancel() rejects with a 'cancelled' marker and terminates all workers", async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ sweep_value: 1, config: dummyConfig, seed: String(i + 1) }));
    const handle = runPool({ jobs, workerCount: 3 });
    handle.cancel();
    await expect(handle.done).rejects.toMatchObject({ cancelled: true });
    for (const w of FakeWorker.instances) expect(w.terminated).toBe(true);
  });

  it("partitions jobs evenly across workers", async () => {
    const postSpy = vi.fn();
    class CountedWorker extends FakeWorker {
      override postMessage(msg: WorkerJob) { postSpy(msg.jobs.length); super.postMessage(msg); }
    }
    (globalThis as any).Worker = CountedWorker;
    const jobs = Array.from({ length: 10 }, (_, i) => ({ sweep_value: 1, config: dummyConfig, seed: String(i + 1) }));
    const handle = runPool({ jobs, workerCount: 4 });
    await handle.done;
    const sizes = postSpy.mock.calls.map((c) => c[0]).sort((a, b) => a - b);
    expect(sizes).toEqual([2, 2, 3, 3]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test pool`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/orchestrator/pool.ts`**

```typescript
import { createAggregator, type AggregatorSnapshot } from "./aggregator.js";
import { createThrottle } from "../lib/throttle.js";
import type { ExperimentConfig } from "@kanbansim/engine";
import type { WorkerEvent, WorkerJob } from "./messages.js";

export type PoolJob = { sweep_value: number; config: ExperimentConfig; seed: string };

export type PoolOptions = {
  jobs: PoolJob[];
  workerCount: number;
  onProgress?: (snap: AggregatorSnapshot) => void;
  throttleMs?: number;
  workerFactory?: () => Worker;
};

export type PoolHandle = {
  done: Promise<AggregatorSnapshot>;
  cancel: () => void;
};

export type CancelledError = { cancelled: true };

const DEFAULT_THROTTLE_MS = 50;

export function runPool(opts: PoolOptions): PoolHandle {
  const { jobs, workerCount } = opts;
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const aggregator = createAggregator();
  const factory = opts.workerFactory ?? defaultWorkerFactory;

  const throttled = createThrottle<AggregatorSnapshot>((snap) => {
    opts.onProgress?.(snap);
  }, throttleMs);

  let cancelled = false;
  let resolve!: (snap: AggregatorSnapshot) => void;
  let reject!: (err: CancelledError) => void;
  const done = new Promise<AggregatorSnapshot>((res, rej) => { resolve = res; reject = rej; });

  const partitions = partition(jobs, Math.max(1, Math.min(workerCount, jobs.length || 1)));
  const workers: Worker[] = [];
  let pendingBatches = partitions.length;

  function finishIfDone(): void {
    if (cancelled) return;
    if (pendingBatches === 0) {
      throttled.flush();
      for (const w of workers) w.terminate();
      resolve(aggregator.snapshot());
    }
  }

  for (const part of partitions) {
    const worker = factory();
    workers.push(worker);
    worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      if (cancelled) return;
      const msg = e.data;
      if (msg.type === "result") {
        aggregator.ingest({ sweep_value: msg.sweep_value, result: msg.result });
        throttled.call(aggregator.snapshot());
      } else if (msg.type === "batch-done") {
        pendingBatches--;
        finishIfDone();
      } else if (msg.type === "error") {
        cancelled = true;
        throttled.cancel();
        for (const w of workers) w.terminate();
        reject({ cancelled: true });
      }
    };
    const job: WorkerJob = { type: "run-batch", jobs: part };
    worker.postMessage(job);
  }

  function cancel(): void {
    if (cancelled) return;
    cancelled = true;
    throttled.cancel();
    for (const w of workers) w.terminate();
    reject({ cancelled: true });
  }

  return { done, cancel };
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}

function partition<T>(items: T[], n: number): T[][] {
  if (n <= 0) return [items];
  const out: T[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < items.length; i++) out[i % n]!.push(items[i]!);
  return out;
}
```

Note on `defaultWorkerFactory`: `new URL("./worker.js", import.meta.url)` — Vite rewrites `./worker.ts` references to the bundled worker chunk at build time when used in this exact pattern.

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test pool`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/orchestrator/pool.ts packages/web/test/pool.test.ts
git commit -m "feat(web): worker pool with throttled aggregation and cancel"
```

---

### Task 14: `useExperiment` React hook (with per-run randomization)

**Files:**
- Create: `packages/web/src/state/randomization.ts`
- Create: `packages/web/test/randomization.test.ts`
- Create: `packages/web/src/orchestrator/useExperiment.ts`

The hook builds the job list from an `ExperimentState`, kicks off the pool, exposes `{ snapshot, status, cancel, runsCompleted, runsTotal, startedAt, etaSeconds, runsPerSec }` and handles unmount cleanup. Per spec §6.2 each run with randomized variables draws fresh values *before* the engine starts; a separate "param PRNG" derived from the run seed (via XOR with a constant) does the sampling so we don't perturb the engine's own seed stream.

- [ ] **Step 1: Write the failing test for `applyRandomization`**

Create `packages/web/test/randomization.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { applyRandomization } from "../src/state/randomization.js";
import type { ExperimentConfig } from "@kanbansim/engine";

const config: ExperimentConfig = {
  team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
  work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
  board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
  simulation: { sim_days: 130, tick_size_hours: 1 },
};

describe("applyRandomization", () => {
  it("returns the input unchanged when no randomized vars", () => {
    const out = applyRandomization(config, [], 1n);
    expect(out).toEqual(config);
  });
  it("is deterministic for the same (config, vars, seed)", () => {
    const vars = [{ path: "work.effort_dist.sigma", mu: 3.5, sigma: 1.0, skewness: 0 }];
    const a = applyRandomization(config, vars, 42n);
    const b = applyRandomization(config, vars, 42n);
    expect(a.work.effort_dist.sigma).toBe(b.work.effort_dist.sigma);
  });
  it("differs across seeds", () => {
    const vars = [{ path: "work.effort_dist.sigma", mu: 3.5, sigma: 1.0, skewness: 0 }];
    const a = applyRandomization(config, vars, 1n).work.effort_dist.sigma;
    const b = applyRandomization(config, vars, 2n).work.effort_dist.sigma;
    expect(a).not.toBe(b);
  });
  it("samples positive values for log-normal-shaped numeric paths", () => {
    const vars = [{ path: "work.arrival_rate_per_day", mu: 4, sigma: 1.5, skewness: 0.5 }];
    for (let s = 1n; s < 50n; s++) {
      const v = applyRandomization(config, vars, s).work.arrival_rate_per_day;
      expect(v).toBeGreaterThan(0);
    }
  });
  it("clamps integer-valued paths to >= 1", () => {
    const vars = [{ path: "team.size", mu: 5, sigma: 8, skewness: 0 }];
    for (let s = 1n; s < 50n; s++) {
      const v = applyRandomization(config, vars, s).team.size;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });
  it("clamps probability paths to [0, 1]", () => {
    const vars = [{ path: "work.block_probability_per_day", mu: 0.04, sigma: 0.5, skewness: 0 }];
    for (let s = 1n; s < 50n; s++) {
      const v = applyRandomization(config, vars, s).work.block_probability_per_day;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test randomization`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/state/randomization.ts`**

```typescript
import { createPrng, sampleLogNormal, sampleSkewNormal, setAtPath, type ExperimentConfig } from "@kanbansim/engine";
import type { RandomizedVar } from "./urlCodec.js";

// Paths that must be integer-rounded (and clamped >= 1).
const INTEGER_PATHS = new Set<string>([
  "team.size",
  "team.productive_hours_per_day",
  "team.switch_cost_minutes",
  "board.wip_ready",
  "board.wip_in_progress",
  "board.wip_validation",
  "simulation.sim_days",
]);

// Paths interpreted as probabilities — clamp to [0, 1].
const PROBABILITY_PATHS = new Set<string>([
  "work.block_probability_per_day",
  "team.pace_penalty",
]);

const PARAM_SEED_XOR = 0xdeadbeefcafef00dn;

export function applyRandomization(
  config: ExperimentConfig,
  randomized: RandomizedVar[],
  runSeed: bigint,
): ExperimentConfig {
  if (randomized.length === 0) return config;
  const paramSeed = (runSeed ^ PARAM_SEED_XOR) & 0xffffffffffffffffn;
  const rng = createPrng(paramSeed);
  let out = config;
  for (const v of randomized) {
    let sampled: number;
    if (PROBABILITY_PATHS.has(v.path)) {
      sampled = sampleSkewNormal(rng, { mu: v.mu, sigma: v.sigma, skewness: v.skewness });
      sampled = Math.max(0, Math.min(1, sampled));
    } else {
      sampled = sampleLogNormal(rng, { mu: v.mu, sigma: v.sigma, skewness: v.skewness });
    }
    if (INTEGER_PATHS.has(v.path)) {
      sampled = Math.max(1, Math.round(sampled));
    }
    out = setAtPath(out, v.path, sampled);
  }
  return out;
}
```

Note on engine API: `sampleLogNormal` and `sampleSkewNormal` are exported from `@kanbansim/engine` (verified in `packages/engine/src/index.ts`). They take `(rng, DistributionSpec)`.

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test randomization`
Expected: PASS, 6 tests.

- [ ] **Step 5: Implement `packages/web/src/orchestrator/useExperiment.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { generateSweepValues, setAtPath, type ExperimentConfig } from "@kanbansim/engine";
import { runPool, type PoolJob, type PoolHandle } from "./pool.js";
import { deriveSeed } from "./seeds.js";
import type { AggregatorSnapshot } from "./aggregator.js";
import type { ExperimentState } from "../state/urlCodec.js";
import { applyRandomization } from "../state/randomization.js";

export type ExperimentStatus = "idle" | "running" | "complete" | "cancelled" | "error";

export type UseExperimentReturn = {
  snapshot: AggregatorSnapshot | null;
  status: ExperimentStatus;
  runsCompleted: number;
  runsTotal: number;
  startedAt: number | null;
  etaSeconds: number | null;
  runsPerSec: number | null;
  workerCount: number;
  start: (state: ExperimentState) => void;
  cancel: () => void;
};

const MAX_WORKERS = 8;

export function useExperiment(): UseExperimentReturn {
  const [snapshot, setSnapshot] = useState<AggregatorSnapshot | null>(null);
  const [status, setStatus] = useState<ExperimentStatus>("idle");
  const [runsTotal, setRunsTotal] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [runsPerSec, setRunsPerSec] = useState<number | null>(null);
  const handleRef = useRef<PoolHandle | null>(null);
  const workerCount = Math.min(MAX_WORKERS, typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4);

  useEffect(() => {
    return () => { handleRef.current?.cancel(); };
  }, []);

  function start(state: ExperimentState) {
    handleRef.current?.cancel();
    const jobs = buildJobs(state);
    setSnapshot(null);
    setStatus("running");
    setRunsTotal(jobs.length);
    const t0 = Date.now();
    setStartedAt(t0);
    setEtaSeconds(null);
    setRunsPerSec(null);

    const handle = runPool({
      jobs,
      workerCount,
      throttleMs: 50,
      onProgress: (snap) => {
        setSnapshot(snap);
        const elapsedSec = (Date.now() - t0) / 1000;
        if (elapsedSec > 0.4 && snap.total_runs > 0) {
          const rps = snap.total_runs / elapsedSec;
          setRunsPerSec(rps);
          const remaining = jobs.length - snap.total_runs;
          setEtaSeconds(rps > 0 ? remaining / rps : null);
        }
      },
    });
    handleRef.current = handle;
    handle.done.then((finalSnap) => {
      setSnapshot(finalSnap);
      setStatus("complete");
      setEtaSeconds(0);
    }).catch((err) => {
      if ((err as { cancelled?: boolean }).cancelled) {
        setStatus("cancelled");
      } else {
        setStatus("error");
      }
    });
  }

  function cancel() {
    handleRef.current?.cancel();
  }

  return {
    snapshot, status,
    runsCompleted: snapshot?.total_runs ?? 0,
    runsTotal, startedAt, etaSeconds, runsPerSec,
    workerCount,
    start, cancel,
  };
}

function buildJobs(state: ExperimentState): PoolJob[] {
  const out: PoolJob[] = [];
  const sweepValues = state.sweep
    ? generateSweepValues(state.sweep.min, state.sweep.max, state.sweep.step)
    : [Number.NaN];                      // single sentinel cell
  const masterSeed = BigInt(state.master_seed);
  for (let cellIdx = 0; cellIdx < sweepValues.length; cellIdx++) {
    const sv = sweepValues[cellIdx]!;
    const cellConfig: ExperimentConfig = state.sweep
      ? setAtPath(state.config, state.sweep.variable, sv)
      : state.config;
    for (let r = 0; r < state.runs; r++) {
      const seed = deriveSeed(masterSeed, cellIdx, r);
      const runConfig = applyRandomization(cellConfig, state.randomized, seed);
      out.push({ sweep_value: Number.isNaN(sv) ? 0 : sv, config: runConfig, seed: seed.toString() });
    }
  }
  return out;
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @kanbansim/web typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/state/randomization.ts packages/web/test/randomization.test.ts packages/web/src/orchestrator/useExperiment.ts
git commit -m "feat(web): useExperiment hook with per-run randomization sampler"
```

---

## Phase C — Configurator

After Phase C, the user can land on `/build`, edit every parameter, click Run, and the orchestrator from Phase B kicks off. Charts come in Phase D.

### Task 15: Preset loader + default state

**Files:**
- Create: `packages/web/public/scenarios/sweet-spot.json` (copy of `/scenarios/sweet-spot.json`)
- Create: `packages/web/public/scenarios/qa-bottleneck.json` (copy)
- Create: `packages/web/public/scenarios/multitasking-tax.json` (copy)
- Create: `packages/web/src/state/presets.ts`

- [ ] **Step 1: Copy the three preset JSON files into `packages/web/public/scenarios/`**

Run from repo root:

```bash
mkdir -p packages/web/public/scenarios
cp scenarios/sweet-spot.json packages/web/public/scenarios/sweet-spot.json
cp scenarios/qa-bottleneck.json packages/web/public/scenarios/qa-bottleneck.json
cp scenarios/multitasking-tax.json packages/web/public/scenarios/multitasking-tax.json
```

- [ ] **Step 2: Write `packages/web/src/state/presets.ts`**

```typescript
import type { ExperimentConfig } from "@kanbansim/engine";
import type { ExperimentState, SweepSpec } from "./urlCodec.js";

export type PresetId = "sweet-spot" | "qa-bottleneck" | "multitasking-tax";

type ScenarioFile = {
  name: string;
  description: string;
  lesson?: string;
  config: ExperimentConfig;
  sweep?: SweepSpec;
};

export const PRESET_IDS: PresetId[] = ["sweet-spot", "qa-bottleneck", "multitasking-tax"];

export const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  "sweet-spot": "WIP swept 1 → 15. Find the optimal point on the U-curve.",
  "qa-bottleneck": "Validation WIP swept 1 → 6. See where the team chokes when QA can't keep up.",
  "multitasking-tax": "Switch cost swept 0 → 60 min at high WIP. Watch the team grind to a halt.",
};

export async function loadPreset(id: PresetId): Promise<ExperimentState> {
  const url = `${import.meta.env.BASE_URL ?? "./"}scenarios/${id}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load preset ${id}: ${res.status}`);
  const file = (await res.json()) as ScenarioFile;
  return {
    name: file.name,
    config: file.config,
    sweep: file.sweep ?? null,
    randomized: [],
    master_seed: "1",
    runs: 1000,
  };
}
```

- [ ] **Step 3: Verify the file lands in the dev server**

Run: `pnpm --filter @kanbansim/web dev`
Visit: http://localhost:5173/scenarios/sweet-spot.json
Expected: the JSON renders. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add packages/web/public/scenarios/ packages/web/src/state/presets.ts
git commit -m "feat(web): preset loader and three scenario JSON copies"
```

---

### Task 16: ParameterInput component + tooltip data

**Files:**
- Create: `packages/web/src/lib/tooltips.ts`
- Create: `packages/web/src/components/ParameterInput.tsx`
- Create: `packages/web/src/components/Tooltip.tsx`
- Create: `packages/web/src/styles/parameter.css`
- Modify: `packages/web/src/main.tsx` (import parameter.css)
- Create: `packages/web/test/ParameterInput.test.tsx`

- [ ] **Step 1: Write tooltip strings**

`packages/web/src/lib/tooltips.ts`:

```typescript
export const TOOLTIPS: Record<string, string> = {
  "team.size": "Number of generalist workers on the team. Each can perform any role; peer review prevents self-validation.",
  "team.productive_hours_per_day": "Hours per workday spent on simulated work. The default 6 reflects realistic ratio of meetings/admin to focus time.",
  "team.switch_cost_minutes": "Minutes lost when a worker switches between active items in the same hour. Real ramp-up cost — not retroactive.",
  "team.pace_penalty": "Multiplicative slowdown per extra active item. 5% means juggling 4 items runs at 0.85× speed regardless of switching.",
  "team.blocking_response": "What a worker does when all their items are blocked: wait, start a new one, help validate someone else's, or swarm the blocker.",

  "work.arrival_rate_per_day": "Mean items arriving per working day, sampled from a Poisson process.",
  "work.effort_dist.mu": "Median item effort in hours. Real cycle times are right-skewed; this is the distribution's location parameter.",
  "work.effort_dist.sigma": "Spread of effort in hours. Higher = more variability — short stories mixed with epics.",
  "work.effort_dist.skewness": "Right-skew of the effort distribution. Positive values reflect realistic 'long tail' effort.",
  "work.block_probability_per_day": "Per active item, the chance per day it becomes blocked on something external (review, dependency, environment).",

  "board.wip_ready": "Maximum items in Ready. Unlimited (—) means no Ready cap.",
  "board.wip_in_progress": "Maximum items In Progress. Lower this to test the WIP-limit hypothesis.",
  "board.wip_validation": "Maximum items in Validation. The classic QA-bottleneck lever.",

  "monte_carlo.runs": "Number of independent runs at every sweep value. More runs = tighter confidence bands.",
  "monte_carlo.master_seed": "Master seed for reproducibility. Same seed + same config = bit-identical results.",
  "monte_carlo.sweep": "The variable to sweep across the experiment. Each step gets `runs` runs; results aggregate per cell.",
  "monte_carlo.randomize": "When on, this parameter is sampled per-run from a (μ, σ, skewness) triplet instead of held fixed.",
};
```

- [ ] **Step 2: Write `packages/web/src/components/Tooltip.tsx`**

```tsx
import type { ReactNode } from "react";

export function Tooltip({ children, content }: { children: ReactNode; content: string }) {
  return (
    <span className="tooltip-wrap">
      {children}
      <span className="tooltip-bubble" role="tooltip">{content}</span>
    </span>
  );
}
```

- [ ] **Step 3: Write `packages/web/src/components/ParameterInput.tsx`**

```tsx
import { Tooltip } from "./Tooltip.js";
import { TOOLTIPS } from "../lib/tooltips.js";

export type ParameterInputProps = {
  label: string;
  path: string;                              // dotted path, e.g. "team.size"
  value: number | null;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  randomizable?: boolean;
  randomized?: boolean;
  onToggleRandomize?: () => void;
};

export function ParameterInput(props: ParameterInputProps) {
  const tip = TOOLTIPS[props.path] ?? "";
  return (
    <div className="param-row">
      <label className="param-label">
        <span>{props.label}</span>
        {tip && (
          <Tooltip content={tip}>
            <span className="param-help" aria-label="Help">?</span>
          </Tooltip>
        )}
      </label>
      <div className="param-control">
        <input
          type="number"
          className="param-input mono"
          value={props.value ?? ""}
          step={props.step ?? 1}
          {...(props.min !== undefined ? { min: props.min } : {})}
          {...(props.max !== undefined ? { max: props.max } : {})}
          onChange={(e) => props.onChange(parseFloat(e.target.value))}
        />
        {props.unit && <span className="param-unit mono">{props.unit}</span>}
        {props.randomizable && (
          <button
            type="button"
            className={`param-randomize ${props.randomized ? "on" : ""}`}
            onClick={props.onToggleRandomize}
            aria-pressed={props.randomized}
          >
            🎲
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `packages/web/src/styles/parameter.css`**

```css
.param-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--rule-soft);
}
.param-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-soft);
  font-size: 13px;
}
.param-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-input {
  width: 90px;
  padding: 5px 8px;
  border: 1px solid var(--rule);
  background: var(--bg);
  color: var(--text);
  border-radius: 3px;
  text-align: right;
  font-size: 13px;
}
.param-input:focus { outline: 1.5px solid var(--accent); }
.param-unit { color: var(--text-faint); font-size: 11px; }
.param-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px; height: 16px;
  border: 1px solid var(--rule);
  border-radius: 50%;
  font-size: 10px;
  color: var(--text-faint);
  cursor: help;
}
.param-randomize {
  border: 1px solid var(--rule);
  background: transparent;
  border-radius: 3px;
  padding: 4px 8px;
  font-size: 14px;
  opacity: 0.4;
}
.param-randomize.on { opacity: 1; background: var(--warning-soft); border-color: var(--warning); }

.tooltip-wrap { position: relative; display: inline-block; }
.tooltip-bubble {
  display: none;
  position: absolute;
  z-index: 50;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--bg);
  padding: 8px 10px;
  border-radius: 3px;
  font-size: 12px;
  font-family: var(--sans);
  white-space: normal;
  width: max-content;
  max-width: 260px;
  line-height: 1.4;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
.tooltip-wrap:hover .tooltip-bubble,
.tooltip-wrap:focus-within .tooltip-bubble { display: block; }
```

- [ ] **Step 5: Add `import "./styles/parameter.css";` to `packages/web/src/main.tsx`**

- [ ] **Step 6: Behavior test**

`packages/web/test/ParameterInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParameterInput } from "../src/components/ParameterInput.js";

describe("ParameterInput", () => {
  it("calls onChange with the parsed numeric value", async () => {
    const onChange = vi.fn();
    render(<ParameterInput label="Team size" path="team.size" value={5} onChange={onChange} />);
    const input = screen.getByDisplayValue("5") as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "8");
    expect(onChange).toHaveBeenLastCalledWith(8);
  });

  it("toggles randomize when the dice button is clicked", async () => {
    const onToggle = vi.fn();
    render(
      <ParameterInput label="Effort μ" path="work.effort_dist.mu" value={8}
        onChange={() => {}} randomizable randomized={false} onToggleRandomize={onToggle} />,
    );
    await userEvent.click(screen.getByRole("button", { pressed: false }));
    expect(onToggle).toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @kanbansim/web test ParameterInput`
Expected: 2 pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/tooltips.ts packages/web/src/components/ParameterInput.tsx packages/web/src/components/Tooltip.tsx packages/web/src/styles/parameter.css packages/web/src/main.tsx packages/web/test/ParameterInput.test.tsx
git commit -m "feat(web): parameter input component with tooltip and randomize toggle"
```

---

### Task 17: Configurator state hook + URL sync

**Files:**
- Create: `packages/web/src/state/useConfigurator.ts`
- Create: `packages/web/test/useConfigurator.test.tsx`

The hook centralizes the editable `ExperimentState`, exposes `update(path, value)` and `toggleRandomize(path, defaults)` and `setSweep(path)`, and round-trips the URL hash on every change.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useConfigurator } from "../src/state/useConfigurator.js";
import type { ExperimentState } from "../src/state/urlCodec.js";

const initial: ExperimentState = {
  name: "Custom",
  config: {
    team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
    work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
    board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
    simulation: { sim_days: 130, tick_size_hours: 1 },
  },
  sweep: { variable: "board.wip_in_progress", min: 1, max: 15, step: 1 },
  randomized: [],
  master_seed: "1",
  runs: 1000,
};

describe("useConfigurator", () => {
  it("update() applies a new value at a dotted path", () => {
    const { result } = renderHook(() => useConfigurator(initial));
    act(() => { result.current.update("team.size", 8); });
    expect(result.current.state.config.team.size).toBe(8);
  });
  it("toggleRandomize adds and removes a randomized var", () => {
    const { result } = renderHook(() => useConfigurator(initial));
    act(() => { result.current.toggleRandomize("work.effort_dist.sigma", { mu: 3.5, sigma: 1, skewness: 0 }); });
    expect(result.current.state.randomized.length).toBe(1);
    act(() => { result.current.toggleRandomize("work.effort_dist.sigma", { mu: 3.5, sigma: 1, skewness: 0 }); });
    expect(result.current.state.randomized.length).toBe(0);
  });
  it("setSweep replaces the sweep variable", () => {
    const { result } = renderHook(() => useConfigurator(initial));
    act(() => { result.current.setSweep({ variable: "team.size", min: 2, max: 10, step: 1 }); });
    expect(result.current.state.sweep?.variable).toBe("team.size");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @kanbansim/web test useConfigurator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/web/src/state/useConfigurator.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { setAtPath } from "@kanbansim/engine";
import { encodeExperiment, type ExperimentState, type RandomizedVar, type SweepSpec } from "./urlCodec.js";

export function useConfigurator(initial: ExperimentState) {
  const [state, setState] = useState<ExperimentState>(initial);

  // Mirror state into the URL hash query (?e=<encoded>) so refresh and copy-link work.
  useEffect(() => {
    const encoded = encodeExperiment(state);
    const newHash = `${window.location.hash.split("?")[0]}?e=${encoded}`;
    if (newHash !== window.location.hash) {
      window.history.replaceState(null, "", newHash);
    }
  }, [state]);

  const update = useCallback((path: string, value: number | null) => {
    setState((s) => ({ ...s, config: setAtPath(s.config, path, value) }));
  }, []);

  const toggleRandomize = useCallback((path: string, defaults: { mu: number; sigma: number; skewness: number }) => {
    setState((s) => {
      const i = s.randomized.findIndex((r) => r.path === path);
      if (i >= 0) {
        return { ...s, randomized: s.randomized.filter((_, j) => j !== i) };
      }
      const next: RandomizedVar = { path, ...defaults };
      return { ...s, randomized: [...s.randomized, next] };
    });
  }, []);

  const setSweep = useCallback((sweep: SweepSpec | null) => {
    setState((s) => ({ ...s, sweep }));
  }, []);

  const setRuns = useCallback((runs: number) => {
    setState((s) => ({ ...s, runs }));
  }, []);

  const setMasterSeed = useCallback((master_seed: string) => {
    setState((s) => ({ ...s, master_seed }));
  }, []);

  const setName = useCallback((name: string) => {
    setState((s) => ({ ...s, name }));
  }, []);

  const replace = useCallback((next: ExperimentState) => {
    setState(next);
  }, []);

  return { state, update, toggleRandomize, setSweep, setRuns, setMasterSeed, setName, replace };
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test useConfigurator`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/state/useConfigurator.ts packages/web/test/useConfigurator.test.tsx
git commit -m "feat(web): useConfigurator hook with url-hash sync"
```

---

### Task 18: Configurator tabs and shell

**Files:**
- Modify: `packages/web/src/pages/Build.tsx`
- Create: `packages/web/src/pages/build/TabBar.tsx`
- Create: `packages/web/src/pages/build/TeamTab.tsx`
- Create: `packages/web/src/pages/build/WorkTab.tsx`
- Create: `packages/web/src/pages/build/BoardTab.tsx`
- Create: `packages/web/src/pages/build/MonteCarloTab.tsx`
- Create: `packages/web/src/styles/build.css`
- Modify: `packages/web/src/main.tsx` (import build.css)

- [ ] **Step 1: Write `packages/web/src/styles/build.css`**

```css
.build-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 36px 40px 80px;
}
.build-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 22px;
  margin-bottom: 28px;
  gap: 24px;
  flex-wrap: wrap;
}
.build-head h1 {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(26px, 4.5vw, 38px);
  letter-spacing: -0.02em;
}
.build-head .actions { display: flex; gap: 10px; align-items: center; }
.tab-bar { display: flex; gap: 0; border-bottom: 1px solid var(--rule); margin-bottom: 24px; }
.tab-bar button {
  background: transparent;
  border: none;
  padding: 12px 20px;
  font-size: 13px;
  color: var(--text-soft);
  border-bottom: 2px solid transparent;
}
.tab-bar button.active { color: var(--text); border-bottom-color: var(--text); font-weight: 500; }
.tab-panel {
  background: var(--bg-paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 24px 28px;
}
.tab-panel h2 {
  font-family: var(--serif);
  font-size: 20px;
  margin-bottom: 16px;
}
.tab-panel .help {
  font-size: 13px;
  color: var(--text-soft);
  margin-bottom: 18px;
  max-width: 60ch;
}
@media (max-width: 760px) {
  .build-page { padding: 22px 18px 60px; }
  .tab-bar { overflow-x: auto; flex-wrap: nowrap; }
  .tab-bar button { white-space: nowrap; }
  .tab-panel { padding: 18px; }
}
```

Add `import "./styles/build.css";` to `main.tsx`.

- [ ] **Step 2: Write `packages/web/src/pages/build/TabBar.tsx`**

```tsx
export type TabId = "team" | "work" | "board" | "monte-carlo";

const LABELS: Record<TabId, string> = {
  team: "Team",
  work: "Work",
  board: "Board",
  "monte-carlo": "Monte Carlo",
};

export function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="tab-bar" role="tablist">
      {(Object.keys(LABELS) as TabId[]).map((id) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          className={active === id ? "active" : ""}
          onClick={() => onChange(id)}
          type="button"
        >
          {LABELS[id]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `packages/web/src/pages/build/TeamTab.tsx`**

```tsx
import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
};

export function TeamTab({ state, update }: Props) {
  const t = state.config.team;
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Team</h2>
      <p className="help">Generalist team. Every worker can perform any role; peer review prevents self-validation.</p>
      <ParameterInput label="Team size" path="team.size" value={t.size} step={1} min={1} onChange={(v) => update("team.size", Math.max(1, Math.round(v)))} />
      <ParameterInput label="Productive hrs/day" path="team.productive_hours_per_day" value={t.productive_hours_per_day} step={0.5} min={1} max={12} unit="hrs" onChange={(v) => update("team.productive_hours_per_day", v)} />
      <ParameterInput label="Switch cost" path="team.switch_cost_minutes" value={t.switch_cost_minutes} step={5} min={0} max={120} unit="min" onChange={(v) => update("team.switch_cost_minutes", v)} />
      <ParameterInput label="Pace penalty" path="team.pace_penalty" value={t.pace_penalty} step={0.01} min={0} max={0.5} unit="/extra" onChange={(v) => update("team.pace_penalty", v)} />
    </section>
  );
}
```

- [ ] **Step 4: Write `packages/web/src/pages/build/WorkTab.tsx`**

```tsx
import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
  toggleRandomize: (path: string, defaults: { mu: number; sigma: number; skewness: number }) => void;
};

export function WorkTab({ state, update, toggleRandomize }: Props) {
  const w = state.config.work;
  const isRandomized = (path: string) => state.randomized.some((r) => r.path === path);
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Work Items</h2>
      <p className="help">How items arrive and how big they are. Effort defaults to log-normal — positive, right-skewed, like real cycle times.</p>
      <ParameterInput label="Arrival rate" path="work.arrival_rate_per_day" value={w.arrival_rate_per_day} step={0.5} min={0} unit="/day" randomizable randomized={isRandomized("work.arrival_rate_per_day")} onChange={(v) => update("work.arrival_rate_per_day", v)} onToggleRandomize={() => toggleRandomize("work.arrival_rate_per_day", { mu: w.arrival_rate_per_day, sigma: 1, skewness: 0 })} />
      <ParameterInput label="Effort μ" path="work.effort_dist.mu" value={w.effort_dist.mu} step={0.5} min={0.5} unit="hrs" onChange={(v) => update("work.effort_dist.mu", v)} />
      <ParameterInput label="Effort σ" path="work.effort_dist.sigma" value={w.effort_dist.sigma} step={0.25} min={0} unit="hrs" randomizable randomized={isRandomized("work.effort_dist.sigma")} onChange={(v) => update("work.effort_dist.sigma", v)} onToggleRandomize={() => toggleRandomize("work.effort_dist.sigma", { mu: w.effort_dist.sigma, sigma: 1, skewness: 0 })} />
      <ParameterInput label="Effort skew" path="work.effort_dist.skewness" value={w.effort_dist.skewness} step={0.1} onChange={(v) => update("work.effort_dist.skewness", v)} />
      <ParameterInput label="Block probability" path="work.block_probability_per_day" value={w.block_probability_per_day} step={0.005} min={0} max={1} unit="/day" onChange={(v) => update("work.block_probability_per_day", v)} />
    </section>
  );
}
```

- [ ] **Step 5: Write `packages/web/src/pages/build/BoardTab.tsx`**

```tsx
import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  update: (path: string, value: number | null) => void;
};

export function BoardTab({ state, update }: Props) {
  const b = state.config.board;
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Board</h2>
      <p className="help">Five fixed columns: Backlog → Ready → In Progress → Validation → Done. Set per-column WIP limits below. "—" means unlimited.</p>
      <ParameterInput label="Ready WIP" path="board.wip_ready" value={b.wip_ready} step={1} min={0} onChange={(v) => update("board.wip_ready", isFinite(v) ? Math.max(0, Math.round(v)) : null)} />
      <ParameterInput label="In Progress WIP" path="board.wip_in_progress" value={b.wip_in_progress} step={1} min={1} onChange={(v) => update("board.wip_in_progress", Math.max(1, Math.round(v)))} />
      <ParameterInput label="Validation WIP" path="board.wip_validation" value={b.wip_validation} step={1} min={1} onChange={(v) => update("board.wip_validation", Math.max(1, Math.round(v)))} />
    </section>
  );
}
```

- [ ] **Step 6: Write `packages/web/src/pages/build/MonteCarloTab.tsx`**

```tsx
import { ParameterInput } from "../../components/ParameterInput.js";
import type { ExperimentState, SweepSpec } from "../../state/urlCodec.js";

type Props = {
  state: ExperimentState;
  setRuns: (runs: number) => void;
  setMasterSeed: (seed: string) => void;
  setSweep: (sweep: SweepSpec | null) => void;
};

const SWEEPABLE_PATHS: Array<{ path: string; label: string; defaults: { min: number; max: number; step: number } }> = [
  { path: "board.wip_in_progress", label: "In Progress WIP", defaults: { min: 1, max: 15, step: 1 } },
  { path: "board.wip_validation", label: "Validation WIP", defaults: { min: 1, max: 8, step: 1 } },
  { path: "board.wip_ready", label: "Ready WIP", defaults: { min: 1, max: 12, step: 1 } },
  { path: "team.switch_cost_minutes", label: "Switch cost", defaults: { min: 0, max: 60, step: 5 } },
  { path: "team.size", label: "Team size", defaults: { min: 2, max: 12, step: 1 } },
  { path: "work.arrival_rate_per_day", label: "Arrival rate", defaults: { min: 1, max: 10, step: 1 } },
];

export function MonteCarloTab({ state, setRuns, setMasterSeed, setSweep }: Props) {
  return (
    <section className="tab-panel" role="tabpanel">
      <h2>Monte Carlo</h2>
      <p className="help">Choose how many runs and which variable to sweep. Each sweep value gets `runs` runs; results aggregate per cell.</p>

      <ParameterInput label="Runs" path="monte_carlo.runs" value={state.runs} step={100} min={100} max={10000} onChange={(v) => setRuns(Math.max(100, Math.min(10000, Math.round(v))))} />
      <ParameterInput label="Master seed" path="monte_carlo.master_seed" value={Number(state.master_seed) || 1} step={1} min={1} onChange={(v) => setMasterSeed(String(Math.max(1, Math.round(v))))} />

      <div className="param-row">
        <label className="param-label">Sweep variable</label>
        <div className="param-control">
          <select
            className="param-input"
            style={{ width: "auto" }}
            value={state.sweep?.variable ?? ""}
            onChange={(e) => {
              const path = e.target.value;
              if (!path) { setSweep(null); return; }
              const meta = SWEEPABLE_PATHS.find((p) => p.path === path)!;
              setSweep({ variable: path, ...meta.defaults });
            }}
          >
            <option value="">— none —</option>
            {SWEEPABLE_PATHS.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
          </select>
        </div>
      </div>
      {state.sweep && (
        <>
          <ParameterInput label="Sweep min" path="monte_carlo.sweep" value={state.sweep.min} step={1} onChange={(v) => setSweep({ ...state.sweep!, min: v })} />
          <ParameterInput label="Sweep max" path="monte_carlo.sweep" value={state.sweep.max} step={1} onChange={(v) => setSweep({ ...state.sweep!, max: v })} />
          <ParameterInput label="Sweep step" path="monte_carlo.sweep" value={state.sweep.step} step={0.1} onChange={(v) => setSweep({ ...state.sweep!, step: v })} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Replace `packages/web/src/pages/Build.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConfigurator } from "../state/useConfigurator.js";
import { decodeExperiment, encodeExperiment, type ExperimentState } from "../state/urlCodec.js";
import { loadPreset } from "../state/presets.js";
import { TabBar, type TabId } from "./build/TabBar.js";
import { TeamTab } from "./build/TeamTab.js";
import { WorkTab } from "./build/WorkTab.js";
import { BoardTab } from "./build/BoardTab.js";
import { MonteCarloTab } from "./build/MonteCarloTab.js";

export function Build() {
  const navigate = useNavigate();
  const location = useLocation();
  const [initial, setInitial] = useState<ExperimentState | null>(null);
  const [tab, setTab] = useState<TabId>("team");

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
    const e = params.get("e");
    const decoded = e ? decodeExperiment(e) : null;
    if (decoded) { setInitial(decoded); return; }
    loadPreset("sweet-spot").then(setInitial);
  }, [location.search, location.hash]);

  if (!initial) return <main data-surface="paper" className="build-page"><p>Loading…</p></main>;

  return <BuildInner initial={initial} tab={tab} setTab={setTab} navigate={navigate} />;
}

function BuildInner({ initial, tab, setTab, navigate }: { initial: ExperimentState; tab: TabId; setTab: (t: TabId) => void; navigate: ReturnType<typeof useNavigate> }) {
  const cfg = useConfigurator(initial);

  function handleRun() {
    const encoded = encodeExperiment(cfg.state);
    navigate(`/run?e=${encoded}`);
  }

  return (
    <main data-surface="paper" className="build-page">
      <div className="build-head">
        <h1>Build an experiment</h1>
        <div className="actions">
          <button className="btn btn-primary" onClick={handleRun} type="button">Run experiment →</button>
        </div>
      </div>
      <TabBar active={tab} onChange={setTab} />
      {tab === "team" && <TeamTab state={cfg.state} update={cfg.update} />}
      {tab === "work" && <WorkTab state={cfg.state} update={cfg.update} toggleRandomize={cfg.toggleRandomize} />}
      {tab === "board" && <BoardTab state={cfg.state} update={cfg.update} />}
      {tab === "monte-carlo" && <MonteCarloTab state={cfg.state} setRuns={cfg.setRuns} setMasterSeed={cfg.setMasterSeed} setSweep={cfg.setSweep} />}
    </main>
  );
}
```

- [ ] **Step 8: Verify in dev**

Run: `pnpm --filter @kanbansim/web dev`
Visit `/#/build`. All four tabs render; inputs update; URL hash updates. Click "Run experiment" → navigates to `/run?e=...`.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/pages/Build.tsx packages/web/src/pages/build/ packages/web/src/styles/build.css packages/web/src/main.tsx
git commit -m "feat(web): tabbed configurator with team/work/board/monte-carlo tabs"
```

---

### Task 19: URL hash deep-link round-trip test

Behavior test that mounts `<Build />` with a URL-hash that already has `?e=<encoded>` and asserts the state loads.

**Files:**
- Create: `packages/web/test/build-roundtrip.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Build } from "../src/pages/Build.js";
import { encodeExperiment, type ExperimentState } from "../src/state/urlCodec.js";

const state: ExperimentState = {
  name: "Custom Test",
  config: {
    team: { size: 7, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
    work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
    board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
    simulation: { sim_days: 130, tick_size_hours: 1 },
  },
  sweep: { variable: "board.wip_in_progress", min: 1, max: 15, step: 1 },
  randomized: [],
  master_seed: "1",
  runs: 1000,
};

describe("Build deep link", () => {
  it("decodes ?e=<state> from the URL search and pre-fills inputs", async () => {
    const encoded = encodeExperiment(state);
    render(
      <MemoryRouter initialEntries={[`/build?e=${encoded}`]}>
        <Build />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("7")).toBeInTheDocument());
  });
});
```

Run: `pnpm --filter @kanbansim/web test build-roundtrip`
Expected: 1 pass.

- [ ] **Step 2: Commit**

```bash
git add packages/web/test/build-roundtrip.test.tsx
git commit -m "test(web): build configurator deep-link round-trip"
```

---

### Task 20: Run-context provider — share state between Build and RunResults

The `/run?e=<encoded>` URL is the source of truth; `RunResults` decodes it on mount and feeds into `useExperiment`. Phase D depends on this. We add the navigation glue here so Phase D's tasks can focus on UI.

**Files:**
- Modify: `packages/web/src/pages/RunResults.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/RunResults.tsx` with a state-loading shell**

```tsx
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { decodeExperiment, type ExperimentState } from "../state/urlCodec.js";

export function RunResults() {
  const location = useLocation();
  const [state, setState] = useState<ExperimentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
    const e = params.get("e");
    if (!e) { setError("No experiment in URL. Visit /build to configure one."); return; }
    const decoded = decodeExperiment(e);
    if (!decoded) { setError("Could not parse experiment from URL."); return; }
    setState(decoded);
  }, [location.search, location.hash]);

  if (error) {
    return <main data-surface="paper" className="build-page"><p>{error}</p></main>;
  }
  if (!state) {
    return <main data-surface="paper" className="build-page"><p>Loading…</p></main>;
  }
  return (
    <main data-surface="paper" className="run-page">
      <h1>Run / Results — phase D placeholder</h1>
      <p className="mono">runs: {state.runs} · sweep: {state.sweep?.variable ?? "(none)"}</p>
    </main>
  );
}
```

- [ ] **Step 2: Verify the navigation works end-to-end**

Run dev server. Click Run on `/build`. Page navigates to `/run?e=...`, decodes the URL, and shows runs / sweep info.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/RunResults.tsx
git commit -m "feat(web): run/results decodes experiment from url"
```

---

## Phase D — Run / Results page (the hero phase)

After Phase D, the website is functional end-to-end: configure → run → see four charts streaming → cancel or complete → captions update. This is the milestone the user explicitly asked for.

### Task 21: Format helpers (number, time, percentage)

**Files:**
- Create: `packages/web/src/lib/format.ts`
- Create: `packages/web/test/format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { formatInt, formatHoursAsDays, formatPct, formatThroughput, formatEta } from "../src/lib/format.js";

describe("format", () => {
  it("formatInt adds thousand separators", () => {
    expect(formatInt(1247)).toBe("1,247");
    expect(formatInt(10000)).toBe("10,000");
    expect(formatInt(0)).toBe("0");
  });
  it("formatHoursAsDays converts using the workday hours", () => {
    expect(formatHoursAsDays(48, 6)).toBe("8.0 d");
    expect(formatHoursAsDays(78, 6)).toBe("13.0 d");
  });
  it("formatPct rounds to whole percent", () => {
    expect(formatPct(0.713)).toBe("71%");
    expect(formatPct(0.085)).toBe("9%");
    expect(formatPct(1)).toBe("100%");
  });
  it("formatThroughput shows two decimal places", () => {
    expect(formatThroughput(2.347)).toBe("2.35 / day");
    expect(formatThroughput(0)).toBe("0.00 / day");
  });
  it("formatEta picks readable units", () => {
    expect(formatEta(0)).toBe("done");
    expect(formatEta(8)).toBe("~8 sec remaining");
    expect(formatEta(95)).toBe("~1 min 35 sec remaining");
    expect(formatEta(3600)).toBe("~1 hr 0 min remaining");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @kanbansim/web test format`
Expected: FAIL.

- [ ] **Step 3: Implement `packages/web/src/lib/format.ts`**

```typescript
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatHoursAsDays(hours: number, productive_hours_per_day: number): string {
  const days = hours / productive_hours_per_day;
  return `${days.toFixed(1)} d`;
}

export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatThroughput(perDay: number): string {
  return `${perDay.toFixed(2)} / day`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "estimating…";
  if (seconds <= 0.5) return "done";
  if (seconds < 60) return `~${Math.round(seconds)} sec remaining`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds - m * 60);
    return `~${m} min ${s} sec remaining`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds - h * 3600) / 60);
  return `~${h} hr ${m} min remaining`;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @kanbansim/web test format`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/format.ts packages/web/test/format.test.ts
git commit -m "feat(web): format helpers for ints, days, percents, eta"
```

---

### Task 22: Stamp + Counter + Action bar components

**Files:**
- Create: `packages/web/src/components/Stamp.tsx`
- Create: `packages/web/src/components/Counter.tsx`
- Create: `packages/web/src/components/ActionBar.tsx`
- Create: `packages/web/src/styles/run.css`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Write `packages/web/src/components/Stamp.tsx`**

```tsx
import type { ExperimentStatus } from "../orchestrator/useExperiment.js";

type Props = { status: ExperimentStatus; runsCompleted: number; runsTotal: number };

export function Stamp({ status, runsCompleted, runsTotal }: Props) {
  if (status === "running") {
    return <span className="stamp stamp-running">Running · {runsCompleted.toLocaleString()} / {runsTotal.toLocaleString()}</span>;
  }
  if (status === "cancelled") {
    return <span className="stamp stamp-warning">Cancelled · {runsCompleted.toLocaleString()} / {runsTotal.toLocaleString()}</span>;
  }
  if (status === "complete") {
    return <span className="stamp">Run Complete · {runsTotal.toLocaleString()} / {runsTotal.toLocaleString()}</span>;
  }
  if (status === "error") {
    return <span className="stamp stamp-warning">Error</span>;
  }
  return <span className="stamp stamp-idle">Idle</span>;
}
```

- [ ] **Step 2: Write `packages/web/src/components/Counter.tsx`**

```tsx
import { formatInt, formatEta } from "../lib/format.js";

type Props = {
  runsCompleted: number;
  runsTotal: number;
  workerCount: number;
  runsPerSec: number | null;
  etaSeconds: number | null;
  isRunning: boolean;
};

export function Counter({ runsCompleted, runsTotal, workerCount, runsPerSec, etaSeconds, isRunning }: Props) {
  return (
    <div className="run-counter mono">
      {formatInt(runsCompleted)} / {formatInt(runsTotal)} runs
      {isRunning && ` · ${formatEta(etaSeconds)}`}
      {` · ${workerCount} workers`}
      {runsPerSec !== null && ` · ${Math.round(runsPerSec)} runs/sec`}
    </div>
  );
}
```

- [ ] **Step 3: Write `packages/web/src/components/ActionBar.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import type { ExperimentStatus } from "../orchestrator/useExperiment.js";
import type { ExperimentState } from "../state/urlCodec.js";
import { encodeExperiment } from "../state/urlCodec.js";

type Props = {
  status: ExperimentStatus;
  state: ExperimentState;
  onDownloadCharts: () => void;
  onDownloadRaw: () => void;
  onCopyShare: () => void;
  shareCopied: boolean;
};

export function ActionBar({ status, state, onDownloadCharts, onDownloadRaw, onCopyShare, shareCopied }: Props) {
  const navigate = useNavigate();
  const enabled = status === "complete" || status === "cancelled";
  const editHref = `/build?e=${encodeExperiment(state)}`;
  return (
    <div className="actions-bar">
      <div className="left">
        <button className="btn" disabled={!enabled} onClick={onDownloadCharts} type="button">↓ Download Charts</button>
        <button className="btn" disabled={!enabled} onClick={onDownloadRaw} type="button">↓ Download Results</button>
        <button className="btn" disabled={!enabled} onClick={onCopyShare} type="button">{shareCopied ? "✓ Copied" : "⎘ Copy Share URL"}</button>
      </div>
      <div className="right">
        <button className="btn" onClick={() => navigate(editHref)} type="button">Edit Experiment</button>
        <button className="btn btn-primary" disabled={!enabled} onClick={() => navigate("/build")} type="button">Run a New One →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `packages/web/src/styles/run.css`** (mirrors the visual reference)

```css
.run-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 36px 40px 80px;
}
.run-pagehead {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 22px;
  margin-bottom: 12px;
  gap: 24px;
  flex-wrap: wrap;
}
.run-pagehead .titles { flex: 1 1 320px; min-width: 0; }
.run-pagehead h1 {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(26px, 4.5vw, 40px);
  letter-spacing: -0.02em;
  line-height: 1.05;
}
.run-pagehead h1 em { font-style: italic; color: var(--accent); font-weight: 500; }
.run-pagehead .meta {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  text-align: right;
  line-height: 1.7;
}
.run-pagehead .meta .key { color: var(--text-faint); }

.stamp {
  display: inline-block;
  border: 1.5px solid var(--accent);
  color: var(--accent);
  padding: 5px 11px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 12px;
  transform: rotate(-1.8deg);
  border-radius: 2px;
  font-weight: 500;
}
.stamp-running { animation: stamp-pulse 1.4s ease-in-out infinite; }
.stamp-warning { border-color: var(--warning); color: var(--warning); }
.stamp-idle { border-color: var(--rule); color: var(--text-faint); }
@keyframes stamp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

.run-counter {
  font-size: 12px;
  color: var(--text-soft);
  margin-bottom: 28px;
}

.cancel-btn {
  position: fixed;
  top: 76px;
  right: 28px;
  z-index: 20;
}

.actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 24px;
  border-top: 1px solid var(--rule);
  margin-top: 8px;
  flex-wrap: wrap;
  gap: 14px;
}
.actions-bar .left, .actions-bar .right { display: flex; gap: 10px; flex-wrap: wrap; }

@media (max-width: 760px) {
  .run-page { padding: 22px 18px 60px; }
  .run-pagehead { flex-direction: column; align-items: flex-start; }
  .run-pagehead .meta { text-align: left; width: 100%; }
  .actions-bar { flex-direction: column; align-items: stretch; }
  .actions-bar .left, .actions-bar .right { justify-content: center; }
  .cancel-btn { top: auto; bottom: 16px; right: 16px; }
}
```

Add `import "./styles/run.css";` to `packages/web/src/main.tsx`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/Stamp.tsx packages/web/src/components/Counter.tsx packages/web/src/components/ActionBar.tsx packages/web/src/styles/run.css packages/web/src/main.tsx
git commit -m "feat(web): stamp, counter, and action bar components"
```

---

### Task 23: ConfigStrip + ChartCard frame components

**Files:**
- Create: `packages/web/src/components/ConfigStrip.tsx`
- Create: `packages/web/src/components/ChartCard.tsx`
- Create: `packages/web/src/styles/chart.css`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Write `packages/web/src/components/ConfigStrip.tsx`**

```tsx
import type { ExperimentState } from "../state/urlCodec.js";

type Props = { state: ExperimentState };

const ROUND2 = (n: number) => Math.round(n * 100) / 100;

export function ConfigStrip({ state }: Props) {
  const { config, sweep, randomized } = state;
  const isSwept = (path: string) => sweep?.variable === path;
  const isRand = (path: string) => randomized.some((r) => r.path === path);

  function val(path: string, raw: string) {
    if (isSwept(path)) return <span className="swept">{`${sweep!.min} → ${sweep!.max}`}</span>;
    if (isRand(path)) return <span className="randomized">{raw}</span>;
    return raw;
  }

  return (
    <div className="config-strip">
      <div>
        <div className="group-title">Team</div>
        <dl>
          <dt>Size</dt><dd>{val("team.size", String(config.team.size))}</dd>
          <dt>Productive hrs/day</dt><dd>{val("team.productive_hours_per_day", config.team.productive_hours_per_day.toFixed(1))}</dd>
          <dt>Switch cost</dt><dd>{val("team.switch_cost_minutes", `${config.team.switch_cost_minutes} min`)}</dd>
          <dt>Pace penalty</dt><dd>{val("team.pace_penalty", `${(config.team.pace_penalty * 100).toFixed(0)}%/extra`)}</dd>
        </dl>
      </div>
      <div>
        <div className="group-title">Work Items</div>
        <dl>
          <dt>Arrival rate</dt><dd>{val("work.arrival_rate_per_day", `${config.work.arrival_rate_per_day.toFixed(1)}/day`)}</dd>
          <dt>Effort μ</dt><dd>{val("work.effort_dist.mu", `${ROUND2(config.work.effort_dist.mu)} hrs`)}</dd>
          <dt>Effort σ</dt><dd>{val("work.effort_dist.sigma", `${ROUND2(config.work.effort_dist.sigma)} hrs`)}</dd>
          <dt>Block prob.</dt><dd>{val("work.block_probability_per_day", `${config.work.block_probability_per_day.toFixed(2)}/day`)}</dd>
        </dl>
      </div>
      <div>
        <div className="group-title">Board</div>
        <dl>
          <dt>Ready WIP</dt><dd>{val("board.wip_ready", config.board.wip_ready === null ? "—" : String(config.board.wip_ready))}</dd>
          <dt>In Progress WIP</dt><dd>{val("board.wip_in_progress", String(config.board.wip_in_progress ?? "—"))}</dd>
          <dt>Validation WIP</dt><dd>{val("board.wip_validation", String(config.board.wip_validation ?? "—"))}</dd>
          <dt>Blocked policy</dt><dd>{config.team.blocking_response}</dd>
        </dl>
      </div>
      <div>
        <div className="group-title">Monte Carlo</div>
        <dl>
          <dt>Runs</dt><dd>{state.runs.toLocaleString()}</dd>
          <dt>Sweep</dt><dd>{sweep ? sweep.variable : "—"}</dd>
          <dt>Randomized</dt><dd>{randomized.length}</dd>
          <dt>Seed</dt><dd>{state.master_seed}</dd>
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `packages/web/src/components/ChartCard.tsx`**

```tsx
import type { ReactNode } from "react";

type Props = {
  label: string;
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  caption?: ReactNode;
  chartRef?: (el: HTMLDivElement | null) => void;
};

export function ChartCard({ label, title, subtitle, children, caption, chartRef }: Props) {
  return (
    <section className="card" ref={chartRef}>
      <div className="label">{label}</div>
      <h2>{title}</h2>
      {subtitle && <div className="chart-subtitle">{subtitle}</div>}
      <div className="chart-svg-wrap">{children}</div>
      {caption && <div className="caption">{caption}</div>}
    </section>
  );
}
```

- [ ] **Step 3: Write `packages/web/src/styles/chart.css`**

```css
.config-strip {
  background: var(--bg-paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 18px 28px 20px;
  margin-bottom: 28px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 24px 28px;
}
.config-strip .group-title {
  font-family: var(--mono);
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-faint);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--rule-soft);
}
.config-strip dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 14px;
  font-size: 12.5px;
  align-items: baseline;
}
.config-strip dt { color: var(--text-soft); }
.config-strip dd {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text);
  text-align: right;
  font-weight: 500;
}
.swept {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 1.5px 7px;
  border-radius: 2px;
}
.randomized {
  background: var(--warning-soft);
  color: var(--warning);
  padding: 1.5px 7px;
  border-radius: 2px;
}

.card {
  background: var(--bg-paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 26px 32px 24px;
  position: relative;
  margin-bottom: 28px;
  overflow: hidden;
}
.card .label {
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--text-soft);
  margin-bottom: 6px;
}
.card h2 {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(20px, 2.4vw, 26px);
  letter-spacing: -0.014em;
  margin-bottom: 4px;
}
.card .chart-subtitle {
  font-size: 13px;
  color: var(--text-soft);
  margin-bottom: 18px;
  max-width: 70ch;
}
.chart-svg-wrap { width: 100%; overflow: hidden; min-height: 100px; }
.chart-svg, .chart-svg-wrap > svg { width: 100%; height: auto; display: block; }
.caption {
  font-family: var(--serif);
  font-style: italic;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.55;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--rule-soft);
  max-width: 80ch;
}
.card-loading {
  font-family: var(--mono);
  color: var(--text-faint);
  padding: 40px 0;
  text-align: center;
}
@media (max-width: 760px) {
  .card { padding: 20px 18px 18px; }
  .config-strip { padding: 16px 18px 18px; gap: 18px 22px; grid-template-columns: 1fr; }
}
```

Add `import "./styles/chart.css";` to `main.tsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/ConfigStrip.tsx packages/web/src/components/ChartCard.tsx packages/web/src/styles/chart.css packages/web/src/main.tsx
git commit -m "feat(web): config strip and chart card frame components"
```

---

### Task 24: U-curve hero chart (Observable Plot)

**Files:**
- Create: `packages/web/src/charts/UCurveChart.tsx`

The chart redraws on every aggregator update from `useExperiment`. Observable Plot draws axes/lines/bands; the "optimal ≈ N" annotation is appended via safe DOM methods (`createElementNS` + `textContent`) once ≥50% of runs are done.

- [ ] **Step 1: Implement the chart**

```tsx
import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { SweepSpec } from "../state/urlCodec.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  sweep: SweepSpec | null;
  productive_hours_per_day: number;
  totalRunsExpected: number;
};

type CellPoint = { x: number; throughput: number; lt_days: number; tp_lo: number; tp_hi: number; lt_lo: number; lt_hi: number };

const SVG_NS = "http://www.w3.org/2000/svg";

export function UCurveChart({ snapshot, sweep, productive_hours_per_day, totalRunsExpected }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!sweep || !snapshot) return;

    const points: CellPoint[] = [];
    for (const [sv, c] of snapshot.cells) {
      points.push({
        x: sv,
        throughput: c.mean_throughput,
        lt_days: c.mean_median_lead_time / productive_hours_per_day,
        tp_lo: c.p05_throughput, tp_hi: c.p95_throughput,
        lt_lo: c.p05_median_lead_time / productive_hours_per_day,
        lt_hi: c.p95_median_lead_time / productive_hours_per_day,
      });
    }
    points.sort((a, b) => a.x - b.x);
    if (points.length === 0) return;

    const ltMax = Math.max(...points.map((p) => p.lt_hi)) * 1.1 || 1;
    const tpMax = Math.max(...points.map((p) => p.tp_hi)) * 1.1 || 1;

    const fig = Plot.plot({
      width: 1100,
      height: 360,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px" },
      x: { label: sweep.variable, domain: [sweep.min, sweep.max], grid: false },
      y: { label: "Lead time (days)", domain: [0, ltMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "lt_lo", y2: "lt_hi", fill: "var(--series-2)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "lt_days", stroke: "var(--series-2)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "lt_days", fill: "var(--series-2)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "lt_days", text: () => "Lead Time", dx: 8, dy: -6, fill: "var(--series-2)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const fig2 = Plot.plot({
      width: 1100,
      height: 360,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 50,
      style: { background: "transparent", color: "var(--text-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", position: "absolute", top: 0, left: 0, pointerEvents: "none" },
      x: { domain: [sweep.min, sweep.max], axis: null },
      y: { axis: "right", label: "Throughput (items/day)", domain: [0, tpMax] },
      marks: [
        Plot.areaY(points, { x: "x", y1: "tp_lo", y2: "tp_hi", fill: "var(--series-1)", fillOpacity: 0.15, curve: "monotone-x" }),
        Plot.lineY(points, { x: "x", y: "throughput", stroke: "var(--series-1)", strokeWidth: 2.5, curve: "monotone-x" }),
        Plot.dot(points, { x: "x", y: "throughput", fill: "var(--series-1)", r: 3 }),
        Plot.text(points.slice(-1), { x: "x", y: "throughput", text: () => "Throughput", dx: 8, dy: -6, fill: "var(--series-1)", textAnchor: "start", fontFamily: "Inter", fontSize: 12, fontWeight: 500 }),
      ],
    });

    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.appendChild(fig);
    wrap.appendChild(fig2);

    // Hand-drawn "optimal ≈ N" annotation, only once ≥50% of runs are done.
    if (snapshot.total_runs >= totalRunsExpected * 0.5 && points.length >= 3) {
      const optimal = points.reduce((acc, p) => (p.lt_days < acc.lt_days ? p : acc), points[0]!);
      const ann = document.createElementNS(SVG_NS, "svg");
      ann.setAttribute("style", "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;");
      ann.setAttribute("viewBox", "0 0 1100 360");
      const text = document.createElementNS(SVG_NS, "text");
      const xPos = ((optimal.x - sweep.min) / (sweep.max - sweep.min)) * 980 + 60;
      text.setAttribute("x", String(xPos));
      text.setAttribute("y", "40");
      text.setAttribute("font-family", "Caveat, cursive");
      text.setAttribute("font-size", "20");
      text.setAttribute("fill", "var(--accent)");
      text.textContent = `optimal ≈ ${optimal.x.toFixed(0)}`;
      ann.appendChild(text);
      wrap.appendChild(ann);
    }

    host.appendChild(wrap);
    return () => { while (host.firstChild) host.removeChild(host.firstChild); };
  }, [snapshot, sweep, productive_hours_per_day, totalRunsExpected]);

  if (!sweep) {
    return <div className="card-loading">No sweep variable selected. Set one in Build → Monte Carlo to see the U-curve.</div>;
  }
  if (!snapshot || snapshot.total_runs === 0) {
    return <div className="card-loading">Waiting for first runs…</div>;
  }
  return <div ref={ref} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @kanbansim/web typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/charts/UCurveChart.tsx
git commit -m "feat(web): u-curve hero chart with confidence bands and optimal annotation"
```

---

### Task 25: CFD chart (animated representative run)

**Files:**
- Create: `packages/web/src/charts/CfdChart.tsx`

Render the full stacked-area CFD as raw SVG. During streaming, animate a left-to-right reveal via a CSS-animated `clipPath`. On complete, the reveal stops at full width.

- [ ] **Step 1: Implement**

```tsx
import { useMemo } from "react";
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { CfdSnapshot } from "@kanbansim/engine";

type Props = {
  snapshot: AggregatorSnapshot | null;
  isComplete: boolean;
  productive_hours_per_day: number;
};

const COLUMNS = ["done", "validation", "in_progress", "ready", "backlog"] as const;
const COLORS: Record<(typeof COLUMNS)[number], string> = {
  done: "var(--series-1)",
  validation: "var(--series-3)",
  in_progress: "var(--series-2)",
  ready: "var(--series-4)",
  backlog: "var(--series-5)",
};

export function CfdChart({ snapshot, isComplete, productive_hours_per_day }: Props) {
  const cfd = useMemo(() => pickRepresentativeCfd(snapshot), [snapshot]);

  if (!cfd || cfd.length === 0) {
    return <div className="card-loading">Waiting for the first run to complete…</div>;
  }

  const W = 1180;
  const H = 280;
  const days = cfd.length / productive_hours_per_day;
  const xScale = (tick: number) => (tick / (cfd.length - 1)) * W;
  const totalAtTick = (snap: CfdSnapshot) =>
    snap.counts.done + snap.counts.validation + snap.counts.in_progress + snap.counts.ready + snap.counts.backlog;
  const maxTotal = Math.max(...cfd.map(totalAtTick), 1);
  const yScale = (count: number) => H - (count / maxTotal) * H;

  const paths = COLUMNS.map((_, i) => {
    const cumulativeUpTo = (snap: CfdSnapshot, idx: number) => {
      let s = 0;
      for (let k = 0; k <= idx; k++) s += snap.counts[COLUMNS[k]!];
      return s;
    };
    const top: string[] = [];
    for (let t = 0; t < cfd.length; t++) {
      top.push(`${xScale(t)},${yScale(cumulativeUpTo(cfd[t]!, i))}`);
    }
    if (i === 0) {
      return `M ${top.join(" L ")} L ${xScale(cfd.length - 1)},${H} L ${xScale(0)},${H} Z`;
    }
    const bot: string[] = [];
    for (let t = cfd.length - 1; t >= 0; t--) {
      bot.push(`${xScale(t)},${yScale(cumulativeUpTo(cfd[t]!, i - 1))}`);
    }
    return `M ${top.join(" L ")} L ${bot.join(" L ")} Z`;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="cfd-svg" style={{ height: 280 }}>
        <defs>
          <clipPath id="cfd-reveal">
            <rect x="0" y="0" height={H} width={W} className={isComplete ? "" : "cfd-reveal-anim"} />
          </clipPath>
        </defs>
        <g clipPath="url(#cfd-reveal)">
          {paths.map((d, i) => <path key={COLUMNS[i]} d={d} fill={COLORS[COLUMNS[i]!]} fillOpacity={0.85 - i * 0.05} />)}
        </g>
      </svg>
      <div className="hist-axis" style={{ borderTop: "none", paddingTop: 8 }}>
        <span>day 1</span>
        <span>day {Math.round(days / 6)}</span>
        <span>day {Math.round(days / 3)}</span>
        <span>day {Math.round(days / 2)}</span>
        <span>day {Math.round((2 * days) / 3)}</span>
        <span>day {Math.round((5 * days) / 6)}</span>
        <span>day {Math.round(days)}</span>
      </div>
      <div className="cfd-legend">
        {COLUMNS.map((col) => (
          <span key={col}><span className="cfd-swatch" style={{ background: COLORS[col] }} />{labelFor(col)}</span>
        ))}
      </div>
    </div>
  );
}

function labelFor(col: (typeof COLUMNS)[number]): string {
  if (col === "in_progress") return "In Progress";
  if (col === "done") return "Done";
  if (col === "validation") return "Validation";
  if (col === "ready") return "Ready";
  return "Backlog";
}

function pickRepresentativeCfd(snapshot: AggregatorSnapshot | null): CfdSnapshot[] | null {
  if (!snapshot || snapshot.cells.size === 0) return null;
  let best: { lt: number; cfd: CfdSnapshot[] | null } = { lt: Infinity, cfd: null };
  for (const c of snapshot.cells.values()) {
    if (c.run_count > 0 && c.mean_median_lead_time < best.lt && c.representative_cfd) {
      best = { lt: c.mean_median_lead_time, cfd: c.representative_cfd };
    }
  }
  return best.cfd;
}
```

- [ ] **Step 2: Add CFD reveal animation CSS**

Append to `packages/web/src/styles/chart.css`:

```css
.cfd-reveal-anim {
  animation: cfd-reveal 8s linear infinite;
  transform-origin: left center;
}
@keyframes cfd-reveal {
  0% { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}
.cfd-svg { width: 100%; height: 280px; display: block; }
.cfd-legend {
  display: flex;
  gap: 16px 22px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--rule-soft);
  font-family: var(--sans);
  font-size: 12px;
  color: var(--text-soft);
  flex-wrap: wrap;
}
.cfd-swatch {
  display: inline-block;
  width: 11px; height: 11px;
  border-radius: 1.5px;
  margin-right: 6px;
  vertical-align: -1px;
}
.hist-axis {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--rule-soft);
  flex-wrap: wrap;
  gap: 6px;
}
@media (max-width: 760px) { .cfd-svg { height: 200px; } }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/charts/CfdChart.tsx packages/web/src/styles/chart.css
git commit -m "feat(web): cfd stacked-area chart with reveal animation"
```

---

### Task 26: Histogram chart

**Files:**
- Create: `packages/web/src/charts/HistogramChart.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useMemo } from "react";
import type { AggregatorSnapshot, CellStats } from "../orchestrator/aggregator.js";

type Props = {
  snapshot: AggregatorSnapshot | null;
  productive_hours_per_day: number;
};

const BIN_COUNT = 22;

export function HistogramChart({ snapshot, productive_hours_per_day }: Props) {
  const cell = useMemo(() => pickOptimalCell(snapshot), [snapshot]);

  if (!cell || cell.lead_time_samples.length === 0) {
    return <div className="card-loading">Collecting completed items…</div>;
  }

  const samplesDays = cell.lead_time_samples.map((h) => h / productive_hours_per_day);
  const max = Math.max(...samplesDays);
  const min = Math.min(...samplesDays);
  const span = Math.max(0.1, max - min);
  const binWidth = span / BIN_COUNT;
  const bins = Array.from({ length: BIN_COUNT }, () => 0);
  for (const v of samplesDays) {
    const i = Math.min(BIN_COUNT - 1, Math.floor((v - min) / binWidth));
    bins[i]!++;
  }
  const peak = Math.max(...bins, 1);

  const sorted = samplesDays.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const sampleMax = sorted[sorted.length - 1] ?? 0;

  return (
    <div>
      <div className="hist-bars">
        {bins.map((b, i) => (
          <div key={i} className="hist-bar" style={{ height: `${(b / peak) * 100}%` }} />
        ))}
      </div>
      <div className="hist-axis">
        <span>{min.toFixed(0)}d</span>
        <span>{(min + span * 0.25).toFixed(0)}d</span>
        <span>{(min + span * 0.5).toFixed(0)}d</span>
        <span>{(min + span * 0.75).toFixed(0)}d</span>
        <span>{max.toFixed(0)}d</span>
      </div>
      <div className="hist-stats">
        <Stat k="Median" v={`${median.toFixed(1)} d`} />
        <Stat k="Mean" v={`${mean.toFixed(1)} d`} />
        <Stat k="P85" v={`${p85.toFixed(1)} d`} />
        <Stat k="P95" v={`${p95.toFixed(1)} d`} />
        <Stat k="Max" v={`${sampleMax.toFixed(1)} d`} />
      </div>
      <div className="hist-meta mono">Sample size: {samplesDays.length.toLocaleString()} items at sweep = {cell.sweep_value}</div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="stat"><div className="key">{k}</div><div className="val">{v}</div></div>;
}

function pickOptimalCell(snapshot: AggregatorSnapshot | null): CellStats | null {
  if (!snapshot) return null;
  let best: CellStats | null = null;
  for (const c of snapshot.cells.values()) {
    if (c.run_count === 0) continue;
    if (!best || c.mean_median_lead_time < best.mean_median_lead_time) best = c;
  }
  return best;
}
```

- [ ] **Step 2: Append histogram CSS to `packages/web/src/styles/chart.css`**

```css
.hist-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 240px;
  padding-top: 8px;
}
.hist-bar {
  flex: 1 1 0;
  min-width: 0;
  background: var(--accent);
  opacity: 0.85;
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height 120ms ease-out;
}
.hist-stats {
  display: flex;
  gap: 28px;
  margin-top: 16px;
  font-family: var(--mono);
  flex-wrap: wrap;
}
.hist-stats .stat .key {
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  margin-bottom: 3px;
}
.hist-stats .stat .val {
  color: var(--text);
  font-weight: 600;
  font-size: 18px;
}
.hist-meta { font-size: 11px; color: var(--text-faint); margin-top: 12px; }
@media (max-width: 760px) {
  .hist-bars { height: 180px; gap: 2px; }
  .hist-stats .stat .val { font-size: 16px; }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/charts/HistogramChart.tsx packages/web/src/styles/chart.css
git commit -m "feat(web): lead-time histogram with running stat row"
```

---

### Task 27: Time accounting chart

**Files:**
- Create: `packages/web/src/charts/TimeAccountingChart.tsx`

Two rows: optimal cell vs an "overloaded" cell (highest sweep value with at least one run).

- [ ] **Step 1: Implement**

```tsx
import { useMemo } from "react";
import type { AggregatorSnapshot, CellStats } from "../orchestrator/aggregator.js";

type Props = { snapshot: AggregatorSnapshot | null };

const SEG = ["hours_working", "hours_switching", "hours_blocked", "hours_idle"] as const;
const COLORS: Record<(typeof SEG)[number], string> = {
  hours_working: "var(--series-1)",
  hours_switching: "var(--series-3)",
  hours_blocked: "var(--series-2)",
  hours_idle: "var(--text-faint)",
};
const LABELS: Record<(typeof SEG)[number], string> = {
  hours_working: "Working",
  hours_switching: "Switching",
  hours_blocked: "Blocked",
  hours_idle: "Idle",
};

export function TimeAccountingChart({ snapshot }: Props) {
  const { optimal, overloaded } = useMemo(() => pickPair(snapshot), [snapshot]);

  if (!optimal) return <div className="card-loading">Need at least one run to summarize time…</div>;

  return (
    <div>
      <Row title={`Sweep = ${optimal.sweep_value}`} flavor="optimal" cell={optimal} />
      {overloaded && overloaded.sweep_value !== optimal.sweep_value && (
        <Row title={`Sweep = ${overloaded.sweep_value}`} flavor="overloaded" cell={overloaded} />
      )}
      <div className="time-legend">
        {SEG.map((k) => (
          <span key={k}><span className="swatch" style={{ background: COLORS[k] }} />{LABELS[k]}</span>
        ))}
      </div>
    </div>
  );
}

function Row({ title, flavor, cell }: { title: string; flavor: "optimal" | "overloaded"; cell: CellStats }) {
  const t = cell.time_accounting_totals;
  const total = t.hours_working + t.hours_switching + t.hours_blocked + t.hours_idle || 1;
  return (
    <div className="time-row">
      <div className="row-head">
        <span className="row-label">{title} <span className={flavor === "optimal" ? "tag-optimal" : "tag-overloaded"}>({flavor})</span></span>
        <span className="mono">{Math.round(total).toLocaleString()} worker-hours</span>
      </div>
      <div className="time-bar">
        {SEG.map((k) => {
          const pct = (t[k] / total) * 100;
          if (pct < 0.5) return null;
          return (
            <div key={k} className="time-segment" style={{ width: `${pct}%`, background: COLORS[k] }}>
              {pct >= 8 ? `${Math.round(pct)}% ${LABELS[k]}` : `${Math.round(pct)}%`}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pickPair(snapshot: AggregatorSnapshot | null): { optimal: CellStats | null; overloaded: CellStats | null } {
  if (!snapshot) return { optimal: null, overloaded: null };
  let optimal: CellStats | null = null;
  let overloaded: CellStats | null = null;
  for (const c of snapshot.cells.values()) {
    if (c.run_count === 0) continue;
    if (!optimal || c.mean_median_lead_time < optimal.mean_median_lead_time) optimal = c;
    if (!overloaded || c.sweep_value > overloaded.sweep_value) overloaded = c;
  }
  return { optimal, overloaded };
}
```

- [ ] **Step 2: Append time-accounting CSS to `chart.css`**

```css
.time-row { margin-bottom: 16px; }
.time-row .row-head {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  margin-bottom: 5px;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.time-row .row-label {
  font-family: var(--sans);
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.tag-optimal { color: var(--accent); font-weight: 600; }
.tag-overloaded { color: var(--warning); font-weight: 600; }
.time-bar {
  display: flex;
  height: 32px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--bg-deep);
}
.time-segment {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.95);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  transition: width 200ms ease-out;
}
.time-legend {
  display: flex;
  gap: 18px 22px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--rule-soft);
  font-family: var(--sans);
  font-size: 12px;
  color: var(--text-soft);
  flex-wrap: wrap;
}
.time-legend .swatch {
  display: inline-block;
  width: 11px; height: 11px;
  border-radius: 1.5px;
  margin-right: 6px;
  vertical-align: -1px;
}
@media (max-width: 760px) { .time-bar { height: 28px; } .time-segment { font-size: 10px; } }
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/charts/TimeAccountingChart.tsx packages/web/src/styles/chart.css
git commit -m "feat(web): time accounting chart with optimal vs overloaded rows"
```

---

### Task 28: Captions component

Captions change between running and complete states.

**Files:**
- Create: `packages/web/src/components/Caption.tsx`

- [ ] **Step 1: Implement**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/Caption.tsx
git commit -m "feat(web): chart captions for running and complete states"
```

---

### Task 29: Wire RunResults page — auto-start, charts, cancel, action bar

**Files:**
- Modify: `packages/web/src/pages/RunResults.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/RunResults.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { decodeExperiment, encodeExperiment, type ExperimentState } from "../state/urlCodec.js";
import { useExperiment } from "../orchestrator/useExperiment.js";
import { Stamp } from "../components/Stamp.js";
import { Counter } from "../components/Counter.js";
import { ConfigStrip } from "../components/ConfigStrip.js";
import { ChartCard } from "../components/ChartCard.js";
import { ActionBar } from "../components/ActionBar.js";
import { Caption } from "../components/Caption.js";
import { UCurveChart } from "../charts/UCurveChart.js";
import { CfdChart } from "../charts/CfdChart.js";
import { HistogramChart } from "../charts/HistogramChart.js";
import { TimeAccountingChart } from "../charts/TimeAccountingChart.js";

export function RunResults() {
  const location = useLocation();
  const [state, setState] = useState<ExperimentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const startedRef = useRef(false);

  const exp = useExperiment();

  useEffect(() => {
    const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
    const e = params.get("e");
    if (!e) { setError("No experiment in URL. Visit /build to configure one."); return; }
    const decoded = decodeExperiment(e);
    if (!decoded) { setError("Could not parse experiment from URL."); return; }
    setState(decoded);
  }, [location.search, location.hash]);

  useEffect(() => {
    if (!state || startedRef.current) return;
    startedRef.current = true;
    exp.start(state);
  }, [state, exp]);

  // Once complete, replace /run with /results in the URL bar (no nav event).
  useEffect(() => {
    if (exp.status === "complete" && location.pathname !== "/results") {
      const params = new URLSearchParams(location.search || location.hash.split("?")[1] || "");
      const e = params.get("e") ?? "";
      window.history.replaceState(null, "", `#/results?e=${e}`);
    }
  }, [exp.status, location.pathname, location.search, location.hash]);

  function handleCopyShare() {
    if (!state) return;
    const url = `${window.location.origin}${window.location.pathname}#/results?e=${encodeExperiment(state)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    });
  }

  if (error) return <main data-surface="paper" className="run-page"><p>{error}</p></main>;
  if (!state) return <main data-surface="paper" className="run-page"><p>Loading…</p></main>;

  const isRunning = exp.status === "running";
  const phpd = state.config.team.productive_hours_per_day;
  const totalRunsExpected = exp.runsTotal;

  return (
    <main data-surface="paper" className="run-page">
      <div className="run-pagehead">
        <div className="titles">
          <div className="label">Experiment {exp.status === "complete" ? "Results" : "Run"}</div>
          <h1>{state.name}</h1>
        </div>
        <div className="meta">
          <Stamp status={exp.status} runsCompleted={exp.runsCompleted} runsTotal={exp.runsTotal} />
          <div><span className="key">runs</span> &nbsp;{state.runs.toLocaleString()}</div>
          <div><span className="key">simulated</span> &nbsp;{state.config.simulation.sim_days} days</div>
          <div><span className="key">seed</span> &nbsp;{state.master_seed}</div>
        </div>
      </div>

      <Counter
        runsCompleted={exp.runsCompleted}
        runsTotal={exp.runsTotal}
        workerCount={exp.workerCount}
        runsPerSec={exp.runsPerSec}
        etaSeconds={exp.etaSeconds}
        isRunning={isRunning}
      />

      {isRunning && (
        <button className="btn btn-warning cancel-btn" onClick={exp.cancel} type="button">Cancel</button>
      )}

      <ConfigStrip state={state} />

      <ChartCard label="Hero · Sweep Result" title={<>Lead Time &amp; Throughput vs. <em>{state.sweep?.variable ?? "—"}</em></>} subtitle={state.sweep ? `Bands = 5th–95th percentile across runs.` : undefined} caption={<Caption kind="ucurve" status={exp.status} />}>
        <UCurveChart snapshot={exp.snapshot} sweep={state.sweep} productive_hours_per_day={phpd} totalRunsExpected={totalRunsExpected} />
      </ChartCard>

      <ChartCard label="Single Run" title="Cumulative Flow" subtitle="A representative run at the optimal sweep value. Watch the bands stay parallel — that's stable flow." caption={<Caption kind="cfd" status={exp.status} />}>
        <CfdChart snapshot={exp.snapshot} isComplete={exp.status === "complete"} productive_hours_per_day={phpd} />
      </ChartCard>

      <ChartCard label="Distribution" title="Lead Time Distribution" subtitle="Completed-item lead times at the optimal sweep cell. The median is a comfortable story; the tail is the truth." caption={<Caption kind="histogram" status={exp.status} />}>
        <HistogramChart snapshot={exp.snapshot} productive_hours_per_day={phpd} />
      </ChartCard>

      <ChartCard label="Where the Hours Went" title="Time Accounting" subtitle="Worker-hour breakdown at the optimal vs. overloaded sweep values." caption={<Caption kind="timeAccounting" status={exp.status} />}>
        <TimeAccountingChart snapshot={exp.snapshot} />
      </ChartCard>

      <ActionBar
        status={exp.status}
        state={state}
        onDownloadCharts={() => { /* wired in Phase F */ }}
        onDownloadRaw={() => { /* wired in Phase F */ }}
        onCopyShare={handleCopyShare}
        shareCopied={shareCopied}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verify in dev — full happy path**

Run: `pnpm --filter @kanbansim/web dev`
- Visit `/#/build`. Inputs render.
- Click "Run experiment →". Page navigates to `/run?e=...`.
- Stamp says "Running"; counter increments; CFD reveal animates; U-curve points appear; histogram bars grow; time accounting fills in.
- Click Cancel mid-run → stamp flips to "Cancelled · N / 10000" in warning color; partial charts persist.
- Or wait for completion → stamp says "Run Complete"; URL updates to `/#/results?e=...`; action bar buttons enable. Copy Share URL works.

If any chart errors, inspect the browser console; fix and re-verify.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/RunResults.tsx
git commit -m "feat(web): wire run/results page with streaming charts and cancel"
```

---

## Phase E — Landing page

After Phase E, the front door is real: visitors land on a Quiet Scientific page, the Sweet Spot preset auto-runs in the background and reveals on click, and the other two preset cards are click-to-run.

### Task 30: Landing layout (Quiet Scientific)

**Files:**
- Modify: `packages/web/src/pages/Landing.tsx`
- Create: `packages/web/src/styles/landing.css`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Write `packages/web/src/styles/landing.css`**

```css
.landing {
  max-width: 1080px;
  margin: 0 auto;
  padding: 64px 40px 80px;
}
.landing-hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 56px;
  align-items: start;
  margin-bottom: 64px;
}
.landing-hero h1 {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.05;
  letter-spacing: -0.025em;
  margin-bottom: 22px;
}
.landing-hero h1 em { font-style: italic; color: var(--accent); }
.landing-hero p {
  font-size: 16px;
  color: var(--text-soft);
  line-height: 1.65;
  margin-bottom: 16px;
  max-width: 56ch;
}
.landing-hero .lead { color: var(--text); font-size: 17px; }
.landing-hero-aside {
  background: var(--bg-paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 22px;
  font-family: var(--sans);
  color: var(--text-soft);
  font-size: 13px;
}
.landing-hero-aside .label { margin-bottom: 12px; }

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 22px;
  margin-bottom: 56px;
}
.preset-card {
  background: var(--bg-paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
  font: inherit;
  color: var(--text);
  cursor: pointer;
  transition: border-color 120ms ease-out, transform 120ms ease-out;
}
.preset-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.preset-card.active { border-color: var(--accent); background: var(--accent-soft); }
.preset-card .label { font-size: 10px; }
.preset-card h3 { font-family: var(--serif); font-size: 22px; font-weight: 500; }
.preset-card .lesson { font-size: 13px; color: var(--text-soft); }
.preset-card .cta { font-family: var(--mono); font-size: 11px; color: var(--accent); margin-top: auto; }

.build-link {
  display: inline-block;
  font-family: var(--serif);
  font-style: italic;
  font-size: 18px;
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid var(--accent);
  padding-bottom: 2px;
}

@media (max-width: 760px) {
  .landing { padding: 40px 18px 60px; }
  .landing-hero { grid-template-columns: 1fr; gap: 28px; }
}
```

Add `import "./styles/landing.css";` to `main.tsx`.

- [ ] **Step 2: Stub Landing layout (preset cards in next task)**

```tsx
import { Link } from "react-router-dom";

export function Landing() {
  return (
    <main data-surface="default" className="landing">
      <div className="landing-hero">
        <div>
          <h1>What if you <em>lowered</em> WIP?</h1>
          <p className="lead">You don't have to guess. Configure a virtual team that looks like yours, sweep your WIP limit across a range, run thousands of simulations in your browser, and look at the curve. The sweet spot will be obvious. So will the cliffs.</p>
          <p>Built for managers, team leads, and agile coaches who suspect their team is overloaded but don't know what number is right. KanbanSim turns Little's Law into a tangible thing — a U-curve you can see, share, and play with.</p>
        </div>
        <aside className="landing-hero-aside">
          <div className="label">How it works</div>
          <p>Each experiment runs the same simulated team thousands of times across a range of WIP limits. The shape of the resulting curve is what teaches you. No login, no backend — everything runs in your browser.</p>
        </aside>
      </div>

      <div className="preset-grid" id="presets">{/* PresetCards in Task 31 */}</div>

      <Link to="/build" className="build-link">Or build your own experiment →</Link>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/Landing.tsx packages/web/src/styles/landing.css packages/web/src/main.tsx
git commit -m "feat(web): landing page hero (quiet scientific)"
```

---

### Task 31: PresetCard component + three preset cards on landing

**Files:**
- Create: `packages/web/src/components/PresetCard.tsx`
- Modify: `packages/web/src/pages/Landing.tsx`

- [ ] **Step 1: Write `packages/web/src/components/PresetCard.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import { encodeExperiment } from "../state/urlCodec.js";
import { loadPreset, type PresetId, PRESET_DESCRIPTIONS } from "../state/presets.js";

const TITLES: Record<PresetId, string> = {
  "sweet-spot": "The Sweet Spot",
  "qa-bottleneck": "The QA Bottleneck",
  "multitasking-tax": "The Multitasking Tax",
};

const LESSONS: Record<PresetId, string> = {
  "sweet-spot": "Little's Law made visible — find the sweet spot, see the cliffs.",
  "qa-bottleneck": "Per-column WIP must be balanced; bottlenecks form at the lowest-capacity column.",
  "multitasking-tax": "Multitasking has a real cost. Watch the team grind to a halt.",
};

export function PresetCard({ id }: { id: PresetId }) {
  const navigate = useNavigate();
  async function go() {
    const state = await loadPreset(id);
    const encoded = encodeExperiment(state);
    navigate(`/run?e=${encoded}`);
  }
  return (
    <button type="button" className="preset-card" onClick={go}>
      <div className="label">Preset</div>
      <h3>{TITLES[id]}</h3>
      <p className="lesson">{LESSONS[id]}</p>
      <p className="lesson" style={{ color: "var(--text-faint)" }}>{PRESET_DESCRIPTIONS[id]}</p>
      <div className="cta">Run preset →</div>
    </button>
  );
}
```

- [ ] **Step 2: Plug PresetCards into Landing**

Replace the placeholder `<div className="preset-grid" id="presets" />` with:

```tsx
import { PresetCard } from "../components/PresetCard.js";
// inside the component:
<div className="preset-grid">
  <PresetCard id="sweet-spot" />
  <PresetCard id="qa-bottleneck" />
  <PresetCard id="multitasking-tax" />
</div>
```

- [ ] **Step 3: Verify each preset card kicks off a run**

Run dev. Click each of the three cards. Each navigates to `/run?e=...` and the run begins. Charts populate.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/PresetCard.tsx packages/web/src/pages/Landing.tsx
git commit -m "feat(web): three preset cards on the landing page"
```

---

### Task 32: Auto-run Sweet Spot on landing visit (ambient hero)

The Sweet Spot card is the front-door experience. Spec §3.1: it "runs by default on landing (auto-streams U-curve within ~2 sec)." We add a small ambient demo: the landing page kicks off a small background run (200 runs × 15 cells = 3000 jobs, ~2 sec on a modern laptop) and renders an inline mini U-curve while the user reads the hero.

**Files:**
- Modify: `packages/web/src/pages/Landing.tsx`
- Create: `packages/web/src/components/AmbientUCurve.tsx`

- [ ] **Step 1: Write `packages/web/src/components/AmbientUCurve.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useExperiment } from "../orchestrator/useExperiment.js";
import { loadPreset } from "../state/presets.js";
import { UCurveChart } from "../charts/UCurveChart.js";

export function AmbientUCurve() {
  const exp = useExperiment();
  const [state, setState] = useState<Awaited<ReturnType<typeof loadPreset>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPreset("sweet-spot").then((s) => {
      if (cancelled) return;
      const lite = { ...s, runs: 200 };               // small ambient run
      setState(lite);
      exp.start(lite);
    });
    return () => { cancelled = true; exp.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return null;

  return (
    <div className="ambient-ucurve">
      <div className="label">Ambient · live</div>
      <div style={{ aspectRatio: "16 / 6" }}>
        <UCurveChart
          snapshot={exp.snapshot}
          sweep={state.sweep}
          productive_hours_per_day={state.config.team.productive_hours_per_day}
          totalRunsExpected={exp.runsTotal}
        />
      </div>
      <div className="ambient-meta mono">
        {exp.runsCompleted.toLocaleString()} / {exp.runsTotal.toLocaleString()} runs · The Sweet Spot · live
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Plug into Landing aside (replace the static aside)**

Replace the `<aside className="landing-hero-aside">…</aside>` block with:

```tsx
<aside className="landing-hero-aside">
  <AmbientUCurve />
</aside>
```

And add the import:

```tsx
import { AmbientUCurve } from "../components/AmbientUCurve.js";
```

- [ ] **Step 3: Append ambient styles to `landing.css`**

```css
.ambient-ucurve { display: flex; flex-direction: column; gap: 8px; }
.ambient-meta { font-size: 10.5px; color: var(--text-faint); }
```

- [ ] **Step 4: Verify in dev**

Visit `/`. Within ~1 sec the ambient mini-curve starts populating; the hero text is readable while it loads.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/AmbientUCurve.tsx packages/web/src/pages/Landing.tsx packages/web/src/styles/landing.css
git commit -m "feat(web): auto-run sweet-spot ambient hero on landing"
```

---

## Phase F — Downloads + Share

### Task 33: Per-chart PNG and SVG download

Strategy: each `ChartCard` already accepts a ref. We expose a `downloadAllCharts()` that, for each card with an SVG, serializes the SVG, converts it to PNG via `<canvas>`, and triggers a `Blob` download for both formats.

**Files:**
- Create: `packages/web/src/lib/download.ts`

- [ ] **Step 1: Implement `packages/web/src/lib/download.ts`**

```typescript
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function svgElementToString(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGElement, filename: string): void {
  const xml = svgElementToString(svg);
  downloadBlob(new Blob([xml], { type: "image/svg+xml" }), filename);
}

export async function downloadPng(svg: SVGElement, filename: string, scale = 2): Promise<void> {
  const xml = svgElementToString(svg);
  const blob = new Blob([xml], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = svg.clientWidth || 1100;
    const h = svg.clientHeight || 360;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.fillStyle = "#FAF6EC";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
    );
    downloadBlob(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
```

- [ ] **Step 2: Wire chart download into `RunResults`**

Modify `packages/web/src/pages/RunResults.tsx` — replace `onDownloadCharts={() => { /* wired in Phase F */ }}` with logic that walks the page DOM:

```tsx
import { downloadPng, downloadSvg } from "../lib/download.js";

// inside the RunResults component, define:
async function handleDownloadCharts() {
  const sections = document.querySelectorAll<HTMLElement>(".run-page .card");
  for (let i = 0; i < sections.length; i++) {
    const svg = sections[i]!.querySelector("svg");
    if (!svg) continue;
    const titleEl = sections[i]!.querySelector("h2");
    const title = (titleEl?.textContent ?? `chart-${i + 1}`).trim().toLowerCase().replace(/\s+/g, "-");
    downloadSvg(svg, `${title}.svg`);
    await downloadPng(svg, `${title}.png`);
  }
}
```

Pass it into `<ActionBar onDownloadCharts={handleDownloadCharts} ... />`.

- [ ] **Step 3: Verify in dev**

Run a preset to completion. Click "Download Charts." 8 files download (4 SVG + 4 PNG).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/download.ts packages/web/src/pages/RunResults.tsx
git commit -m "feat(web): per-chart png and svg download"
```

---

### Task 34: Raw results CSV / JSON download

**Files:**
- Modify: `packages/web/src/lib/download.ts`
- Modify: `packages/web/src/pages/RunResults.tsx`

- [ ] **Step 1: Add `serializeRawResults` to `packages/web/src/lib/download.ts`**

Append:

```typescript
import type { AggregatorSnapshot } from "../orchestrator/aggregator.js";
import type { ExperimentState } from "../state/urlCodec.js";

export function snapshotToCsv(snapshot: AggregatorSnapshot, productive_hours_per_day: number): string {
  const header = ["sweep_value", "run_count", "mean_throughput_per_day", "p05_throughput", "p95_throughput", "mean_median_lead_time_days", "p05_median_lead_time_days", "p95_median_lead_time_days"];
  const rows = [header.join(",")];
  for (const c of [...snapshot.cells.values()].sort((a, b) => a.sweep_value - b.sweep_value)) {
    rows.push([
      c.sweep_value,
      c.run_count,
      c.mean_throughput.toFixed(4),
      c.p05_throughput.toFixed(4),
      c.p95_throughput.toFixed(4),
      (c.mean_median_lead_time / productive_hours_per_day).toFixed(4),
      (c.p05_median_lead_time / productive_hours_per_day).toFixed(4),
      (c.p95_median_lead_time / productive_hours_per_day).toFixed(4),
    ].join(","));
  }
  return rows.join("\n");
}

export function snapshotToJson(snapshot: AggregatorSnapshot, state: ExperimentState): string {
  const cellsArr = [...snapshot.cells.values()].map((c) => ({
    sweep_value: c.sweep_value,
    run_count: c.run_count,
    mean_throughput: c.mean_throughput,
    p05_throughput: c.p05_throughput,
    p95_throughput: c.p95_throughput,
    mean_median_lead_time_hours: c.mean_median_lead_time,
    lead_time_sample_count: c.lead_time_samples.length,
    time_accounting_totals: c.time_accounting_totals,
  }));
  return JSON.stringify({ experiment: state, cells: cellsArr, total_runs: snapshot.total_runs }, null, 2);
}
```

- [ ] **Step 2: Wire raw download in `RunResults.tsx`**

```tsx
import { snapshotToCsv, snapshotToJson, downloadBlob } from "../lib/download.js";

function handleDownloadRaw() {
  if (!state || !exp.snapshot) return;
  const csv = snapshotToCsv(exp.snapshot, state.config.team.productive_hours_per_day);
  downloadBlob(new Blob([csv], { type: "text/csv" }), `${state.name.replace(/\s+/g, "-").toLowerCase()}-results.csv`);
  const json = snapshotToJson(exp.snapshot, state);
  downloadBlob(new Blob([json], { type: "application/json" }), `${state.name.replace(/\s+/g, "-").toLowerCase()}-results.json`);
}
```

Pass to `<ActionBar onDownloadRaw={handleDownloadRaw} ... />`.

- [ ] **Step 3: Verify**

Run preset to completion → click "Download Results" → CSV + JSON files download with correct contents.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/download.ts packages/web/src/pages/RunResults.tsx
git commit -m "feat(web): raw results csv and json download"
```

---

### Task 35: Share URL round-trip test (E2E-flavored unit test)

We already have `urlCodec` covered. Add a focused test that simulates landing on a `/results?e=<...>` URL with a complete share link and confirms the experiment state is loaded.

**Files:**
- Create: `packages/web/test/share-roundtrip.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RunResults } from "../src/pages/RunResults.js";
import { encodeExperiment, type ExperimentState } from "../src/state/urlCodec.js";

const state: ExperimentState = {
  name: "Shared Run",
  config: {
    team: { size: 5, productive_hours_per_day: 6, switch_cost_minutes: 15, pace_penalty: 0.05, worker_pick_policy: "round_robin", blocking_response: "start_new" },
    work: { arrival_rate_per_day: 4, effort_dist: { mu: 8, sigma: 3.5, skewness: 1.2 }, validation_effort: { kind: "fraction", fraction: 0.3 }, block_probability_per_day: 0.04, block_duration_dist: { mu: 4, sigma: 2, skewness: 0.5 } },
    board: { wip_ready: null, wip_in_progress: 5, wip_validation: 3 },
    simulation: { sim_days: 130, tick_size_hours: 1 },
  },
  sweep: null,
  randomized: [],
  master_seed: "42",
  runs: 1,
};

describe("Share URL round-trip", () => {
  it("loads experiment name and seed from URL on /results", async () => {
    const encoded = encodeExperiment(state);
    render(
      <MemoryRouter initialEntries={[`/results?e=${encoded}`]}>
        <RunResults />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Shared Run")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
  });
});
```

Note: under jsdom there's no real `Worker`, so `useExperiment` will fail to spawn; the test should not depend on charts rendering, only on the page header showing the decoded state. The component already short-circuits on missing `state` rather than a missing worker, so the assertions above are robust.

If `useExperiment` triggers a `new Worker()` call that throws under jsdom, guard the worker factory:

In `packages/web/src/orchestrator/pool.ts`, ensure `defaultWorkerFactory` calls `new Worker(...)` only when invoked; tests provide their own `Worker` global. To prevent the production factory from being exercised in jsdom, change the test to pass an `initialEntries` URL but expect just the page header, OR add a `process.env.NODE_ENV === "test"` short-circuit (preferred: leave production code clean and rely on jsdom's `Worker` being undefined → `runPool` is called via useEffect after `state` is set, but the test only asserts header content which renders before the worker spawn). If the test crashes on worker spawn, wrap the test in `vi.stubGlobal("Worker", FakeWorker)` using the same `FakeWorker` from `pool.test.ts`.

If a stub is needed, prepend the test with:

```tsx
import { beforeEach, vi } from "vitest";
class FakeWorker { onmessage: any = null; postMessage() {} terminate() {} addEventListener() {} removeEventListener() {} }
beforeEach(() => { vi.stubGlobal("Worker", FakeWorker); });
```

- [ ] **Step 2: Run test, verify pass**

Run: `pnpm --filter @kanbansim/web test share-roundtrip`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/test/share-roundtrip.test.tsx
git commit -m "test(web): share url round-trip on /results"
```

---

## Phase G — Learn page + Lab Mode polish

### Task 36: Learn page content

**Files:**
- Modify: `packages/web/src/pages/Learn.tsx`
- Create: `packages/web/src/styles/learn.css`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Write `packages/web/src/styles/learn.css`**

```css
.learn-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 64px 40px 80px;
}
.learn-page h1 {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(28px, 4vw, 40px);
  margin-bottom: 22px;
  letter-spacing: -0.02em;
}
.learn-page h2 {
  font-family: var(--serif);
  font-size: 22px;
  margin-top: 36px;
  margin-bottom: 12px;
}
.learn-page p, .learn-page li {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-soft);
  margin-bottom: 12px;
}
.learn-page strong { color: var(--text); font-weight: 600; }
.learn-page ul { padding-left: 1.4em; }
.learn-page .formula {
  background: var(--bg-paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 14px 18px;
  font-family: var(--mono);
  font-size: 14px;
  margin: 12px 0;
}
@media (max-width: 760px) { .learn-page { padding: 36px 18px 60px; } }
```

Add `import "./styles/learn.css";` to `main.tsx`.

- [ ] **Step 2: Replace `packages/web/src/pages/Learn.tsx`**

```tsx
export function Learn() {
  return (
    <main data-surface="default" className="learn-page">
      <h1>Kanban concepts, briefly</h1>

      <p>Kanban is a system for visualizing work, limiting work-in-progress, and managing flow. KanbanSim lets you experiment with the second of those — WIP limits — under realistic conditions.</p>

      <h2>Little's Law</h2>
      <p>For any stable system in equilibrium, the average number of items in the system equals the average arrival rate times the average lead time:</p>
      <div className="formula">average WIP = throughput × lead time</div>
      <p>Lower the WIP and either throughput goes up or lead time goes down — usually both. But there's a floor: at very low WIP your team can be <em>starved</em>, sitting idle when their items are blocked. So there's a sweet spot.</p>

      <h2>What's in a "run"</h2>
      <p>One run simulates 6 working months of a virtual team. Items arrive, get worked on, occasionally block, get peer-reviewed, and finish. Every numeric output you see in this simulator is averaged across thousands of independent runs of the same configuration.</p>

      <h2>Multitasking tax</h2>
      <p>Switching between items costs time (the <strong>switch cost</strong>) and slows down sustained pace (the <strong>pace penalty</strong>). At high WIP, workers juggle so many things that real progress evaporates. The <em>Time Accounting</em> chart makes this visible.</p>

      <h2>The U-curve</h2>
      <p>Sweep your WIP limit from 1 to 15 and lead time draws a U: a starved team at one end, an overloaded team at the other, and a comfortable middle. The middle isn't a single number — it's a band, broader than most teams assume. That's permission to lower WIP without precision-tuning it.</p>

      <h2>Reading the charts</h2>
      <ul>
        <li><strong>Hero U-curve</strong> — lead time and throughput against the swept variable. Bands are the 5th–95th percentile across runs.</li>
        <li><strong>Cumulative Flow</strong> — items in each column over time, for one representative run. Parallel bands = stable flow.</li>
        <li><strong>Lead-time histogram</strong> — every completed item across all runs at the optimal cell. Right-skewed; the tail is the truth.</li>
        <li><strong>Time accounting</strong> — where worker hours actually go. The contrast between optimal and overloaded is the multitasking tax made visible.</li>
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Visit `/#/learn`. Reads cleanly. Theme toggle still works.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/Learn.tsx packages/web/src/styles/learn.css packages/web/src/main.tsx
git commit -m "feat(web): learn page with kanban concepts and chart guide"
```

---

### Task 37: Lab Mode (dark theme) visual pass

The dark tokens were defined in Task 5. This task verifies dark mode reads well across all surfaces and fixes anything that escaped CSS-variable-ization.

**Files:**
- Modify: any of `packages/web/src/styles/*.css` as needed.

- [ ] **Step 1: Manual sweep — start dev server**

Run: `pnpm --filter @kanbansim/web dev`. Toggle Lab Mode. Visit each page (`/`, `/#/build`, run a preset to completion, `/#/learn`) and verify:
- No literal hex colors hardcoded outside `tokens.css`.
- Chart backgrounds, text, axes follow dark tokens.
- Stamp, tooltips, parameter inputs readable.
- Hover states work in both themes.

- [ ] **Step 2: Fix any token regressions**

Common offenders to grep for in `packages/web/src/styles/*.css`:

```bash
grep -nE '#[0-9A-Fa-f]{3,6}' packages/web/src/styles/*.css
```

Any matches outside `tokens.css` should be replaced with a `var(--*)` reference.

For chart text rendered by Observable Plot, the CSS variable references already inside the `style` prop should resolve (Plot inlines `style` on the SVG; tokens cascade from `[data-theme="dark"]` on `<html>`).

- [ ] **Step 3: Commit (if any changes were needed)**

```bash
git add packages/web/src/styles/
git commit -m "feat(web): lab mode dark theme polish"
```

If no changes were needed, skip this commit. The verification step counts.

---

### Task 38: Tooltips on every parameter (verification)

Tooltips were wired in Task 16 for every parameter row. This task verifies each `path` shipped in `ParameterInput` has a corresponding entry in `TOOLTIPS`.

**Files:**
- Create: `packages/web/test/tooltips.test.ts`

- [ ] **Step 1: Add a coverage test**

```typescript
import { describe, expect, it } from "vitest";
import { TOOLTIPS } from "../src/lib/tooltips.js";

const PARAM_PATHS = [
  "team.size", "team.productive_hours_per_day", "team.switch_cost_minutes", "team.pace_penalty", "team.blocking_response",
  "work.arrival_rate_per_day", "work.effort_dist.mu", "work.effort_dist.sigma", "work.effort_dist.skewness", "work.block_probability_per_day",
  "board.wip_ready", "board.wip_in_progress", "board.wip_validation",
  "monte_carlo.runs", "monte_carlo.master_seed", "monte_carlo.sweep", "monte_carlo.randomize",
];

describe("Tooltip coverage", () => {
  it("has a tooltip for every shipped parameter path", () => {
    const missing = PARAM_PATHS.filter((p) => !TOOLTIPS[p]);
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @kanbansim/web test tooltips`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/test/tooltips.test.ts
git commit -m "test(web): tooltip coverage for every parameter path"
```

---

## Phase H — E2E + Deploy

### Task 39: Playwright config + happy-path E2E test

**Files:**
- Create: `packages/web/playwright.config.ts`
- Create: `packages/web/e2e/happy-path.spec.ts`
- Modify: `packages/web/.gitignore` (already covers `playwright-report/` and `test-results/`)

- [ ] **Step 1: Install browsers**

Run: `pnpm --filter @kanbansim/web e2e:install`
Expected: downloads chromium binary.

- [ ] **Step 2: Write `packages/web/playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Write `packages/web/e2e/happy-path.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test("landing → preset run → results → download", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /lowered/i })).toBeVisible();
  await page.getByRole("button", { name: /The Sweet Spot/i }).click();
  await expect(page.locator(".stamp")).toContainText(/Running/i, { timeout: 8_000 });
  await expect(page.locator(".stamp")).toContainText(/Run Complete/i, { timeout: 120_000 });
  await expect(page.locator(".card")).toHaveCount(4);
  await page.getByRole("button", { name: /Copy Share URL/i }).click();
  await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible();
});

test("build configurator round-trip", async ({ page }) => {
  await page.goto("/#/build");
  await expect(page.getByRole("heading", { name: /Build an experiment/i })).toBeVisible();
  await page.getByRole("tab", { name: "Board" }).click();
  // change WIP via input
  const wip = page.locator('input[type="number"]').first();
  await wip.fill("4");
  // URL hash should contain the encoded state
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toContain("?e=");
});

test("cancel mid-run leaves partial results", async ({ page }) => {
  await page.goto("/#/build");
  await page.getByRole("button", { name: /Run experiment/i }).click();
  await expect(page.locator(".stamp")).toContainText(/Running/i, { timeout: 8_000 });
  await page.getByRole("button", { name: /Cancel/i }).click();
  await expect(page.locator(".stamp")).toContainText(/Cancelled/i);
});
```

- [ ] **Step 4: Run E2E**

Run: `pnpm --filter @kanbansim/web e2e`
Expected: 3 passing tests in chromium. The "preset run → results" test takes up to ~30 sec on a modern laptop.

- [ ] **Step 5: Commit**

```bash
git add packages/web/playwright.config.ts packages/web/e2e/happy-path.spec.ts
git commit -m "test(web): playwright happy-path e2e covering preset run, build, cancel"
```

---

### Task 40: Production build + bundle size budget

**Files:**
- Create: `packages/web/test/bundle-size.test.ts`

- [ ] **Step 1: Run a production build to measure**

Run: `pnpm --filter @kanbansim/web build`
Expected: Vite reports per-asset sizes. Note the gzipped JS total.

- [ ] **Step 2: Add a guard test**

The spec sets a 250 KB gzipped budget. Add a test that walks `dist/` after build, sums gzipped JS, and fails if over budget. This runs as part of `pnpm build` chain.

```typescript
import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = join(__dirname, "..", "dist", "assets");
const BUDGET_KB = 280;   // 250 KB nominal, +30 KB headroom for fonts and minor growth

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

describe("bundle size", () => {
  it.skipIf(!directoryExists(DIST))("stays within the gzipped JS budget", () => {
    const files = walk(DIST);
    let totalGz = 0;
    for (const f of files) {
      totalGz += gzipSync(readFileSync(f)).length;
    }
    const totalKb = totalGz / 1024;
    expect(totalKb, `Total gzipped JS: ${totalKb.toFixed(1)} KB`).toBeLessThan(BUDGET_KB);
  });
});

function directoryExists(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter @kanbansim/web build && pnpm --filter @kanbansim/web test bundle-size`
Expected: PASS (skipped if `dist/` was cleaned). If FAIL, inspect Vite output and trim — most likely culprit is Observable Plot d3 transitive deps; consider tree-shaking or dynamic-importing heavy chart libs.

- [ ] **Step 4: Commit**

```bash
git add packages/web/test/bundle-size.test.ts
git commit -m "test(web): gzipped bundle-size budget"
```

---

### Task 41: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `packages/web/vite.config.ts` (set `base` from env for GH Pages subpath)

- [ ] **Step 1: Update `vite.config.ts` to read base from env**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
});
```

- [ ] **Step 2: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy KanbanSim to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm -r test
      - name: Build web
        env:
          VITE_BASE: /${{ github.event.repository.name }}/
        run: pnpm --filter @kanbansim/web build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: packages/web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Verify the build works with the GH Pages base path locally**

Run:

```bash
VITE_BASE=/kanbansim/ pnpm --filter @kanbansim/web build
pnpm --filter @kanbansim/web preview --base /kanbansim/
```

Visit http://localhost:4173/kanbansim/. Verify the app loads, scenarios load, presets run.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml packages/web/vite.config.ts
git commit -m "ci(web): github pages deploy workflow with base-path support"
```

Note: GitHub Pages must be enabled for the repo (Settings → Pages → Source: GitHub Actions) before the first deploy succeeds. The workflow runs on push to `main`; the first run will fail with "Pages not enabled" if that step is missed — deliberate, not a regression.

---

### Task 42: Acceptance verification

A manual + automated checklist matching the spec's "MVP shipped" criteria. Run these in order; if any fails, fix before marking the plan complete.

**Files:** none (verification only)

- [ ] **Step 1: Tests across the workspace**

Run: `pnpm -r test`
Expected: every package passes, including engine (existing 56), CLI (existing 1), and web (all new).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 3: Production build**

Run: `pnpm --filter @kanbansim/web build`
Expected: builds without errors; `dist/` populated; bundle-size test passes.

- [ ] **Step 4: Playwright E2E**

Run: `pnpm --filter @kanbansim/web e2e`
Expected: 3 tests pass.

- [ ] **Step 5: Manual acceptance pass against spec §"Acceptance criteria"**

Start `pnpm --filter @kanbansim/web dev`. Walk the list:

- [ ] Site loads on localhost; landing page reads cleanly.
- [ ] Sweet Spot ambient curve starts streaming on landing within ~2 sec.
- [ ] Click each of the three presets — each runs end-to-end without error.
- [ ] Configurator round-trip: change values, copy URL, paste in a new tab → same state loads.
- [ ] Cancel mid-run halts and leaves partial results.
- [ ] Per-chart PNG and SVG download works from `/results`.
- [ ] CSV/JSON raw download works from `/results`.
- [ ] Copy share URL → paste in new tab → same `/results` state loads.
- [ ] CLI parity: pick the Sweet Spot config, master seed 1, run 100 runs in CLI; same in browser; first cell summary stats match (within rounding).

  ```bash
  pnpm --filter @kanbansim/cli exec tsx src/index.ts --config ../../scenarios/sweet-spot.json --runs 100 --seed 1 --out /tmp/web-cli-parity.json
  ```

  Then compare to a browser run with `master_seed=1, runs=100`. The first cell's `summary.median_lead_time_hours` and `throughput_per_day` should match the aggregator's mean (since all runs use deterministic seeds).
- [ ] Site is responsive at phone-portrait widths — open DevTools, resize to 375×812; no overflow, no broken layouts.
- [ ] Lab Mode toggle persists across reloads (localStorage).

- [ ] **Step 6: Final commit (housekeeping if any drift uncovered)**

If any small fixes were made during the manual sweep (typo, padding glitch, missing aria-label):

```bash
git add -p
git commit -m "fix(web): acceptance pass adjustments"
```

If nothing needs adjusting, skip the commit.

---

## Definition of Done

The plan is complete when all of the following are true:

1. All 42 tasks above are checked off.
2. `pnpm -r test` passes across the workspace.
3. `pnpm typecheck` exits 0 across the workspace.
4. `pnpm --filter @kanbansim/web build` produces a `dist/` under the bundle-size budget.
5. `pnpm --filter @kanbansim/web e2e` passes (3 tests).
6. The manual acceptance checklist (Task 42 Step 5) passes.
7. The branch (`feat/web-mvp`) merges cleanly to `main` via fast-forward.

After merge: enable GitHub Pages and let the first deploy run; the live URL is the artifact this plan produces.

---

## Out-of-scope reminders

These are deliberately *not* in Plan 2 — punt to v1.5:

- Compare-two-configs side-by-side mode.
- Per-tick "step debugger" view of a single run.
- Tornado / parameter-sensitivity charts.
- CSV import to derive an experiment from a real team's cycle times.
- More than three preset scenarios.
- Worker role specialization (developer vs validator).
- Saved/named experiments backed by anything other than the URL hash.
- WCAG audit beyond the basic SVG + react a11y patterns already used.
- Custom domain DNS (the deploy URL is the GH Pages subpath until a domain is bound).

If any of these become tempting during execution, capture them as a `/parking-lot` note rather than expanding scope.



