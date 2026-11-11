/**
 * Legal moves, applied and reversed.
 *
 * Plugging is deliberately permissive and confirming is strict: the player may
 * plug any caller into any destination, and a wrong pairing is caught at
 * confirmation as a `ROUTE_REJECTED` event with the plug still in place
 * (R3.4 — incorrect connections are recoverable consequences, not failure).
 * Every applied or rejected move emits a typed `GameEvent` (R5.1) and returns a
 * journal entry that reverses it exactly.
 */

import type { EntityId, GameEvent } from '@line-13/contracts';
import { constraintViolations } from './solve.ts';
import type {
  GraphModel,
  GraphMove,
  MoveContext,
  MoveJournalEntry,
  MoveOutcome,
  RejectionReason,
  RejectionRecord,
  RoutingState,
} from './types.ts';

export function createInitialState(model: GraphModel): RoutingState {
  return {
    episodeId: model.episodeId,
    sequence: 1,
    plugs: new Map(),
    confirmations: new Map(),
    confirmationOrder: [],
    rejections: [],
  };
}

export function isComplete(model: GraphModel, state: RoutingState): boolean {
  return model.callerOrder.every((callerId) => state.confirmations.has(callerId));
}

/** Caller ids whose ordering predecessors are not all confirmed yet. */
function missingPredecessors(
  model: GraphModel,
  state: RoutingState,
  callerId: EntityId,
): readonly EntityId[] {
  return (model.orderingBefore.get(callerId) ?? []).filter(
    (predecessor) => !state.confirmations.has(predecessor),
  );
}

function occupiedBy(state: RoutingState, destinationId: EntityId): EntityId | null {
  for (const [callerId, confirmed] of state.confirmations) {
    if (confirmed === destinationId) {
      return callerId;
    }
  }
  return null;
}

/**
 * Why confirming `callerId` -> `destinationId` would be rejected, or null when
 * the confirmation is legal. Order of precedence: a destination already taken,
 * then constraint violation, then an unmet ordering predecessor.
 */
export function confirmationRejection(
  model: GraphModel,
  state: RoutingState,
  callerId: EntityId,
  destinationId: EntityId,
): RejectionReason | null {
  const holder = occupiedBy(state, destinationId);
  if (holder !== null && holder !== callerId) {
    return 'occupied';
  }
  const candidate = new Map(state.confirmations);
  candidate.set(callerId, destinationId);
  if (constraintViolations(model, candidate).length > 0) {
    return 'constraint';
  }
  if (missingPredecessors(model, state, callerId).length > 0) {
    return 'ordering';
  }
  return null;
}

function journalFor(
  move: GraphMove,
  state: RoutingState,
  callerId: EntityId,
): MoveJournalEntry {
  return {
    move,
    previousSequence: state.sequence,
    previousPlug: state.plugs.get(callerId) ?? null,
    previousConfirmation: state.confirmations.get(callerId) ?? null,
    previousConfirmationIndex: state.confirmationOrder.indexOf(callerId),
    previousRejectionCount: state.rejections.length,
  };
}

function withPlugs(
  state: RoutingState,
  mutate: (plugs: Map<EntityId, EntityId>) => void,
): Map<EntityId, EntityId> {
  const plugs = new Map(state.plugs);
  mutate(plugs);
  return plugs;
}

/**
 * Apply one move. Returns `illegal` without touching state for a move the
 * switchboard cannot physically make, `rejected` for a legal attempt the puzzle
 * refuses, and `applied` otherwise.
 */
