/**
 * Deterministic replay of a typed `GameEvent` sequence (R5.3).
 *
 * The event log is the record of truth, so replay reduces events directly
 * rather than re-deriving moves. Routing events rebuild routing state; the
 * other event types pass through into the timeline for the haunting engine to
 * consume, which is why a presentation failure cannot corrupt graph state
 * (R5.4). Replaying the same sequence twice yields the same state and the same
 * `stateHash`.
 */

import type { EntityId, GameEvent } from '@line-13/contracts';
import { stableHash } from './hash.ts';
import { createInitialState } from './moves.ts';
import type {
  GraphIssue,
  GraphModel,
  RejectionRecord,
  RoutingState,
} from './types.ts';

export interface ReplayResult {
  readonly state: RoutingState;
  /** Every accepted event, in sequence order. */
  readonly timeline: readonly GameEvent[];
  readonly issues: readonly GraphIssue[];
  readonly stateHash: string;
}

/** Canonical, JSON-safe projection of a routing state. */
export function serializeState(
  model: GraphModel,
  state: RoutingState,
): {
  readonly episodeId: EntityId;
  readonly sequence: number;
  readonly plugs: readonly (readonly [EntityId, EntityId])[];
  readonly confirmations: readonly (readonly [EntityId, EntityId])[];
  readonly confirmationOrder: readonly EntityId[];
  readonly rejections: readonly RejectionRecord[];
} {
  const project = (
    source: ReadonlyMap<EntityId, EntityId>,
  ): readonly (readonly [EntityId, EntityId])[] => {
    const entries: (readonly [EntityId, EntityId])[] = [];
    for (const callerId of model.callerOrder) {
      const destinationId = source.get(callerId);
      if (destinationId !== undefined) {
        entries.push([callerId, destinationId]);
      }
    }
    return entries;
  };
  return {
    episodeId: state.episodeId,
    sequence: state.sequence,
    plugs: project(state.plugs),
    confirmations: project(state.confirmations),
    confirmationOrder: state.confirmationOrder,
    rejections: state.rejections,
  };
}

export function hashState(model: GraphModel, state: RoutingState): string {
  const snapshot = serializeState(model, state);
  return stableHash({
    episodeId: snapshot.episodeId,
    sequence: snapshot.sequence,
    plugs: snapshot.plugs.map(([callerId, destinationId]) => `${callerId}=>${destinationId}`),
    confirmations: snapshot.confirmations.map(
      ([callerId, destinationId]) => `${callerId}=>${destinationId}`,
    ),
    confirmationOrder: [...snapshot.confirmationOrder],
    rejections: snapshot.rejections.map(
      (rejection) => `${rejection.callerId}=>${rejection.destinationId}:${rejection.reason}`,
    ),
  });
}

function knownCaller(model: GraphModel, callerId: EntityId): boolean {
  return model.domains.has(callerId);
}

function knownDestination(model: GraphModel, destinationId: EntityId): boolean {
  return model.destinationOrder.includes(destinationId);
}

/**
 * Replay `events` onto a fresh state for `model`.
 *
 * Out-of-order sequences, regressing timestamps and unknown entity references
 * are reported as issues and the offending event is skipped, so a corrupted
 * replay code degrades to a partial replay instead of a wrong one (failure
 * strategy: never silently substitute a different puzzle state).
 */
export function replayEvents(
  model: GraphModel,
  events: readonly GameEvent[],
): ReplayResult {
  const issues: GraphIssue[] = [];
  const timeline: GameEvent[] = [];
  let plugs = new Map<EntityId, EntityId>();
  let confirmations = new Map<EntityId, EntityId>();
  let confirmationOrder: EntityId[] = [];
  const rejections: RejectionRecord[] = [];
  let lastSequence = 0;
  let lastTimestamp = 0;
  let highestSequence = 0;

  for (const event of events) {
    if (!Number.isInteger(event.sequence) || event.sequence <= lastSequence) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `event[${event.sequence}]`,
        message: `Event sequence must strictly increase; received ${event.sequence} after ${lastSequence}.`,
      });
      continue;
    }
    if (event.timestampOffsetMs < lastTimestamp) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `event[${event.sequence}].timestampOffsetMs`,
        message: `Timestamp offset must not regress; received ${event.timestampOffsetMs} after ${lastTimestamp}.`,
      });
      continue;
    }

    let accepted = true;
    switch (event.type) {
      case 'PLUG_INSERTED': {
        if (!knownCaller(model, event.callerId) || !knownDestination(model, event.destinationId)) {
          accepted = false;
          break;
        }
        plugs = new Map(plugs);
        plugs.set(event.callerId, event.destinationId);
        break;
      }
      case 'PLUG_REMOVED': {
        if (!knownCaller(model, event.callerId)) {
          accepted = false;
          break;
        }
        if (confirmations.get(event.callerId) === event.destinationId) {
          confirmations = new Map(confirmations);
          confirmations.delete(event.callerId);
          confirmationOrder = confirmationOrder.filter((callerId) => callerId !== event.callerId);
          break;
        }
        plugs = new Map(plugs);
        plugs.delete(event.callerId);
        break;
      }
      case 'ROUTE_CONFIRMED': {
        if (!knownCaller(model, event.callerId) || !knownDestination(model, event.destinationId)) {
          accepted = false;
          break;
        }
        plugs = new Map(plugs);
        plugs.delete(event.callerId);
        confirmations = new Map(confirmations);
        confirmations.set(event.callerId, event.destinationId);
        confirmationOrder = confirmationOrder.filter((callerId) => callerId !== event.callerId);
        confirmationOrder.push(event.callerId);
        break;
      }
      case 'ROUTE_REJECTED': {
        if (!knownCaller(model, event.callerId) || !knownDestination(model, event.destinationId)) {
          accepted = false;
          break;
        }
        rejections.push({
          callerId: event.callerId,
          destinationId: event.destinationId,
          reason: event.reason,
        });
        break;
      }
      case 'CALL_RINGING':
      case 'CALL_ANSWERED': {
        if (!knownCaller(model, event.callerId)) {
          accepted = false;
        }
        break;
      }
      case 'CALL_BLEED_STARTED': {
        if (
          !knownCaller(model, event.sourceCallerId) ||
          !knownCaller(model, event.affectedCallerId)
        ) {
          accepted = false;
        }
        break;
      }
      case 'CLUE_REVEALED':
      case 'LINE_POSSESSED':
      case 'FINALE_UNLOCKED':
      case 'ENDING_SELECTED':
        break;
      default:
        accepted = false;
        break;
    }

    if (!accepted) {
      issues.push({
        code: 'MISSING_REFERENCE',
        path: `event[${event.sequence}]`,
        message: `Event "${event.type}" references an entity the episode does not define.`,
      });
      continue;
    }

    lastSequence = event.sequence;
    lastTimestamp = event.timestampOffsetMs;
    highestSequence = event.sequence;
    timeline.push(event);
  }

  const state: RoutingState = {
    ...createInitialState(model),
    sequence: highestSequence + 1,
    plugs,
    confirmations,
    confirmationOrder,
    rejections,
  };

  return { state, timeline, issues, stateHash: hashState(model, state) };
}
