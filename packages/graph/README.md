# @line-13/graph

Deterministic puzzle truth for LINE 13 episodes. Framework-free, dependency-free,
pure functions. `@line-13/contracts` is used for **types only**, so nothing from
it is imported at runtime and the package runs unchanged in a browser.

This package owns puzzle truth and replay. It owns no rendering, no cue
selection, and makes no model call.

## Public API

| Area | Functions |
|---|---|
| Model | `buildGraphModel` |
| Solving | `enumerateSolutions`, `constraintViolations`, `satisfiesConstraints`, `intendedSolution`, `solutionKey`, `unusedDestinationIds` |
| Moves | `createInitialState`, `legalMoves`, `applyMove`, `reverseMove`, `confirmationRejection`, `isComplete`, `stateKey` |
| Recovery | `recoveryPlan`, `canRecover`, `auditRecoverability` |
| Replay | `replayEvents`, `serializeState`, `hashState` |
| Proof | `validateEpisode`, `computeProofReport`, `computeDifficulty`, `VALIDATOR_VERSION` |
| Determinism | `createRng`, `seededOrder`, `seedToUint32`, `stableStringify`, `stableHash`, `fnv1a64` |

## Design decisions

**Permissive plugging, strict confirmation.** Any caller may be plugged into any
destination; a wrong pairing is caught at confirmation and emitted as a
`ROUTE_REJECTED` event with the plug left in place. That is what makes an
incorrect connection a recoverable consequence (R3.4) instead of a failure.

**Ordering constraints do not multiply solutions.** A solution is a destination
assignment. Ordering constraints form a partial order over callers, cycle-checked
at build time and linearized into one seeded `canonicalOrder`, so
`solutionCount` is a statement about routing truth (R4.3, R4.4) and not about
permutations. Confirming out of order is rejected with reason `ordering`.

**Recovery is proved, not assumed.** `auditRecoverability` sweeps the reachable
state space breadth-first and asserts every state has a `recoveryPlan`. The audit
reports `exhaustive`, and `computeProofReport` rejects a non-exhaustive sweep
with `RECOVERY_PROOF_INCOMPLETE`, so a truncated sweep is never mistaken for a
proof (R4.5). `verified` therefore always means the whole reachable space was
checked, never that the sweep ran out of budget without finding a counterexample.

The default ceiling (`DEFAULT_RECOVERY_STATE_LIMIT`, 50,000) is sized from the
measured state space of a real episode rather than guessed: at R3.1's four
primary callers, five destinations reach 2,760 reachable states and six reach
4,553, while five callers over six reach 39,572. Raise `recoveryStateLimit` for
a larger authored graph; the gate will tell you when it is too low instead of
quietly downgrading the guarantee.

**Seeded determinism.** Caller order, destination order and solver branch order
all derive from `manifest.seed` through `seededOrder`, so a given seed always
yields the same graph and the same proof report, `proofHash` included (R4.2).

**`proofHash` is a checksum, not a signature.** FNV-1a 64 detects drift between
validator runs with no crypto import. Publication integrity
(`EpisodeIntegrity.manifestHash`, SHA-256) stays with the publishing pipeline.

## Commands

```bash
npm run typecheck -w @line-13/graph   # tsc --noEmit, repo-wide strict options
npm run test -w @line-13/graph        # node --test, Node >= 22.18 type stripping
```

Tests run straight off `.ts` via Node's built-in type stripping, so the package
needs no build step and no test framework. `test/types/node-builtins.d.ts`
carries minimal ambient declarations for `node:test` and `node:assert/strict`
because the repository installs no packages.
