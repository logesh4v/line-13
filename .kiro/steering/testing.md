---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx", "**/*.property.ts", "scripts/test/**", "packages/graph/src/**"]
---

# LINE 13 Testing Steering

Loaded when a test, property suite, or graph-engine source file is in play.

## Rules that exist because something broke

- **Puzzle truth is judged against a second implementation.** Property tests compare the engine with a brute-force oracle written in the test, never with the engine itself. The oracle found that the solver accepted two callers sharing one destination while `moves.ts` refuses the second as `occupied`: an episode reported `verified` that nobody could finish. A destination holds one caller. Keep solver and move rules in agreement.
- **Reuse the real fixture.** Import `packages/contracts/fixtures/minimal-episode.json`; derive variants by narrow edits. A copied fixture hides contract drift.
- **A pass is not proof when the fixture shares the bug's blind spot.** For every validator rule, test both directions: the bad episode fails and the good one passes. Zero-solution, two-solution, unwinnable (shared destination), unproven recovery sweep, malformed JSON, wrong schema version.
- **Failures must print a seed.** Property tests run through `fast-check` with an explicit seed; report the seed, the minimized counterexample, and the replay command (`PBT_SEED=<n> npm run pbt`).
- **No hidden randomness.** Anything random takes an explicit seed (architecture steering).

## Commands

- `npm test -w packages/graph` for one package; run packages one at a time on a tight machine.
- `npm run pbt` runs 10,000 generated episodes, then `scripts/pbt-report.mjs` prints the seed summary.
- Runner is `node --test` with native TypeScript stripping; do not add Jest or Vitest.
