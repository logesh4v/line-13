import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTRO_BEATS,
  INTRO_DURATION_MS,
  INTRO_MAX_MS,
  REDUCED_MOTION_INTRO_MS,
  SKIP_KEYS,
  beatAt,
  introDuration,
} from './introTimeline.ts';

describe('the entrance', () => {
  it('lasts no more than seven seconds', () => {
    assert.ok(INTRO_DURATION_MS <= INTRO_MAX_MS, `${INTRO_DURATION_MS}ms exceeds the ceiling`);
  });

  it('runs for the six seconds the design specifies', () => {
    assert.equal(INTRO_DURATION_MS, 6000);
  });

  it('starts at zero and runs with no gap and no overlap', () => {
    let cursor = 0;
    for (const beat of INTRO_BEATS) {
      assert.equal(beat.startMs, cursor, `beat ${beat.id} does not follow the previous one`);
      assert.ok(beat.endMs > beat.startMs, `beat ${beat.id} has no duration`);
      cursor = beat.endMs;
    }
    assert.equal(cursor, INTRO_DURATION_MS);
  });

  it('walks darkness, plate, door, desk in that order', () => {
    assert.deepEqual(
      INTRO_BEATS.map((beat) => beat.id),
      ['darkness', 'plate', 'door', 'desk'],
    );
  });

  it('captions every beat, so the bell is never the only signal', () => {
    for (const beat of INTRO_BEATS) {
      assert.notEqual(beat.caption.trim(), '');
    }
  });

  it('finds the beat at any point on the timeline', () => {
    assert.equal(beatAt(0)?.id, 'darkness');
    assert.equal(beatAt(1199)?.id, 'darkness');
    assert.equal(beatAt(1200)?.id, 'plate');
    assert.equal(beatAt(4500)?.id, 'desk');
    assert.equal(beatAt(INTRO_DURATION_MS), null);
    assert.equal(beatAt(-1), null);
  });
});

describe('holding the room still', () => {
  it('replaces the camera move with a shorter static reveal', () => {
    assert.ok(REDUCED_MOTION_INTRO_MS < INTRO_DURATION_MS);
    assert.equal(introDuration(true), REDUCED_MOTION_INTRO_MS);
    assert.equal(introDuration(false), INTRO_DURATION_MS);
  });

  it('still stays under the ceiling', () => {
    assert.ok(introDuration(true) <= INTRO_MAX_MS);
  });
});

describe('skipping', () => {
  it('documents Escape and the obvious confirm keys', () => {
    assert.ok(SKIP_KEYS.includes('Escape'));
    assert.ok(SKIP_KEYS.includes('Enter'));
    assert.ok(SKIP_KEYS.includes(' '));
  });
});
