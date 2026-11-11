# LINE 13: Kiro depth evidence

Branch `feat/kiro-depth` (worktree `/Users/logesh/workplace/line-13-kiro`), based on `feat/foundation` 70c1dde.
Implementation commit: **f450bde**. A second commit on the same branch adds this file, the captured outputs in `docs/evidence/`, the ledger rows and `scripts/hook-demo.mjs`.
Nothing was pushed. No AWS calls were made.

## How the hooks were exercised (read this first)

The hooks follow the documented format (kiro.dev/docs/hooks: `version: "v1"`, `hooks[]`, `trigger: "PostFileSave"`, regex `matcher`, `action.type: "command"`, `timeout`; JSON event on STDIN; exit 0 = success, other = stderr goes to the agent).
I did **not** observe them firing inside the Kiro IDE or CLI from this session. They were fired by `scripts/run-hook.mjs`, a local harness that applies the documented contract (match the path with the regex, run the command in the project root, pass JSON on STDIN, read the exit code). The file-event STDIN field names are not documented, so the scripts accept `file_path`, `path`, `filePath` and others, and fall back to a full check when the payload names no file.

## Hooks (`.kiro/hooks/`)

| Hook file | Trigger and matcher | Command |
|---|---|---|
| `validate-episode-on-save.json` | PostFileSave, `(^|/)(fixtures|episodes)/[^/]+\.json$` | `node scripts/episode-check.mjs` (JSON parse, contract schema, solver proof incl. ambiguity and recovery) |
| `test-affected-package.json` | PostFileSave, `^(apps|packages)/[^/]+/(src|test)/.*\.tsx?$` | `node scripts/test-affected.mjs` (runs `npm test -w <that package>`) |
| `steering-guard-on-save.json` | PostFileSave, `^(apps|packages)/[^/]+/src/.*\.(ts|tsx|css)$` | `node scripts/steering-guard.mjs` (injected HTML, native `title` tooltip, emoji icon, credentials, non-AWS model SDKs) |

Full captured output: `docs/evidence/hook-runs-after.txt` (11 episode inputs), `docs/evidence/hook-runs-tests-and-guard.txt`, `docs/evidence/hook-runs-before-solver-fix.txt`.

### Episode hook, before/after on nearby inputs

| Input | Exit | Output (abridged) |
|---|---|---|
| bundled `minimal-episode.json` (good) | 0 | `PASS ... solutions=1 recoveryStates=4` |
| four-caller episode, full proof (good) | 0 | `PASS ... solutions=1 recoveryStates=2760` |
| zero-solution (required and forbidden on one pair) | 1 | `SOLVER EMPTY_DOMAIN ... Caller "caller-ruth" has no permitted destination.` |
| no-solution (both callers pinned to one jack, distinct required) | 1 | `SOLVER NO_SOLUTION` |
| two-solution (one unconstrained caller) | 1 | `SOLVER MULTIPLE_SOLUTIONS ... Episode has 2 complete solutions` |
| two-solution with `--allow-ambiguity` (declared authored) | 0 | `PASS ... solutions=2` |
| trap-style, recovery sweep cut at 200 states | 1 | `SOLVER RECOVERY_PROOF_INCOMPLETE ... recovery guarantee is unproven` |
| malformed JSON | 1 | `MALFORMED_JSON: Unexpected end of JSON input` |
| wrong `schemaVersion` | 1 | `SCHEMA INVALID_VALUE at $.schemaVersion` |
| top-level array | 1 | `SCHEMA INVALID_TYPE at $: Manifest must be an object.` |
| two callers sharing one required destination | **before fix 0 (PASS, wrong)**, after fix 1 | after: `SOLVER NO_SOLUTION at $.constraints` |

"Trap state": the engine allows no reachable dead end in its move rules (the audit finds none), so the closest real input is a sweep that cannot finish, which the validator rejects as unproven. That is what the trap-style row exercises. I did not construct a genuinely unrecoverable state because none exists to construct.

### Test hook, before/after

Saving `packages/graph/src/solve.ts` with the pre-fix solver: hook exit 1, `npm test -w packages/graph` 27 tests, 26 pass, 1 fail (`shared destination (found by PBT)`: expected `rejected`, actual `verified`).
Same save with the fix: exit 0, 27/27.

### Steering-guard hook, before/after

A `.tsx` with `title=` and `dangerouslySetInnerHTML` and an emoji: exit 1, three named rules. A clean file: exit 0. The test hook also fired for that path and `apps/web` `houseRules.test.ts` failed 2 of 101 for the same reasons, so the repository already enforced two of the three rules after the fact; the hook moves that to save time and adds the native-tooltip, credential and AWS-only checks.

## Defect found by the property suite

