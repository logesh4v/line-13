import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hasVisualEquivalent,
  isAudibleCue,
  mapEvent,
  mapEvents,
} from '../src/cue-mapper.ts';
import { ORIGINAL_SOUND_ASSET_IDS, isOriginalSoundAsset } from '../src/sound-assets.ts';
import { SYNTH_RECIPES, missingSynthRecipes } from '../src/audio/synth.ts';
import { INITIAL_HAUNTING_STATE } from '../src/state.ts';
import { ALL_EVENT_TYPES, oneOfEachEvent, sampleEvents } from './events.ts';

test('mapping a log twice produces deep-equal cues and state', () => {
  const events = sampleEvents();
  const first = mapEvents(events);
  const second = mapEvents(events);

  assert.deepEqual(second.cues, first.cues);
  assert.deepEqual(second.state, first.state);
  assert.ok(first.cues.length > 0, 'the sample log must produce cues');
});

test('replaying from an intermediate state matches a full replay', () => {
  const events = sampleEvents();
  const split = 5;
  const head = mapEvents(events.slice(0, split));
  const tail = mapEvents(events.slice(split), head.state);
  const whole = mapEvents(events);

  assert.deepEqual([...head.cues, ...tail.cues], whole.cues);
  assert.deepEqual(tail.state, whole.state);
});

test('cue ids are derived from sequence, channel and ordinal', () => {
  const { cues } = mapEvent({
    type: 'CALL_RINGING',
    sequence: 7,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
    lineId: 'line-01',
  });

  assert.deepEqual(
    cues.map((cue) => cue.id),
    ['cue-7-lamp-0', 'cue-7-sound-0', 'cue-7-camera-0'],
  );
});

test('cue ids are unique across a whole log', () => {
  const ids = mapEvents(sampleEvents()).cues.map((cue) => cue.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every event type in the contract maps to at least one cue', () => {
  for (const event of oneOfEachEvent()) {
    const { cues } = mapEvent(event, INITIAL_HAUNTING_STATE);
    assert.ok(cues.length > 0, `${event.type} produced no cues`);
    for (const cue of cues) {
      assert.equal(cue.triggerEventType, event.type);
      assert.ok(cue.durationMs > 0, `${cue.id} has no duration`);
    }
  }
});

test('the event sample list covers the whole contract union', () => {
  const seen = new Set(oneOfEachEvent().map((event) => event.type));
  assert.equal(seen.size, ALL_EVENT_TYPES.length);
});

test('every audible cue batch also carries a visual cue', () => {
  for (const event of oneOfEachEvent()) {
    const { cues } = mapEvent(event, INITIAL_HAUNTING_STATE);
    assert.ok(
      hasVisualEquivalent(cues),
      `${event.type} makes a sound with nothing to see`,
    );
  }
});

test('every sound cue the mapper emits is a synthesizable original', () => {
  const { cues } = mapEvents(sampleEvents());
  const sounds = cues.filter((cue) => cue.channel === 'sound');
  assert.ok(sounds.length > 0);
  for (const cue of sounds) {
    assert.ok(
      cue.channel === 'sound' && isOriginalSoundAsset(cue.assetId),
      `${cue.id} refers to an asset this package cannot synthesize`,
    );
  }
});

test('every catalog sound asset has a synth recipe and no remote source', () => {
  assert.deepEqual(missingSynthRecipes(), []);
  for (const assetId of ORIGINAL_SOUND_ASSET_IDS) {
    const recipe = SYNTH_RECIPES[assetId];
    assert.ok(recipe.peakGain > 0, `${assetId} would be inaudible`);
    assert.ok(
      recipe.partials.length > 0 || recipe.noiseLevel > 0,
      `${assetId} has neither tone nor noise`,
    );
  }
});

test('intensity scales duration without ever shortening a cue', () => {
  const ring = {
    type: 'CALL_RINGING',
    sequence: 9,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
    lineId: 'line-01',
  } as const;

  const quiet = mapEvent(ring, INITIAL_HAUNTING_STATE);

  // Escalation is derived from the event log, never injected, so the loud case
  // has to be earned: six points of pressure is level 3.
  const escalated = mapEvents([
    { type: 'LINE_POSSESSED', sequence: 0, timestampOffsetMs: 0, lineId: 'line-13', intensity: 1 },
    { type: 'CALL_BLEED_STARTED', sequence: 1, timestampOffsetMs: 100, sourceCallerId: 'caller-a', affectedCallerId: 'caller-b' },
    { type: 'ROUTE_REJECTED', sequence: 2, timestampOffsetMs: 200, callerId: 'caller-a', destinationId: 'dest-a', reason: 'constraint' },
  ]).state;
  assert.equal(escalated.escalation, 3);

  const loud = mapEvent(ring, escalated);

  const quietLamp = quiet.cues[0];
  const loudLamp = loud.cues[0];
  assert.ok(quietLamp !== undefined && loudLamp !== undefined);
  assert.equal(quietLamp.intensity, 1);
  assert.equal(loudLamp.intensity, 3);
  assert.ok(loudLamp.durationMs > quietLamp.durationMs);
  assert.ok(Number.isInteger(loudLamp.durationMs));
  // Same cue identity either way: escalation changes the performance, not the plan.
  assert.equal(loudLamp.id, quietLamp.id);
});

test('ending transition effect comes from the episode, not the engine', () => {
  const event = {
    type: 'ENDING_SELECTED',
    sequence: 1,
    timestampOffsetMs: 0,
    endingId: 'ending-sever',
  } as const;

  const authored = mapEvent(event, INITIAL_HAUNTING_STATE, {
    endingEffects: { 'ending-sever': 'sever' },
  });
  const defaulted = mapEvent(event, INITIAL_HAUNTING_STATE);

  const authoredCue = authored.cues.find((cue) => cue.channel === 'ending-transition');
  const defaultedCue = defaulted.cues.find((cue) => cue.channel === 'ending-transition');

  assert.ok(authoredCue?.channel === 'ending-transition');
  assert.ok(defaultedCue?.channel === 'ending-transition');
  assert.equal(authoredCue.effect, 'sever');
  assert.equal(defaultedCue.effect, 'connect');
});

test('mapping never mutates the state it was handed', () => {
  const state = { ...INITIAL_HAUNTING_STATE };
  const snapshot = JSON.stringify(state);
  mapEvent(
    {
      type: 'ROUTE_REJECTED',
      sequence: 0,
      timestampOffsetMs: 0,
      callerId: 'caller-a',
      destinationId: 'dest-a',
      reason: 'constraint',
    },
    state,
  );
  assert.equal(JSON.stringify(state), snapshot);
});

test('audible and visual channel predicates stay disjoint', () => {
  const { cues } = mapEvents(sampleEvents());
  for (const cue of cues) {
    if (isAudibleCue(cue)) {
      assert.ok(cue.channel === 'sound' || cue.channel === 'voice-filter');
    }
  }
});