export function applyMove(
  model: GraphModel,
  state: RoutingState,
  move: GraphMove,
  context: MoveContext,
): MoveOutcome {
  if (state.episodeId !== model.episodeId) {
    return { status: 'illegal', reason: 'episode-mismatch' };
  }
  if (!model.domains.has(move.callerId)) {
    return { status: 'illegal', reason: 'unknown-caller' };
  }
  const journal = journalFor(move, state, move.callerId);
  const base = { sequence: state.sequence, timestampOffsetMs: context.timestampOffsetMs } as const;

  switch (move.kind) {
    case 'insert-plug': {
      if (!model.destinationOrder.includes(move.destinationId)) {
        return { status: 'illegal', reason: 'unknown-destination' };
      }
      if (state.confirmations.has(move.callerId)) {
        return { status: 'illegal', reason: 'caller-already-confirmed' };
      }
      if (state.plugs.has(move.callerId)) {
        return { status: 'illegal', reason: 'caller-already-plugged' };
      }
      const event: GameEvent = {
        ...base,
        type: 'PLUG_INSERTED',
        callerId: move.callerId,
        destinationId: move.destinationId,
      };
      return {
        status: 'applied',
        state: {
          ...state,
          sequence: state.sequence + 1,
          plugs: withPlugs(state, (plugs) => plugs.set(move.callerId, move.destinationId)),
        },
        events: [event],
        journal,
      };
    }

    case 'remove-plug': {
      const plugged = state.plugs.get(move.callerId);
      if (plugged === undefined) {
        return { status: 'illegal', reason: 'no-plug-present' };
      }
      const event: GameEvent = {
        ...base,
        type: 'PLUG_REMOVED',
        callerId: move.callerId,
        destinationId: plugged,
      };
      return {
        status: 'applied',
        state: {
          ...state,
          sequence: state.sequence + 1,
          plugs: withPlugs(state, (plugs) => plugs.delete(move.callerId)),
        },
        events: [event],
        journal,
      };
    }

    case 'confirm-route': {
      const plugged = state.plugs.get(move.callerId);
      if (plugged === undefined) {
        return { status: 'illegal', reason: 'no-plug-present' };
      }
      if (state.confirmations.has(move.callerId)) {
        return { status: 'illegal', reason: 'caller-already-confirmed' };
      }
      const reason = confirmationRejection(model, state, move.callerId, plugged);
      if (reason !== null) {
        const rejection: RejectionRecord = {
          callerId: move.callerId,
          destinationId: plugged,
          reason,
        };
        const event: GameEvent = {
          ...base,
          type: 'ROUTE_REJECTED',
          callerId: move.callerId,
          destinationId: plugged,
          reason,
        };
        return {
          status: 'rejected',
          state: {
            ...state,
            sequence: state.sequence + 1,
            rejections: [...state.rejections, rejection],
          },
          events: [event],
          journal,
          rejection,
        };
      }
      const confirmations = new Map(state.confirmations);
      confirmations.set(move.callerId, plugged);
      const event: GameEvent = {
        ...base,
        type: 'ROUTE_CONFIRMED',
        callerId: move.callerId,
        destinationId: plugged,
      };
      return {
        status: 'applied',
        state: {
          ...state,
          sequence: state.sequence + 1,
          plugs: withPlugs(state, (plugs) => plugs.delete(move.callerId)),
          confirmations,
          confirmationOrder: [...state.confirmationOrder, move.callerId],
        },
        events: [event],
        journal,
      };
    }

    case 'disconnect-route': {
      const confirmed = state.confirmations.get(move.callerId);
      if (confirmed === undefined) {
        return { status: 'illegal', reason: 'route-not-confirmed' };
      }
      const confirmations = new Map(state.confirmations);
      confirmations.delete(move.callerId);
      const event: GameEvent = {
        ...base,
        type: 'PLUG_REMOVED',
        callerId: move.callerId,
        destinationId: confirmed,
      };
      return {
        status: 'applied',
        state: {
          ...state,
          sequence: state.sequence + 1,
          confirmations,
          confirmationOrder: state.confirmationOrder.filter((callerId) => callerId !== move.callerId),
        },
        events: [event],
        journal,
      };
    }

    default:
      return { status: 'illegal', reason: 'unknown-caller' };
  }
}

/**
 * Exact inverse of the move recorded in `entry`, applied to the state that move
 * produced. `reverseMove(applyMove(s, m).state, journal)` deep-equals `s`.
 */
export function reverseMove(state: RoutingState, entry: MoveJournalEntry): RoutingState {
  const callerId = entry.move.callerId;
  const plugs = new Map(state.plugs);
  if (entry.previousPlug === null) {
    plugs.delete(callerId);
  } else {
    plugs.set(callerId, entry.previousPlug);
  }

  const confirmations = new Map(state.confirmations);
  const confirmationOrder = state.confirmationOrder.filter((id) => id !== callerId);
  if (entry.previousConfirmation === null) {
    confirmations.delete(callerId);
  } else {
    confirmations.set(callerId, entry.previousConfirmation);
    const index = entry.previousConfirmationIndex;
    if (index >= 0 && index <= confirmationOrder.length) {
      confirmationOrder.splice(index, 0, callerId);
    } else {
      confirmationOrder.push(callerId);
    }
  }

  return {
    episodeId: state.episodeId,
    sequence: entry.previousSequence,
    plugs,
    confirmations,
    confirmationOrder,
    rejections: state.rejections.slice(0, entry.previousRejectionCount),
  };
}

/**
 * Every move legal from `state`, in a deterministic order: plug insertions in
 * seeded caller then seeded destination order, then removals, confirmations and
 * disconnections. Used by the UI for keyboard affordances and by the validator
 * to sweep the reachable state space.
 */
export function legalMoves(model: GraphModel, state: RoutingState): readonly GraphMove[] {
  const moves: GraphMove[] = [];
  for (const callerId of model.callerOrder) {
    if (state.confirmations.has(callerId) || state.plugs.has(callerId)) {
      continue;
    }
    for (const destinationId of model.destinationOrder) {
      moves.push({ kind: 'insert-plug', callerId, destinationId });
    }
  }
  for (const callerId of model.callerOrder) {
    if (state.plugs.has(callerId)) {
      moves.push({ kind: 'remove-plug', callerId });
      moves.push({ kind: 'confirm-route', callerId });
    }
  }
  for (const callerId of model.callerOrder) {
    if (state.confirmations.has(callerId)) {
      moves.push({ kind: 'disconnect-route', callerId });
    }
  }
  return moves;
}

/** Canonical key for a routing state, ignoring sequence and rejection history. */
export function stateKey(model: GraphModel, state: RoutingState): string {
  const plugs = model.callerOrder
    .map((callerId) => `${callerId}:${state.plugs.get(callerId) ?? '-'}`)
    .join(',');
  const confirmations = model.callerOrder
    .map((callerId) => `${callerId}:${state.confirmations.get(callerId) ?? '-'}`)
    .join(',');
  return `p[${plugs}]c[${confirmations}]o[${state.confirmationOrder.join('>')}]`;
}
