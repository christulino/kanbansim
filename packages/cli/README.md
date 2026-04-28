# @kanbansim/cli

Node command-line runner for the KanbanSim engine. Imports the engine directly and runs experiments from JSON config files.

Usage:

    pnpm --filter @kanbansim/cli exec tsx src/index.ts --config scenarios/sweet-spot.json --runs 1000 --out results.json
