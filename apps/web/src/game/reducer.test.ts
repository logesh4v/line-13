import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SLICE_EPISODE } from '../episode/slice-episode.ts';
import { intendedRouteStillReachable } from './routing.ts';
import { LINE_13_ID, initialState, reduce, replay } from './reducer.ts';
import type { GameAction, GameState } from './types.ts';

const EPISODE = SLICE_EPISODE;
const CALLER = 'caller-ruth';
const CORRECT = 'destination-bell-tower';
const WRONG = 'destination-morgue';
const ALSO_WRONG = 'destination-orchard';

function run(actions: readonly GameAction[]): GameState {
  return replay(actions, EPISODE);
}

const OPEN: readonly GameAction[] = [
  { type: 'OPEN_EXCHANGE', atMs: 0 },
  { type: 'FINISH_INTRO', atMs: 6000, skipped: false },
];

const ANSWERED: readonly GameAction[] = [...OPEN, { type: 'ANSWER_CALL', atMs: 6400, callerId: 'caller-ruth' }];

function eventTypes(state: GameState): readonly string[] {
  return state.events.map((event) => event.type);
}

describe('phases', () => {
  it('opens dormant and never skips a phase', () => {
    const state = initialState();
    assert.equal(state.phase, 'BOOT');
    assert.equal(state.events.length, 0);

    const intro = reduce(state, { type: 'OPEN_EXCHANGE', atMs: 0 }, EPISODE);
    assert.equal(intro.phase, 'INTRO');

    const orientation = reduce(
      intro,
      { type: 'FINISH_INTRO', atMs: 6000, skipped: false },
      EPISODE,
    );
    assert.equal(orientation.phase, 'ORIENTATION');
    assert.equal(orientation.activeCallerId, CALLER);
  });

  it('rings the caller line the moment the entrance ends, skipped or not', () => {
    const played = run(OPEN);
    const skipped = run([
      { type: 'OPEN_EXCHANGE', atMs: 0 },
      { type: 'FINISH_INTRO', atMs: 300, skipped: true },
    ]);

    for (const state of [played, skipped]) {
      assert.deepEqual(eventTypes(state), ['CALL_RINGING']);
      const ringing = state.events[0];
      assert.ok(ringing !== undefined && ringing.type === 'CALL_RINGING');
      assert.equal(ringing.lineId, 'line-03');
    }
    // Skipping the entrance is itself an explicit gesture, so audio unlocks.
    assert.equal(skipped.interacted, true);
  });

  it('refuses an action that does not belong to the current phase', () => {
    const orientation = run(OPEN);
    const unchanged = reduce(orientation, { type: 'LIFT_CORD', atMs: 1, callerId: CALLER }, EPISODE);
    assert.equal(unchanged, orientation);
  });
});

describe('the first call teaches itself', () => {
  it('hands over the clues she leads with when answered', () => {
    const state = run(ANSWERED);
    assert.equal(state.phase, 'ROUTING');
    assert.equal(state.callerStatus['caller-ruth'], 'answered');
    assert.deepEqual(eventTypes(state), [
      'CALL_RINGING',
      'CALL_ANSWERED',
      'CLUE_REVEALED',
      'CLUE_REVEALED',
    ]);
    assert.deepEqual(state.revealedClueIds, ['clue-ruth-clock', 'clue-ruth-orchard']);
  });

  it('subtitles her opening line exactly as the episode wrote it', () => {
    const state = run(ANSWERED);
    const first = state.transcript[0];
    assert.ok(first !== undefined);
    assert.equal(first.text, 'Operator. Put me where the clock rang after midnight.');
    assert.equal(first.spoken, true);
    assert.equal(first.corrupted, false);
  });
});

