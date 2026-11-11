/**
 * `@line-13/graph` — deterministic puzzle truth for LINE 13 episodes.
 *
 * Framework-free, dependency-free, pure functions. The package owns graph
 * creation, legal transitions, solution enumeration, validation, difficulty,
 * recovery and replay; it owns no presentation and makes no model call.
 * `@line-13/contracts` is used for types only, so nothing from it is imported
 * at runtime.
 */

export { createRng, seedToUint32, seededOrder } from './rng.ts';
export type { Rng } from './rng.ts';

export { fnv1a64, stableHash, stableStringify } from './hash.ts';
export type { StableValue } from './hash.ts';

export { buildGraphModel } from './model.ts';

export {
  DEFAULT_SOLUTION_LIMIT,
  constraintViolations,
  enumerateSolutions,
  intendedSolution,
  satisfiesConstraints,
  solutionKey,
  unusedDestinationIds,
} from './solve.ts';
export type { EnumerateOptions } from './solve.ts';

export {
  applyMove,
  confirmationRejection,
  createInitialState,
  isComplete,
  legalMoves,
  reverseMove,
  stateKey,
} from './moves.ts';

export {
  DEFAULT_RECOVERY_STATE_LIMIT,
  auditRecoverability,
  canRecover,
  recoveryPlan,
} from './recovery.ts';

export { hashState, replayEvents, serializeState } from './replay.ts';
export type { ReplayResult } from './replay.ts';

export { VALIDATOR_VERSION, computeDifficulty, computeProofReport, validateEpisode } from './proof.ts';

export type {
  BuildResult,
  DerivedConstraint,
  DerivedConstraintKind,
  Difficulty,
  EpisodeValidation,
  GraphIssue,
  GraphIssueCode,
  GraphModel,
  GraphMove,
  IllegalMoveReason,
  MoveContext,
  MoveJournalEntry,
  MoveOutcome,
  RecoverabilityAudit,
  RecoveryPlan,
  RecoveryResult,
  RejectionReason,
  RejectionRecord,
  RouteAssignment,
  RoutingState,
  Solution,
  SolutionSet,
  ProofReport,
  ValidateOptions,
} from './types.ts';
