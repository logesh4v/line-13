import { LIMITS } from './limits.ts';
import { isEntityId } from './identifiers.ts';
import { EPISODE_SCHEMA_VERSION } from '../contracts.ts';
import type { GameEvent } from '../contracts.ts';
import type { ReplayRecord } from '../ports/replay-store.ts';

/**
 * Stored replays are validated at the boundary like any other remote content.
 *
 * A record written by an older publisher, a partially written item, or an item
 * whose event sequence is not monotonic cannot be replayed deterministically,
 * so it is rejected rather than handed to the client half-trusted.
 */

export type ReplayRejection =
  | 'SCHEMA_VERSION_MISMATCH'
  | 'IDENTIFIER_MALFORMED'
  | 'EVENTS_EMPTY'
  | 'EVENTS_TOO_MANY'
  | 'EVENT_MALFORMED'
  | 'SEQUENCE_NOT_MONOTONIC';

export type ReplayValidation =
  | { readonly ok: true; readonly record: ReplayRecord }
  | { readonly ok: false; readonly reason: ReplayRejection };

const EVENT_TYPES: ReadonlySet<string> = new Set<GameEvent['type']>([
  'CALL_RINGING',
  'CALL_ANSWERED',
  'PLUG_INSERTED',
  'PLUG_REMOVED',
  'ROUTE_CONFIRMED',
  'ROUTE_REJECTED',
  'CALL_BLEED_STARTED',
  'CLUE_REVEALED',
  'LINE_POSSESSED',
  'FINALE_UNLOCKED',
  'ENDING_SELECTED',
]);

export function validateReplayRecord(record: ReplayRecord): ReplayValidation {
  if (record.schemaVersion !== EPISODE_SCHEMA_VERSION) {
    return { ok: false, reason: 'SCHEMA_VERSION_MISMATCH' };
  }
  if (!isEntityId(record.episodeId) || !isEntityId(record.endingId)) {
    return { ok: false, reason: 'IDENTIFIER_MALFORMED' };
  }
  if (record.events.length === 0) {
    return { ok: false, reason: 'EVENTS_EMPTY' };
  }
  if (record.events.length > LIMITS.maxReplayEvents) {
    return { ok: false, reason: 'EVENTS_TOO_MANY' };
  }

  let previousSequence = Number.NEGATIVE_INFINITY;
  for (const event of record.events) {
    if (
      typeof event !== 'object' ||
      event === null ||
      !EVENT_TYPES.has(event.type) ||
      !Number.isSafeInteger(event.sequence) ||
      !Number.isSafeInteger(event.timestampOffsetMs) ||
      event.timestampOffsetMs < 0
    ) {
      return { ok: false, reason: 'EVENT_MALFORMED' };
    }
    if (event.sequence <= previousSequence) {
      return { ok: false, reason: 'SEQUENCE_NOT_MONOTONIC' };
    }
    previousSequence = event.sequence;
  }

  return { ok: true, record };
}