describe('a wrong route is a consequence, not a failure', () => {
  const wrongRoute: readonly GameAction[] = [
    ...ANSWERED,
    { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
    { type: 'PLUG_CORD', atMs: 7600, destinationId: WRONG },
    { type: 'CLOSE_CIRCUIT', atMs: 8200 },
  ];

  it('rejects the route, crosses the line and corrupts what she said', () => {
    const state = run(wrongRoute);
    assert.equal(state.cord.kind, 'rejected');
    assert.equal(state.crossedLineCount, 1);
    assert.ok(eventTypes(state).includes('ROUTE_REJECTED'));
    assert.equal(state.confirmedRoutes.length, 0);

    const callerLines = state.transcript.filter((line) => line.speaker === 'caller');
    const corruptedOpening = callerLines.slice(0, 3).some((line) => line.corrupted);
    assert.equal(corruptedOpening, true);
  });

  it('explains the refusal in words, not only in lamps', () => {
    const state = run(wrongRoute);
    const exchangeLine = state.transcript.find((line) => line.speaker === 'exchange');
    assert.ok(exchangeLine !== undefined);
    assert.equal(exchangeLine.text, 'Morgue: The line will not hold there.');
  });

  it('teaches the clue that explains the jack just tried', () => {
    const state = run(wrongRoute);
    assert.ok(state.revealedClueIds.includes('clue-ruth-indoors'));
  });

  it('leaves the intended destination reachable from the rejected state', () => {
    const state = run(wrongRoute);
    assert.equal(intendedRouteStillReachable(EPISODE, CALLER, state.confirmedRoutes), true);
  });

  it('recovers completely when the cord is pulled', () => {
    const recovered = run([...wrongRoute, { type: 'PULL_CORD', atMs: 8800 }]);
    assert.equal(recovered.cord.kind, 'idle');
    assert.ok(eventTypes(recovered).includes('PLUG_REMOVED'));
    assert.equal(
      recovered.transcript.some((line) => line.corrupted),
      false,
      'pulling the cord restores the transcript',
    );
  });

  it('escalates on the second crossed line and still recovers', () => {
    const twice = run([
      ...wrongRoute,
      { type: 'PULL_CORD', atMs: 8800 },
      { type: 'LIFT_CORD', atMs: 9000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 9400, destinationId: ALSO_WRONG },
      { type: 'CLOSE_CIRCUIT', atMs: 9900 },
    ]);
    assert.equal(twice.crossedLineCount, 2);
    assert.equal(twice.phase, 'ESCALATION');
    assert.deepEqual(twice.possessedLineIds, [LINE_13_ID]);
    assert.ok(eventTypes(twice).includes('LINE_POSSESSED'));
    assert.equal(intendedRouteStillReachable(EPISODE, CALLER, twice.confirmedRoutes), true);
  });

  it('never strands the player: every legal intermediate state can still finish', () => {
    const everyDestination = EPISODE.destinations.map((destination) => destination.id);
    for (const destinationId of everyDestination) {
      const attempted = run([
        ...ANSWERED,
        { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
        { type: 'PLUG_CORD', atMs: 7600, destinationId },
        { type: 'CLOSE_CIRCUIT', atMs: 8200 },
      ]);
      const finishedOrRecoverable =
        attempted.cord.kind === 'closed' ||
        intendedRouteStillReachable(EPISODE, CALLER, attempted.confirmedRoutes);
      assert.equal(finishedOrRecoverable, true, `stranded after ${destinationId}`);
    }
  });
});

describe('the correct route reaches the miniature ending', () => {
  const fullSlice: readonly GameAction[] = [
    ...ANSWERED,
    { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
    { type: 'PLUG_CORD', atMs: 7600, destinationId: WRONG },
    { type: 'CLOSE_CIRCUIT', atMs: 8200 },
    { type: 'PULL_CORD', atMs: 8800 },
    { type: 'LIFT_CORD', atMs: 9000, callerId: CALLER },
    { type: 'PLUG_CORD', atMs: 9500, destinationId: CORRECT },
    { type: 'CLOSE_CIRCUIT', atMs: 10_200 },
  ];

  it('closes the circuit and wakes the thirteenth lamp', () => {
    const state = run(fullSlice);
    assert.equal(state.cord.kind, 'closed');
    assert.equal(state.phase, 'LINE_13');
    assert.equal(state.line13Awake, true);
    assert.deepEqual(state.confirmedRoutes, [
      { callerId: CALLER, destinationId: CORRECT, order: 1 },
    ]);
    const types = eventTypes(state);
    assert.ok(types.includes('ROUTE_CONFIRMED'));
    assert.ok(types.includes('FINALE_UNLOCKED'));
    assert.ok(
      types.indexOf('ROUTE_CONFIRMED') < types.indexOf('FINALE_UNLOCKED'),
      'the finale is unlocked by the confirmed route, not before it',
    );
  });

  it('reaches the ending when the thirteenth lamp is answered', () => {
    const ended = run([
      ...fullSlice,
      { type: 'SELECT_ENDING', atMs: 12_000, endingId: 'ending-first-connection' },
    ]);
    assert.equal(ended.phase, 'ENDING');
    assert.equal(ended.endingId, 'ending-first-connection');
    assert.equal(eventTypes(ended).at(-1), 'ENDING_SELECTED');
  });

  it('completes the whole slice inside ninety seconds of play', () => {
    const ended = run([
      ...fullSlice,
      { type: 'SELECT_ENDING', atMs: 12_000, endingId: 'ending-first-connection' },
    ]);
    const last = ended.events.at(-1);
    assert.ok(last !== undefined);
    assert.ok(
      last.timestampOffsetMs <= 90_000,
      `the recorded path takes ${last.timestampOffsetMs}ms`,
    );
  });

  it('numbers every event once, in order, with no gap', () => {
    const ended = run([
      ...fullSlice,
      { type: 'SELECT_ENDING', atMs: 12_000, endingId: 'ending-first-connection' },
    ]);
    const sequences = ended.events.map((event) => event.sequence);
    assert.deepEqual(
      sequences,
      sequences.map((_value, index) => index + 1),
    );
    assert.equal(ended.nextSequence, sequences.length + 1);
  });
});

describe('determinism', () => {
  it('reduces the same action list to the same state twice', () => {
    const actions: readonly GameAction[] = [
      ...ANSWERED,
      { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 7600, destinationId: ALSO_WRONG },
      { type: 'CLOSE_CIRCUIT', atMs: 8200 },
      { type: 'PULL_CORD', atMs: 8800 },
      { type: 'LIFT_CORD', atMs: 9000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 9500, destinationId: CORRECT },
      { type: 'CLOSE_CIRCUIT', atMs: 10_200 },
      { type: 'SELECT_ENDING', atMs: 11_000, endingId: 'ending-first-connection' },
    ];
    assert.deepEqual(run(actions), run(actions));
  });

  it('does not mutate the state it was given', () => {
    const before = run(ANSWERED);
    const snapshot = structuredClone(before);
    reduce(before, { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER }, EPISODE);
    assert.deepEqual(before, snapshot);
  });
});
