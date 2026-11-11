import type { GameEvent } from '../src/contracts.ts';

/**
 * One event of every type in the `GameEvent` union, in a plausible play order.
 *
 * The coverage test asserts this list stays exhaustive, so adding a variant to
 * the contract without mapping it to cues fails the suite rather than shipping
 * a silently unhaunted event.
 */
export const ALL_EVENT_TYPES: readonly GameEvent['type'][] = [
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
];

export function sampleEvents(): readonly GameEvent[] {
  return [
    { type: 'CALL_RINGING', sequence: 0, timestampOffsetMs: 0, callerId: 'caller-widow', lineId: 'line-01' },
    { type: 'CALL_ANSWERED', sequence: 1, timestampOffsetMs: 900, callerId: 'caller-widow' },
    { type: 'CLUE_REVEALED', sequence: 2, timestampOffsetMs: 1400, clueId: 'clue-bell' },
    { type: 'PLUG_INSERTED', sequence: 3, timestampOffsetMs: 2000, callerId: 'caller-widow', destinationId: 'dest-morgue' },
    { type: 'ROUTE_REJECTED', sequence: 4, timestampOffsetMs: 2300, callerId: 'caller-widow', destinationId: 'dest-morgue', reason: 'constraint' },
    { type: 'PLUG_REMOVED', sequence: 5, timestampOffsetMs: 2600, callerId: 'caller-widow', destinationId: 'dest-morgue' },
    { type: 'CALL_BLEED_STARTED', sequence: 6, timestampOffsetMs: 2900, sourceCallerId: 'caller-widow', affectedCallerId: 'caller-sailor' },
    { type: 'PLUG_INSERTED', sequence: 7, timestampOffsetMs: 3300, callerId: 'caller-widow', destinationId: 'dest-bell-tower' },
    { type: 'ROUTE_CONFIRMED', sequence: 8, timestampOffsetMs: 3600, callerId: 'caller-widow', destinationId: 'dest-bell-tower' },
    { type: 'LINE_POSSESSED', sequence: 9, timestampOffsetMs: 4200, lineId: 'line-13', intensity: 2 },
    { type: 'FINALE_UNLOCKED', sequence: 10, timestampOffsetMs: 5000, lineId: 'line-13' },
    { type: 'ENDING_SELECTED', sequence: 11, timestampOffsetMs: 6000, endingId: 'ending-sever' },
  ];
}

/** One event per type, each on its own sequence number. */
export function oneOfEachEvent(): readonly GameEvent[] {
  const events: GameEvent[] = [];
  let sequence = 0;
  const push = (event: GameEvent): void => {
    events.push(event);
  };
  for (const type of ALL_EVENT_TYPES) {
    const base = { sequence, timestampOffsetMs: sequence * 100 };
    sequence += 1;
    switch (type) {
      case 'CALL_RINGING':
        push({ ...base, type, callerId: 'caller-a', lineId: 'line-01' });
        break;
      case 'CALL_ANSWERED':
        push({ ...base, type, callerId: 'caller-a' });
        break;
      case 'PLUG_INSERTED':
        push({ ...base, type, callerId: 'caller-a', destinationId: 'dest-a' });
        break;
      case 'PLUG_REMOVED':
        push({ ...base, type, callerId: 'caller-a', destinationId: 'dest-a' });
        break;
      case 'ROUTE_CONFIRMED':
        push({ ...base, type, callerId: 'caller-a', destinationId: 'dest-a' });
        break;
      case 'ROUTE_REJECTED':
        push({ ...base, type, callerId: 'caller-a', destinationId: 'dest-a', reason: 'constraint' });
        break;
      case 'CALL_BLEED_STARTED':
        push({ ...base, type, sourceCallerId: 'caller-a', affectedCallerId: 'caller-b' });
        break;
      case 'CLUE_REVEALED':
        push({ ...base, type, clueId: 'clue-a' });
        break;
      case 'LINE_POSSESSED':
        push({ ...base, type, lineId: 'line-13', intensity: 1 });
        break;
      case 'FINALE_UNLOCKED':
        push({ ...base, type, lineId: 'line-13' });
        break;
      case 'ENDING_SELECTED':
        push({ ...base, type, endingId: 'ending-a' });
        break;
    }
  }
  return events;
}
