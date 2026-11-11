/**
 * Graph engine domain types.
 *
 * The engine owns puzzle truth and replay only. It never describes presentation
 * and never imports a framework; it depends on `@line-13/contracts` for types
 * exclusively (`import type`), so nothing from the contracts package exists at
 * runtime.
 */

import type { EntityId, GameEvent, IntendedRoute } from '@line-13/contracts';

export type GraphIssueCode =
  | 'DUPLICATE_ID'
  | 'MISSING_REFERENCE'
  | 'INVALID_VALUE'
  | 'EMPTY_DOMAIN'
  | 'ORDERING_CYCLE'
  | 'NO_SOLUTION'
  | 'MULTIPLE_SOLUTIONS'
  | 'INTENDED_SOLUTION_INVALID'
  | 'UNRECOVERABLE_STATE'
  | 'RECOVERY_PROOF_INCOMPLETE';

export interface GraphIssue {
  readonly code: GraphIssueCode;
  /** JSON-pointer-ish path into the manifest, or a state key for replay issues. */
  readonly path: string;
  readonly message: string;
}

export type DerivedConstraintKind =
  | 'required-route'
  | 'forbidden-route'
  | 'distinct-destination'
  | 'same-destination'
  | 'ordering';

/**
 * A flattened constraint. Authored `RouteConstraint` entries and the
 * constraints implied by `ExclusionClue` / `RelationshipClue` are normalized
 * into this one shape so the solver has a single code path.
 *
 * For `ordering`, `callerId` is the earlier caller and `relatedCallerId` the
 * later one. For `distinct-destination` / `same-destination` the pair is
 * `(callerId, relatedCallerId)`. For the route constraints `destinationId` is
 * set and `relatedCallerId` is null.
 */
export interface DerivedConstraint {
  readonly kind: DerivedConstraintKind;
  readonly source: 'constraint' | 'clue';
  /** Index into `manifest.constraints`, or the originating clue id. */
  readonly sourceId: string;
  readonly callerId: EntityId;
  readonly relatedCallerId: EntityId | null;
  readonly destinationId: EntityId | null;
}

export interface GraphModel {
  readonly episodeId: EntityId;
  readonly seed: string;
  /** Callers in seeded deterministic order; solver assignment order. */
  readonly callerOrder: readonly EntityId[];
  /** Destinations in seeded deterministic order; solver branch order. */
  readonly destinationOrder: readonly EntityId[];
  /** Per-caller candidate destinations after required/forbidden narrowing. */
  readonly domains: ReadonlyMap<EntityId, readonly EntityId[]>;
  readonly constraints: readonly DerivedConstraint[];
  /** before caller -> callers that must be confirmed after it. */
  readonly orderingAfter: ReadonlyMap<EntityId, readonly EntityId[]>;
  /** after caller -> callers that must be confirmed before it. */
  readonly orderingBefore: ReadonlyMap<EntityId, readonly EntityId[]>;
  /** Seeded topological order over `orderingAfter`; the canonical play order. */
  readonly canonicalOrder: readonly EntityId[];
  readonly intendedRoutes: readonly IntendedRoute[];
  /** Number of clues that narrow or relate routing choices. */
  readonly clueDependencyCount: number;
}

export interface RouteAssignment {
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
}

export interface Solution {
  /** Canonical form: sorted by caller id. */
  readonly assignments: readonly RouteAssignment[];
  /** Caller ids in the seeded order that satisfies every ordering constraint. */
  readonly order: readonly EntityId[];
  /** `assignments` projected onto `order`, numbered from 1. */
  readonly routes: readonly IntendedRoute[];
}

export interface SolutionSet {
  readonly solutions: readonly Solution[];
  /** True when enumeration stopped at the configured limit. */
  readonly truncated: boolean;
}

export type RejectionReason = 'constraint' | 'ordering' | 'occupied';

export interface RejectionRecord {
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
  readonly reason: RejectionReason;
}

export interface RoutingState {
  readonly episodeId: EntityId;
  /** Sequence number the next emitted event will carry. */
  readonly sequence: number;
  /** Plugged but unconfirmed caller -> destination. */
  readonly plugs: ReadonlyMap<EntityId, EntityId>;
  readonly confirmations: ReadonlyMap<EntityId, EntityId>;
  /** Callers in confirmation order; drives ordering-constraint checks. */
  readonly confirmationOrder: readonly EntityId[];
  readonly rejections: readonly RejectionRecord[];
}

