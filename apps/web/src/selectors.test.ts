import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SLICE_EPISODE } from './episode/slice-episode.ts';
import { LINE_13_ID, replay } from './game/reducer.ts';
import type { GameAction } from './game/types.ts';
import {
  LAMP_WORD,
  boardJacks,
  canCloseCircuit,
  canPullCord,
  currentSubtitle,
  readyEnding,
  revealedClues,
  routeSummary,
  selectedEnding,
} from './selectors.ts';

const EPISODE = SLICE_EPISODE;
const CALLER = 'caller-ruth';

function stateAfter(actions: readonly GameAction[]) {
  return replay(actions, EPISODE);
}

const ANSWERED: readonly GameAction[] = [
  { type: 'OPEN_EXCHANGE', atMs: 0 },
  { type: 'FINISH_INTRO', atMs: 6000, skipped: false },
  { type: 'ANSWER_CALL', atMs: 6400, callerId: 'caller-ruth' },
];

describe('the face of the board', () => {
  it('shows the caller line, every destination jack and line 13', () => {
    const jacks = boardJacks(stateAfter(ANSWERED), EPISODE);
    assert.deepEqual(
      jacks.map((jack) => jack.kind),
      ['caller', 'destination', 'destination', 'destination', 'line-13'],
    );
    assert.equal(jacks.at(-1)?.id, LINE_13_ID);
  });

  it('gives every lamp a word as well as a state', () => {
    const jacks = boardJacks(stateAfter(ANSWERED), EPISODE);
    for (const jack of jacks) {
      assert.equal(jack.lampWord, LAMP_WORD[jack.lamp]);
      assert.notEqual(jack.lampWord.trim(), '');
    }
  });

  it('rings the caller lamp before the call is answered', () => {
    const ringing = boardJacks(stateAfter(ANSWERED.slice(0, 2)), EPISODE);
    const caller = ringing.find((jack) => jack.kind === 'caller');
    assert.ok(caller !== undefined);
    assert.equal(caller.lamp, 'ringing');
    assert.equal(caller.lampWord, 'RINGING');
  });

  it('only makes destination jacks operable while a cord is in hand', () => {
    const holding = boardJacks(stateAfter(ANSWERED), EPISODE);
    assert.equal(
      holding.filter((jack) => jack.kind === 'destination').every((jack) => jack.action === null),
      true,
    );

    const inHand = boardJacks(
      stateAfter([...ANSWERED, { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER }]),
      EPISODE,
    );
    assert.equal(
      inHand.filter((jack) => jack.kind === 'destination').every((jack) => jack.action !== null),
      true,
    );
  });

  it('marks the crossed jack and the crossed line after a refusal', () => {
    const jacks = boardJacks(
      stateAfter([
        ...ANSWERED,
        { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
        { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-morgue' },
        { type: 'CLOSE_CIRCUIT', atMs: 8000 },
      ]),
      EPISODE,
    );
    const morgue = jacks.find((jack) => jack.id === 'destination-morgue');
    const caller = jacks.find((jack) => jack.kind === 'caller');
    assert.ok(morgue !== undefined && caller !== undefined);
    assert.equal(morgue.lamp, 'flicker');
    assert.equal(morgue.lampWord, 'CROSSED');
    assert.equal(caller.lamp, 'flicker');
  });

  it('wakes line 13 only once the circuit closes', () => {
    const before = boardJacks(stateAfter(ANSWERED), EPISODE).at(-1);
    assert.ok(before !== undefined);
    assert.equal(before.lamp, 'dark');
    assert.equal(before.action !== null, false);

    const after = boardJacks(
      stateAfter([
        ...ANSWERED,
        { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
        { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-bell-tower' },
        { type: 'CLOSE_CIRCUIT', atMs: 8000 },
      ]),
      EPISODE,
    ).at(-1);
    assert.ok(after !== undefined);
    assert.equal(after.lamp, 'ringing');
    assert.equal(after.action !== null, true);
  });

  it('shows line 13 listening after the room escalates', () => {
    const escalated = stateAfter([
      ...ANSWERED,
      { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-morgue' },
      { type: 'CLOSE_CIRCUIT', atMs: 8000 },
      { type: 'PULL_CORD', atMs: 8400 },
      { type: 'LIFT_CORD', atMs: 8600, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 9000, destinationId: 'destination-orchard' },
      { type: 'CLOSE_CIRCUIT', atMs: 9400 },
    ]);
    const line13 = boardJacks(escalated, EPISODE).at(-1);
    assert.ok(line13 !== undefined);
    assert.equal(line13.lamp, 'listening');
    assert.equal(line13.lampWord, 'LISTENING');
  });
});

describe('the routing ticket', () => {
  it('prints only the clues she has actually given', () => {
    const answered = revealedClues(stateAfter(ANSWERED), EPISODE);
    assert.deepEqual(
      answered.map((clue) => clue.id),
      ['clue-ruth-clock', 'clue-ruth-orchard'],
    );
  });
});

describe('subtitles', () => {
  it('shows the most recent spoken line exactly', () => {
    const line = currentSubtitle(stateAfter(ANSWERED));
    assert.ok(line !== null);
    assert.equal(
      line.text,
      'Do not place me beside the orchard. Something there has learned my voice.',
    );
  });

  it('shows nothing before anyone has spoken', () => {
    assert.equal(currentSubtitle(stateAfter(ANSWERED.slice(0, 2))), null);
  });

  it('ignores written exchange notes, which are not spoken', () => {
    const pulled = stateAfter([
      ...ANSWERED,
      { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-bell-tower' },
      { type: 'PULL_CORD', atMs: 7800 },
    ]);
    const line = currentSubtitle(pulled);
    assert.ok(line !== null);
    assert.equal(line.speaker, 'caller');
  });
});

describe('what the operator may do next', () => {
  it('allows closing the circuit only while a cord is patched', () => {
    assert.equal(canCloseCircuit(stateAfter(ANSWERED)), false);
    const patched = stateAfter([
      ...ANSWERED,
      { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-bell-tower' },
    ]);
    assert.equal(canCloseCircuit(patched), true);
  });

  it('always allows pulling a patched or rejected cord', () => {
    const patched = stateAfter([
      ...ANSWERED,
      { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
      { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-morgue' },
    ]);
    assert.equal(canPullCord(patched), true);
    const rejected = replay(
      [
        ...ANSWERED,
        { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
        { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-morgue' },
        { type: 'CLOSE_CIRCUIT', atMs: 8000 },
      ],
      EPISODE,
    );
    assert.equal(canPullCord(rejected), true);
  });
});

describe('the ending', () => {
  const CLOSED: readonly GameAction[] = [
    ...ANSWERED,
    { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
    { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-bell-tower' },
    { type: 'CLOSE_CIRCUIT', atMs: 8000 },
  ];

  it('is not ready until the circuit closes', () => {
    assert.equal(readyEnding(stateAfter(ANSWERED), EPISODE), null);
    assert.equal(readyEnding(stateAfter(CLOSED), EPISODE)?.id, 'ending-first-connection');
  });

  it('is only selected once the operator answers the thirteenth lamp', () => {
    assert.equal(selectedEnding(stateAfter(CLOSED), EPISODE), null);
    const ended = stateAfter([
      ...CLOSED,
      { type: 'SELECT_ENDING', atMs: 9000, endingId: 'ending-first-connection' },
    ]);
    assert.equal(selectedEnding(ended, EPISODE)?.label, 'The First Connection');
  });

  it('summarises the route in the operator own terms', () => {
    assert.equal(routeSummary(stateAfter(CLOSED), EPISODE), 'LINE 03 → BELL TOWER');
    assert.equal(routeSummary(stateAfter(ANSWERED), EPISODE), 'NO CIRCUIT CLOSED');
  });
});
