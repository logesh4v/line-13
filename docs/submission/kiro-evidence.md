# Kiro Evidence Ledger

Record evidence while building. Do not reconstruct this from memory during submission week.

| Date | Commit | Kiro surface | Feature | Problem addressed | Artifact or output | Verified consequence |
|---|---|---|---|---|---|---|
| 2026-11-03 | 3cae65f | Kiro Crew | Research and design orchestration | Existing project direction did not visibly fit Kiroween | Official-rule analysis, winner comparison, three visual directions | Resurrection direction and winner thesis locked before implementation |
| 2026-11-03 | 6d80dbe | Kiro Crew custom UI agent | Ninety-second vertical slice | Convert the approved mockup into an accessible physical interaction | 41 UI files and 101 tests | Intro, wrong route, recovery, correct route, Line 13, and ending implemented without dashboard patterns |
| 2026-11-03 | f7b5208 | Kiro Crew graph agent | Deterministic solver and proof engine | Keep puzzle truth outside the interface and prove recovery | Graph package and 22 initial tests | Zero-solution, ambiguity, replay, and recovery decisions became machine-checkable |
| 2026-11-03 | 5853eb7 | Independent Kiro Crew graph review | Recovery-proof correctness | Four callers reached 2,760 states while a 2,000-state cap still reported “verified” | Blocking RECOVERY_PROOF_INCOMPLETE result and four scale tests | Incomplete sweeps can no longer masquerade as proofs; 26 graph tests pass |
| 2026-11-03 | 21cc690 | Kiro Crew haunting/audio agent | Event-driven audiovisual consequences | Prevent audio, motion, and subtitles from drifting away from graph events | Deterministic cue engine, browser audio adapters, 60 tests | Every audible beat has a visual or caption path; mute and reduced motion preserve the same playthrough |
| 2026-11-03 | 62ffe96 | Independent Kiro Crew backend review | Least-privilege infrastructure evidence | CloudFormation permissions had only prose review | 26 policy-lint tests added to 128 API tests | Wildcard expansion and request-path Bedrock/Polly access now fail automatically; 156 API tests pass |
| 2026-11-03 | 4e9995b | Parent integration | Workspace boundary verification | Hoisted React types polluted non-DOM packages and one test duplicated object keys | Explicit TypeScript type scopes and corrected reorder fixture | All workspaces pass strict typecheck after installation |
| 2026-11-03 | 4e9995b | Browser-panel verification | Real rendered player flow | Unit tests could not prove layout, focus, cords, or progression | Desktop intro, board, crossed-line, ending, and mobile captures | Real Chromium completed wrong route → recovery → correct route → Line 13 → ending |
| 2026-11-11 | f450bde | Kiro hooks (`.kiro/hooks/validate-episode-on-save.json`, PostFileSave) | Episode gate on save | A saved episode JSON could be malformed, schema-invalid, zero-solution, ambiguous or unproven and nobody would see it until play | `scripts/episode-check.mjs`; 11 inputs captured in `docs/evidence/hook-runs-after.txt` | Hook exit 1 with named cause for zero-solution (EMPTY_DOMAIN), no-solution, two-solution (MULTIPLE_SOLUTIONS), unproven recovery sweep (RECOVERY_PROOF_INCOMPLETE), malformed JSON and wrong schema version; exit 0 for the bundled episode and the 2,760-state four-caller episode |
| 2026-11-11 | f450bde | Kiro hooks (`test-affected-package.json`, PostFileSave) | Affected-package tests on save | A solver edit could regress the engine without anyone running its suite | `scripts/test-affected.mjs`; `docs/evidence/hook-runs-tests-and-guard.txt` | Saving the pre-fix `solve.ts` fired the hook: exit 1, `npm test -w packages/graph` 26/27 with the shared-destination test red; with the fix exit 0, 27/27 |
| 2026-11-11 | f450bde | Kiro hooks (`steering-guard-on-save.json`) + steering | Written steering rules as a failing check | Steering prose (no injected HTML, no native tooltips, no emoji icons, AWS-only SDKs) had no enforcement at save time | `scripts/steering-guard.mjs` | A deliberately bad `.tsx` was refused with three named rules (no-injected-html, no-native-tooltip, no-emoji-icon), a clean file passed |
| 2026-11-11 | f450bde | Steering (`.kiro/steering/testing.md`, `aws-only.md`, fileMatch) | Context loaded only where it prevents a failure | Test-writing and dependency work lacked the rules that earlier failures produced (oracle independence, seed printing, AWS-only) | Both files carry `inclusion: fileMatch` front matter; `scripts/lint.mjs` validates the front matter | Lint fails on a steering file with an unknown inclusion mode or a fileMatch without a pattern |
| 2026-11-11 | f450bde | Property-based testing (fast-check) | 10,000 generated episodes vs a brute-force oracle | The solver's uniqueness and recovery claims were checked on a handful of hand-built fixtures | `packages/graph/test/pbt.property.ts`; `docs/evidence/pbt-run-seed-1113.json`, `pbt-run-random-seed.json` | 10,000 cases pass on seed 1113 and on a random seed (about 10 s): verified 1,059, zero-solution 5,682, multi-solution 1,642, ordering-cycle 1,617 |
| 2026-11-11 | f450bde | Property-based testing | PBT-discovered defect and minimized seed | Solver reported `verified` for an episode whose only assignment puts two callers on one destination, but `moves.ts` rejects the second caller as `occupied`, so it cannot be finished | `docs/evidence/pbt-defect-before-fix.json` (seed 1, shrunk to 2 callers / 3 destinations); regression test `shared-destination.test.ts`; fix in `packages/graph/src/solve.ts` | Before: hook and gate PASS the unwinnable episode. After: NO_SOLUTION and exit 1; 10,000 cases pass |
| 2026-11-11 | f450bde | Property-based testing | Harness catches a seeded defect | A property suite that has never failed proves little | Mutant validator that drops MULTIPLE_SOLUTIONS, seed 1313 | Caught after 4 runs and shrunk in 2 steps to 1 caller / 2 destinations / no constraints |
| 2026-11-11 | f450bde | CI (`.github/workflows/ci.yml`) + `scripts/check-kiro.mjs` | Kiroween rule as a build gate | `.kiro` could be ignored, uncommitted or incomplete without anyone noticing, and required fixtures could vanish | `docs/evidence/ci-kiro-gate-runs.txt`; `scripts/test/check-kiro.test.mjs` | Gate exits 1 for `.kiro/` in .gitignore, an untracked `.kiro` file, an uncommitted `.kiro`, a missing fixture and a missing `.kiro`; exits 0 on the committed checkout. The workflow has not yet run on GitHub |
| 2026-11-11 | f450bde | Root npm scripts | Spec Milestone 1 commands | No lint, pbt or single verify command | `package.json`: lint, typecheck, test, pbt, build, check:kiro, check:episodes, verify | Typecheck, lint, all package tests (368 incl. scripts), PBT and build run green locally |

## Evidence quality standard

Every row must identify an actual input, output, and consequence. “Used Kiro to build the app” is not evidence. Good evidence includes:

- A requirement that changed architecture.
- A steering rule that prevented visual drift.
- A hook that caught an invalid episode.
- An MCP lookup that corrected an API assumption.
- A property-test seed that exposed ambiguity.
- A custom agent whose output passed or failed a named gate.
- A Kiro Web review tied to the exact commit.
- A Crew run that produced a versioned episode and solver proof.

## Required final examples

- Spec-driven development versus an exploratory design iteration.
- One effective steering strategy.
- One hook with before-and-after evidence.
- One MCP-assisted technical decision.
- One PBT-discovered defect and minimized seed.
- One custom-agent division of labour.
- One Night Operator multi-agent run.
- One rendered UI verification and one recorded interaction flow.
