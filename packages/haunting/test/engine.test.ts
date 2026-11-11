import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHauntingEngine, playFrame } from '../src/engine.ts';
import { createSilentAudioAdapter } from '../src/audio/silent-adapter.ts';
import { createWebAudioAdapter } from '../src/audio/web-audio-adapter.ts';
import { DEFAULT_HAUNTING_SETTINGS, SILENT_HAUNTING_SETTINGS } from '../src/settings.ts';
import type { SubtitleSource } from '../src/subtitles.ts';
import { createFakeAudioContext } from './fake-audio.ts';
import { sampleEvents } from './events.ts';

const SUBTITLES: SubtitleSource = {
  callers: [
    { id: 'caller-widow', subtitle: 'The widow speaks.' },
    { id: 'caller-sailor', subtitle: 'Water in the line.' },
    { id: 'line-13', subtitle: 'You already know my name.' },
  ],
  assets: [],
};

test('two engines fed the same log produce deep-equal frames', () => {
  const events = sampleEvents();
  const first = createHauntingEngine({ subtitleSource: SUBTITLES }).handleAll(events);
  const second = createHauntingEngine({ subtitleSource: SUBTITLES }).handleAll(events);

  assert.deepEqual(second, first);
});

test('reset returns the engine to its initial escalation', () => {
  const engine = createHauntingEngine();
  engine.handleAll(sampleEvents());
  assert.ok(engine.getState().escalation > 1);

  engine.reset();
  assert.equal(engine.getState().escalation, 1);
  assert.equal(engine.getState().totalRejections, 0);
});

test('changing settings mid-playthrough changes presentation only', () => {
  const events = sampleEvents();
  const loud = createHauntingEngine({ settings: DEFAULT_HAUNTING_SETTINGS });
  const quiet = createHauntingEngine({ settings: SILENT_HAUNTING_SETTINGS });

  const loudFrames = loud.handleAll(events);
  const quietFrames = quiet.handleAll(events);

  assert.deepEqual(
    quietFrames.map((frame) => frame.cues),
    loudFrames.map((frame) => frame.cues),
  );
  assert.notDeepEqual(
    quietFrames.map((frame) => frame.presentations),
    loudFrames.map((frame) => frame.presentations),
  );
});

test('every spoken frame carries its exact subtitle', () => {
  const engine = createHauntingEngine({ subtitleSource: SUBTITLES });
  const frames = engine.handleAll(sampleEvents());

  for (const frame of frames) {
    const spoken = frame.cues.filter((cue) => cue.channel === 'voice-filter');
    assert.equal(frame.subtitles.length + frame.missingSubtitles.length, spoken.length);
    for (const line of frame.subtitles) {
      assert.ok(line.text.length > 0);
    }
  }
});

test('playFrame skips cues the player already silenced', async () => {
  const engine = createHauntingEngine({ settings: SILENT_HAUNTING_SETTINGS });
  const adapter = createSilentAudioAdapter();
  await adapter.unlock();

  const frame = engine.handle({
    type: 'CALL_ANSWERED',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-widow',
  });

  const played = await playFrame(adapter, frame);
  assert.deepEqual(played.results, []);
  assert.deepEqual(played.needsSilentAlternative, []);
});

test('playFrame reports which cues need a silent alternative', async () => {
  const engine = createHauntingEngine();
  const context = createFakeAudioContext();
  const adapter = createWebAudioAdapter({ createContext: () => context });
  await adapter.unlock();

  const frame = engine.handle({
    type: 'CALL_ANSWERED',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-widow',
  });

  // No voice asset is supplied, so the speech cue cannot play and the UI is
  // told to show the caption instead. The jack contact still sounds.
  const played = await playFrame(adapter, frame);
  const outcomes = played.results.map((result) => result.outcome);

  assert.ok(outcomes.includes('played'));
  assert.ok(outcomes.includes('fallback'));
  assert.equal(played.needsSilentAlternative.length, 1);
  assert.equal(played.needsSilentAlternative[0]?.channel, 'voice-filter');

  await adapter.dispose();
});

test('a locked adapter blocks playback but never the frame', async () => {
  const engine = createHauntingEngine();
  const context = createFakeAudioContext();
  const adapter = createWebAudioAdapter({ createContext: () => context });

  const frame = engine.handle({
    type: 'CALL_RINGING',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-widow',
    lineId: 'line-01',
  });

  const played = await playFrame(adapter, frame);
  assert.ok(frame.cues.length > 0, 'the frame still describes the ringing line');
  assert.equal(played.results.every((result) => result.outcome === 'locked'), true);
  assert.equal(played.needsSilentAlternative.length, 1);
});

test('audio failure does not touch haunting state', async () => {
  const engine = createHauntingEngine();
  const adapter = createSilentAudioAdapter();
  await adapter.unlock();

  const frames = engine.handleAll(sampleEvents());
  const stateAfterFrames = engine.getState();

  for (const frame of frames) {
    await playFrame(adapter, frame);
  }

  assert.deepEqual(engine.getState(), stateAfterFrames);
});
