import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GameEvent, RouteRejectedEvent } from '../src/contracts.ts';
import { mapEvent, mapEvents } from '../src/cue-mapper.ts';
import {
  ESCALATION_THRESHOLDS,
  INITIAL_HAUNTING_STATE,
  reduceHauntingLog,
  rejectionsFor,
  type HauntingState,
} from '../src/state.ts';

function rejection(sequence: number, callerId: string): RouteRejectedEvent {
  return {
    type: 'ROUTE_REJECTED',
    sequence,
    timestampOffsetMs: sequence * 100,
    callerId,
    destinationId: 'dest-morgue',
    reason: 'constraint',
  };
}

test('repeated rejection of one caller escalates 1, 2, 3 and then holds', () => {
  let state: HauntingState = INITIAL_HAUNTING_STATE;
  const intensities: number[] = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const step = mapEvent(rejection(attempt, 'caller-widow'), state);
    state = step.state;
    const lamp = step.cues.find((cue) => cue.channel === 'lamp');
    assert.ok(lamp !== undefined);
    intensities.push(lamp.intensity);
  }

  assert.deepEqual(intensities, [1, 2, 3, 3, 3]);
  assert.equal(rejectionsFor(state, 'caller-widow'), 5);
});

test('rejection escalation is tracked per caller, not globally', () => {
  const events: readonly GameEvent[] = [
    rejection(0, 'caller-widow'),
    rejection(1, 'caller-widow'),
  ];
  const after = mapEvents(events).state;

  assert.equal(rejectionsFor(after, 'caller-widow'), 2);
  assert.equal(rejectionsFor(after, 'caller-sailor'), 0);

  // A caller refused for the first time is not punished for someone else's
  // history, but global pressure has already risen, so the floor is level 2.
  const fresh = mapEvent(rejection(2, 'caller-sailor'), after);
  const lamp = fresh.cues.find((cue) => cue.channel === 'lamp');
  assert.ok(lamp !== undefined);
  assert.equal(lamp.intensity, 2);
});

test('a third rejection adds the camera jolt that earlier ones withhold', () => {
  let state: HauntingState = INITIAL_HAUNTING_STATE;
  const cameraCounts: number[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const step = mapEvent(rejection(attempt, 'caller-widow'), state);
    state = step.state;
    cameraCounts.push(step.cues.filter((cue) => cue.channel === 'camera').length);
  }

  assert.deepEqual(cameraCounts, [0, 0, 1]);
});

test('pressure weights produce the documented escalation thresholds', () => {
  const oneRejection = reduceHauntingLog([rejection(0, 'caller-a')]);
  assert.equal(oneRejection.pressure, 1);
  assert.equal(oneRejection.escalation, 1);

  const twoRejections = reduceHauntingLog([
    rejection(0, 'caller-a'),
    rejection(1, 'caller-b'),
  ]);
  assert.equal(twoRejections.pressure, ESCALATION_THRESHOLDS.level2);
  assert.equal(twoRejections.escalation, 2);

  const bleedAndPossession = reduceHauntingLog([
    { type: 'CALL_BLEED_STARTED', sequence: 0, timestampOffsetMs: 0, sourceCallerId: 'caller-a', affectedCallerId: 'caller-b' },
    { type: 'LINE_POSSESSED', sequence: 1, timestampOffsetMs: 100, lineId: 'line-13', intensity: 1 },
    { type: 'ROUTE_REJECTED', sequence: 2, timestampOffsetMs: 200, callerId: 'caller-a', destinationId: 'dest-a', reason: 'ordering' },
  ]);
  assert.equal(bleedAndPossession.pressure, ESCALATION_THRESHOLDS.level3);
  assert.equal(bleedAndPossession.escalation, 3);
});

test('possession is counted once per line however often it is reported', () => {
  const state = reduceHauntingLog([
    { type: 'LINE_POSSESSED', sequence: 0, timestampOffsetMs: 0, lineId: 'line-13', intensity: 1 },
    { type: 'LINE_POSSESSED', sequence: 1, timestampOffsetMs: 100, lineId: 'line-13', intensity: 3 },
  ]);
  assert.deepEqual(state.possessedLineIds, ['line-13']);
  assert.equal(state.pressure, 3);
});

test('the finale forces full escalation even on a clean playthrough', () => {
  const state = reduceHauntingLog([
    { type: 'FINALE_UNLOCKED', sequence: 0, timestampOffsetMs: 0, lineId: 'line-13' },
  ]);
  assert.equal(state.pressure, 0);
  assert.equal(state.escalation, 3);
});

test('a possession cue never plays below the level the graph reported', () => {
  const step = mapEvent(
    { type: 'LINE_POSSESSED', sequence: 0, timestampOffsetMs: 0, lineId: 'line-13', intensity: 3 },
    INITIAL_HAUNTING_STATE,
  );
  for (const cue of step.cues) {
    assert.equal(cue.intensity, 3);
  }
});

test('state folding is order dependent but replay stable', () => {
  const events: readonly GameEvent[] = [
    rejection(0, 'caller-a'),
    { type: 'CALL_BLEED_STARTED', sequence: 1, timestampOffsetMs: 100, sourceCallerId: 'caller-a', affectedCallerId: 'caller-b' },
    rejection(2, 'caller-a'),
  ];
  assert.deepEqual(reduceHauntingLog(events), reduceHauntingLog(events));
  assert.equal(reduceHauntingLog(events).lastSequence, 2);
});

test('plug counting never falls below zero on an unmatched removal', () => {
  const state = reduceHauntingLog([
    { type: 'PLUG_REMOVED', sequence: 0, timestampOffsetMs: 0, callerId: 'caller-a', destinationId: 'dest-a' },
  ]);
  assert.equal(state.openPlugs, 0);
});