Seed 1 (`docs/evidence/pbt-defect-before-fix.json`), shrunk in 4 steps to: 2 callers, 3 destinations, destination 2 forbidden for both, destination 0 excluded for both by clues. Each caller can only use destination 1.
The solver counted "both callers on destination 1" as the single solution and reported `verified`. `moves.ts` refuses the second caller as `occupied`, so the board can never be completed. Every hand-built fixture avoided this because each added a distinct-destination rule or used required routes.
Fix (`packages/graph/src/solve.ts`, `consistent()`): a destination already assigned to another caller is not a candidate. Regression test: `packages/graph/test/shared-destination.test.ts`. Nothing in `apps/web` was changed; all 101 web tests still pass.

## Property-based tests

`packages/graph/test/pbt.property.ts`, run with `npm run pbt` (kept out of `npm test` so the save hook stays fast).

- Cases: 10,000 per run. Seeds recorded: 1113 (CI seed; verified 1,059, zero-solution 5,682, multi-solution 1,642, ordering-cycle 1,617) and random seed -1852522124 (both passed, about 10 s each). Records: `docs/evidence/pbt-run-seed-1113.json`, `pbt-run-random-seed.json`.
- Oracle: brute force over caller-to-destination assignments, written in the test, including the one-caller-per-destination rule.
- Properties: soundness (verified implies exactly one solution, intended route valid, recovery sweep exhaustive with no unrecoverable state), completeness (one true solution and no ordering cycle implies verified), rejection (zero, many, cycle all rejected with `failingSeed` and the right issue code), solution replay (twice, same state hash, equals the played state, no issues), recovery (every state on a random 14-step walk of legal moves can still recover), report determinism.
- Failure output: seed, path, minimized counterexample and a replay command (`PBT_SEED=<n> npm run pbt`), written to `.pbt/last-run.json` and printed by `node scripts/pbt-report.mjs`.
- Harness check: a mutant validator that drops `MULTIPLE_SOLUTIONS` is caught at seed 1313 after 4 runs and shrinks to 1 caller, 2 destinations, no constraints.

Generator limit: 1 to 3 callers and up to 2 extra destinations, and clues are exclusion clues only. Relationship clues, `same-destination` and four-caller episodes are not generated; the four-caller case is covered by a fixed fixture.

## CI

`/.github/workflows/ci.yml`: checkout, Node 22.18, `node scripts/check-kiro.mjs` (before install), `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `PBT_SEED=1113 npm run pbt`, upload `.pbt/last-run.json`, `npm run build`.
`check-kiro` fails when `.kiro` is missing, has untracked or ignored files, is named in an active `.gitignore` line, is not committed, or when any of 12 required paths (spec files, steering files, hooks dir, minimal episode fixture, episode schema, bundled episode module, evidence ledger, LICENSE) is absent. Captured in `docs/evidence/ci-kiro-gate-runs.txt`; both directions are also tested in `scripts/test/check-kiro.test.mjs` using throwaway git repos.
The workflow file has not been run on GitHub (nothing was pushed). Its steps were run locally one by one.

## Steering added

`.kiro/steering/testing.md` (`inclusion: fileMatch` on test, property and graph-source files) and `.kiro/steering/aws-only.md` (`fileMatch` on package.json, infra, API and haunting sources). `scripts/lint.mjs` validates every steering file's inclusion front matter.

## Root scripts

`npm run lint | typecheck | test | pbt | build | check:kiro | check:episodes | verify`. `lint` is a repository lint (hook shape, steering front matter, steering guard, episode gate); no ESLint was added because none is installed.

## Test totals (local, run one package at a time)

| Package | Tests |
|---|---|
| contracts | no tests (typecheck only) |
| graph | 27 pass (26 existing + 1 regression) |
| haunting | 60 pass |
| api | 156 pass |
| web | 101 pass |
| scripts (episode gate, hooks, steering guard, check-kiro) | 24 pass |
| **total** | **368 pass**, plus 10,000 generated PBT cases |

Typecheck: all five workspaces clean. Build: `vite build` ok. Lint: ok.

## Skipped or not checked

- Hooks were not observed running inside the Kiro IDE/CLI (harness only); the file-save STDIN field names are undocumented, hence the tolerant parser.
- The GitHub Actions workflow was not executed on GitHub.
- No evidence-ledger-on-commit hook (I chose the steering guard as the third hook).
- No ESLint, no E2E command, no Powers, MCP or custom-agent additions, no AWS calls.
- Risk: the contract still allows a relationship clue with `relation: 'same-destination'`; with the solver fix it can never be satisfied (NO_SOLUTION), where before the solver accepted it and `moves.ts` made it unplayable. No fixture, test or episode in the repository uses it (grep), but episode authors on other branches should not.
