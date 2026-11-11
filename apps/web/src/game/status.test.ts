import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SLICE_EPISODE } from '../episode/slice-episode.ts';
import { replay } from './reducer.ts';
import { formatLineLabel, promptText, statusText } from './status.ts';
import type { GameAction } from './types.ts';

const EPISODE = SLICE_EPISODE;
const CALLER = 'caller-ruth';

function statusAfter(actions: readonly GameAction[]): string {
  return statusText(replay(actions, EPISODE), EPISODE);
}

function promptAfter(actions: readonly GameAction[]): string {
  return promptText(replay(actions, EPISODE));
}

const OPEN: readonly GameAction[] = [{ type: 'OPEN_EXCHANGE', atMs: 0 }];
const RINGING: readonly GameAction[] = [
  ...OPEN,
  { type: 'FINISH_INTRO', atMs: 6000, skipped: false },
];
const HOLDING: readonly GameAction[] = [...RINGING, { type: 'ANSWER_CALL', atMs: 6400, callerId: 'caller-ruth' }];
const IN_HAND: readonly GameAction[] = [
  ...HOLDING,
  { type: 'LIFT_CORD', atMs: 7000, callerId: CALLER },
];

describe('formatLineLabel', () => {
  it('reads a line id as an engraved label', () => {
    assert.equal(formatLineLabel('line-03'), 'LINE 03');
    assert.equal(formatLineLabel('line-13'), 'LINE 13');
  });
});

describe('the engraved status plate', () => {
  it('shows the exact text for every state the slice reaches', () => {
    assert.equal(statusAfter([]), 'EXCHANGE DORMANT');
    assert.equal(statusAfter(OPEN), 'NIGHT LINE OPENING');
    assert.equal(statusAfter(RINGING), 'LINE 03 RINGING — ANSWER THE CALL');
    assert.equal(statusAfter(HOLDING), 'LINE 03 HOLDING — LIFT THE CORD');
    assert.equal(statusAfter(IN_HAND), 'CORD IN HAND — CHOOSE A DESTINATION JACK');

    assert.equal(
      statusAfter([
        ...IN_HAND,
        { type: 'PLUG_CORD', atMs: 7600, destinationId: 'destination-bell-tower' },
      ]),
      'LINE 03 PATCHED TO BELL TOWER — CLOSE THE CIRCUIT OR PULL THE CORD',
    );

    assert.equal(
      statusAfter([
        ...IN_HAND,
        { type: 'PLUG_CORD', atMs: 7600, destinationId: 'destination-morgue' },
        { type: 'CLOSE_CIRCUIT', atMs: 8200 },
      ]),
      'CROSSED LINE ON MORGUE — PULL THE CORD TO RECOVER',
    );

    assert.equal(
      statusAfter([
        ...IN_HAND,
        { type: 'PLUG_CORD', atMs: 7600, destinationId: 'destination-bell-tower' },
        { type: 'CLOSE_CIRCUIT', atMs: 8200 },
      ]),
      'LINE 13 IS RINGING BEHIND YOU',
    );

    assert.equal(
      statusAfter([
        ...IN_HAND,
        { type: 'PLUG_CORD', atMs: 7600, destinationId: 'destination-bell-tower' },
        { type: 'CLOSE_CIRCUIT', atMs: 8200 },
        { type: 'SELECT_ENDING', atMs: 9000, endingId: 'ending-first-connection' },
      ]),
      'NIGHT SHIFT ENDED — THE FIRST CONNECTION',
    );
  });

  it('never leaves the plate blank', () => {
    const paths: readonly (readonly GameAction[])[] = [[], OPEN, RINGING, HOLDING, IN_HAND];
    for (const path of paths) {
      assert.notEqual(statusAfter(path).trim(), '');
    }
  });
});

describe('the next instruction', () => {
  it('tells the operator what to do without a tutorial screen', () => {
    assert.equal(promptAfter(RINGING), 'A lamp is ringing. Tap it to answer, tap again to lift the cord. Any order works.');
    assert.equal(promptAfter(HOLDING), 'Lift the cord from a holding line, and plug it where her clues point.');
    assert.equal(promptAfter(IN_HAND), 'Plug the cord into the jack her clues point to.');
    assert.equal(
      promptAfter([
        ...IN_HAND,
        { type: 'PLUG_CORD', atMs: 7600, destinationId: 'destination-bell-tower' },
      ]),
      'Close the circuit, or pull the cord and think again.',
    );
  });

  it('reassures the operator that a crossed line is recoverable', () => {
    assert.equal(
      promptAfter([
        ...IN_HAND,
        { type: 'PLUG_CORD', atMs: 7600, destinationId: 'destination-morgue' },
        { type: 'CLOSE_CIRCUIT', atMs: 8200 },
      ]),
      'Pull the cord. Nothing is lost.',
    );
  });
});