export type GraphMove =
  | { readonly kind: 'insert-plug'; readonly callerId: EntityId; readonly destinationId: EntityId }
  | { readonly kind: 'remove-plug'; readonly callerId: EntityId }
  | { readonly kind: 'confirm-route'; readonly callerId: EntityId }
  | { readonly kind: 'disconnect-route'; readonly callerId: EntityId };

export interface MoveContext {
  readonly timestampOffsetMs: number;
}

export type IllegalMoveReason =
  | 'episode-mismatch'
  | 'unknown-caller'
  | 'unknown-destination'
  | 'caller-already-confirmed'
  | 'caller-already-plugged'
  | 'no-plug-present'
  | 'route-not-confirmed';

/**
 * Everything needed to reverse one applied or rejected move exactly. Plain
 * data, so a journal can be serialized into a save file or a replay code.
 */
export interface MoveJournalEntry {
  readonly move: GraphMove;
  readonly previousSequence: number;
  readonly previousPlug: EntityId | null;
  readonly previousConfirmation: EntityId | null;
  /** Index of the caller in `confirmationOrder` before the move, or -1. */
  readonly previousConfirmationIndex: number;
  readonly previousRejectionCount: number;
}

export type MoveOutcome =
  | {
      readonly status: 'applied';
      readonly state: RoutingState;
      readonly events: readonly GameEvent[];
      readonly journal: MoveJournalEntry;
    }
  | {
      readonly status: 'rejected';
      readonly state: RoutingState;
      readonly events: readonly GameEvent[];
      readonly journal: MoveJournalEntry;
      readonly rejection: RejectionRecord;
    }
  | {
      readonly status: 'illegal';
      readonly reason: IllegalMoveReason;
    };

export interface RecoveryPlan {
  /** Confirmed callers to disconnect, in seeded deterministic order. */
  readonly disconnects: readonly EntityId[];
  /** A complete solution reachable once the disconnects are applied. */
  readonly completion: Solution;
}

export type RecoveryResult =
  | { readonly ok: true; readonly plan: RecoveryPlan }
  | { readonly ok: false; readonly reason: 'no-solution' | 'search-exhausted' };

export interface Difficulty {
  /** 0-100, derived from the three measured inputs below. */
  readonly score: number;
  readonly solutionLength: number;
  readonly clueDependencyCount: number;
  readonly decoyDestinationCount: number;
}

export interface RecoverabilityAudit {
  /** Distinct routing states visited by the breadth-first sweep. */
  readonly statesChecked: number;
  /** True when the whole reachable state space fit inside the budget. */
  readonly exhaustive: boolean;
  /** Canonical keys of states with no recovery plan; empty means R4.5 holds. */
  readonly unrecoverableStateKeys: readonly string[];
}

export interface ProofReport {
  readonly validatorVersion: string;
  readonly episodeId: EntityId;
  readonly seed: string;
  readonly status: 'verified' | 'rejected';
  readonly solutionCount: number;
  readonly solutionsTruncated: boolean;
  readonly shortestSolutionLength: number;
  readonly unreachableNodeIds: readonly EntityId[];
  /** The seed to reproduce a rejection with; null when verified. */
  readonly failingSeed: string | null;
  readonly intendedSolutionMatches: boolean;
  readonly difficulty: Difficulty;
  readonly recoverability: RecoverabilityAudit;
  readonly issues: readonly GraphIssue[];
  readonly proofHash: string;
}

export type BuildResult =
  | { readonly ok: true; readonly model: GraphModel; readonly issues: readonly GraphIssue[] }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

export type EpisodeValidation =
  | { readonly ok: true; readonly model: GraphModel; readonly report: ProofReport }
  | { readonly ok: false; readonly report: ProofReport };

export interface ValidateOptions {
  /** Stop enumerating after this many complete solutions. Default 64. */
  readonly solutionLimit?: number;
  /** R4.4: authored ambiguity. When true, >1 solution is not a rejection. */
  readonly allowAmbiguity?: boolean;
  /** Breadth-first recoverability budget in distinct states. Default 2000. */
  readonly recoveryStateLimit?: number;
}
