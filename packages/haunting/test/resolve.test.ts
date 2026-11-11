import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAudibleCue, mapEvent, mapEvents } from '../src/cue-mapper.ts';
import {
  isMotionCue,
  isPerceivable,
  resolveCue,
  resolveCues,
} from '../src/resolve.ts';
import {
  DEFAULT_HAUNTING_SETTINGS,
  SILENT_HAUNTING_SETTINGS,
  withSettings,
} from '../src/settings.ts';
import { INITIAL_HAUNTING_STATE } from '../src/state.ts';
import { oneOfEachEvent, sampleEvents } from './events.ts';

const MUTED = withSettings(DEFAULT_HAUNTING_SETTINGS, { muted: true });
const STILL = withSettings(DEFAULT_HAUNTING_SETTINGS, { reducedMotion: true });
const MUTED_AND_STILL = withSettings(SILENT_HAUNTING_SETTINGS, { reducedMotion: true });

test('default settings play every cue as authored', () => {
  const { cues } = mapEvents(sampleEvents());
  for (const presentation of resolveCues(cues, DEFAULT_HAUNTING_SETTINGS)) {
    assert.equal(presentation.mode, 'as-authored');
  }
});

test('muting routes every audible cue to a caption or visual signal', () => {
  const { cues } = mapEvents(sampleEvents());
  const audible = cues.filter(isAudibleCue);
  assert.ok(audible.length > 0);

  for (const cue of audible) {
    const presentation = resolveCue(cue, MUTED);
    assert.equal(presentation.mode, 'silent');
    assert.equal(presentation.mode === 'silent' ? presentation.reason : null, 'muted');
    assert.ok(
      presentation.mode === 'silent' &&
        (presentation.alternative === 'caption' ||
          presentation.alternative === 'visual-signal'),
      `${cue.id} has no usable silent alternative`,
    );
  }
});

test('an unavailable pipeline is reported separately from a muted player', () => {
  const { cues } = mapEvent({
    type: 'CALL_ANSWERED',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
  });
  const voice = cues.find((cue) => cue.channel === 'voice-filter');
  assert.ok(voice !== undefined);

  const unavailable = resolveCue(
    voice,
    withSettings(DEFAULT_HAUNTING_SETTINGS, { audioAvailable: false }),
  );
  assert.equal(unavailable.mode, 'silent');
  assert.equal(
    unavailable.mode === 'silent' ? unavailable.reason : null,
    'audio-unavailable',
  );
  assert.equal(
    unavailable.mode === 'silent' ? unavailable.alternative : null,
    'caption',
  );
});

test('speech falls back to a caption and effects to a visual signal', () => {
  const { cues } = mapEvent({
    type: 'CALL_ANSWERED',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
  });

  const voice = cues.find((cue) => cue.channel === 'voice-filter');
  const sound = cues.find((cue) => cue.channel === 'sound');
  assert.ok(voice !== undefined && sound !== undefined);

  assert.equal(voice.silentAlternative, 'caption');
  assert.equal(sound.silentAlternative, 'visual-signal');
});

test('reduced motion replaces motion cues and leaves still ones alone', () => {
  const { cues } = mapEvents(sampleEvents());
  for (const cue of cues) {
    const presentation = resolveCue(cue, STILL);
    if (isAudibleCue(cue)) {
      assert.equal(presentation.mode, 'as-authored');
      continue;
    }
    if (!isMotionCue(cue)) {
      assert.equal(presentation.mode, 'as-authored', `${cue.id} is not motion`);
      continue;
    }
    assert.ok(
      presentation.mode === 'reduced-motion' || presentation.mode === 'suppressed',
      `${cue.id} kept its motion under reduced motion`,
    );
  }
});

test('a steady lamp survives reduced motion; a flickering one does not', () => {
  const steady = mapEvent({
    type: 'ROUTE_CONFIRMED',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
    destinationId: 'dest-a',
  }).cues.find((cue) => cue.channel === 'lamp');

  const flicker = mapEvent(
    {
      type: 'ROUTE_REJECTED',
      sequence: 1,
      timestampOffsetMs: 0,
      callerId: 'caller-a',
      destinationId: 'dest-a',
      reason: 'constraint',
    },
    INITIAL_HAUNTING_STATE,
  ).cues.find((cue) => cue.channel === 'lamp');

  assert.ok(steady !== undefined && flicker !== undefined);
  assert.equal(isMotionCue(steady), false);
  assert.equal(isMotionCue(flicker), true);
  assert.equal(resolveCue(steady, STILL).mode, 'as-authored');
  assert.equal(resolveCue(flicker, STILL).mode, 'reduced-motion');
});

test('a camera jolt is dropped rather than faked under reduced motion', () => {
  const jolt = mapEvent(
    { type: 'LINE_POSSESSED', sequence: 0, timestampOffsetMs: 0, lineId: 'line-13', intensity: 3 },
    INITIAL_HAUNTING_STATE,
  ).cues.find((cue) => cue.channel === 'camera');

  assert.ok(jolt !== undefined);
  assert.equal(jolt.reducedMotionAlternative, 'none');
  const presentation = resolveCue(jolt, STILL);
  assert.equal(presentation.mode, 'suppressed');
  assert.equal(
    presentation.mode === 'suppressed' ? presentation.reason : null,
    'reduced-motion',
  );
});

test('a resolved alternative is never the string none', () => {
  const { cues } = mapEvents(sampleEvents());
  for (const presentation of resolveCues(cues, MUTED_AND_STILL)) {
    if (presentation.mode === 'silent' || presentation.mode === 'reduced-motion') {
      assert.notEqual(presentation.alternative, 'none');
    }
  }
});

test('every event stays perceivable with no audio and no motion', () => {
  for (const event of oneOfEachEvent()) {
    const { cues } = mapEvent(event, INITIAL_HAUNTING_STATE);
    const presentations = resolveCues(cues, MUTED_AND_STILL);
    assert.ok(
      isPerceivable(presentations),
      `${event.type} becomes invisible and inaudible at once`,
    );
  }
});

test('settings change presentation only, never which cues fire', () => {
  const events = sampleEvents();
  const loud = mapEvents(events).cues;
  const silent = mapEvents(events).cues;

  assert.deepEqual(resolveCues(silent, MUTED_AND_STILL).map((p) => p.cue.id),
    resolveCues(loud, DEFAULT_HAUNTING_SETTINGS).map((p) => p.cue.id));
});
