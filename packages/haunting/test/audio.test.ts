import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SoundCue, VoiceFilterCue } from '../src/contracts.ts';
import { createHauntingAudio } from '../src/audio/index.ts';
import { createPlainAudioAdapter } from '../src/audio/plain-audio-adapter.ts';
import { createSilentAudioAdapter } from '../src/audio/silent-adapter.ts';
import { createWebAudioAdapter } from '../src/audio/web-audio-adapter.ts';
import { mapEvent } from '../src/cue-mapper.ts';
import {
  createFakeAudioContext,
  createFakeAudioElement,
  type FakeAudioContext,
} from './fake-audio.ts';

function bellCue(): SoundCue {
  const cue = mapEvent({
    type: 'CALL_RINGING',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
    lineId: 'line-01',
  }).cues.find((candidate) => candidate.channel === 'sound');
  assert.ok(cue?.channel === 'sound');
  return cue;
}

function voiceCue(): VoiceFilterCue {
  const cue = mapEvent({
    type: 'CALL_ANSWERED',
    sequence: 1,
    timestampOffsetMs: 0,
    callerId: 'caller-a',
  }).cues.find((candidate) => candidate.channel === 'voice-filter');
  assert.ok(cue?.channel === 'voice-filter');
  return cue;
}

function webAdapter(context: FakeAudioContext, loaded: ArrayBuffer | null = null) {
  return createWebAudioAdapter({
    createContext: () => context,
    loadAsset: async () => loaded,
  });
}

test('nothing sounds before an explicit interaction unlocks audio', async () => {
  const context = createFakeAudioContext();
  const adapter = webAdapter(context);

  const before = await adapter.play(bellCue());
  assert.equal(before.outcome, 'locked');
  assert.equal(adapter.getState().unlocked, false);
  assert.equal(context.log.started, 0, 'a node started before unlock');
  assert.equal(context.log.resumed, 0, 'the context was resumed without a gesture');
});

test('unlock resumes the context and lets the exchange ring', async () => {
  const context = createFakeAudioContext();
  const adapter = webAdapter(context);

  const unlocked = await adapter.unlock();
  assert.deepEqual(unlocked, { ok: true, kind: 'web-audio' });
  assert.equal(context.log.resumed, 1);

  const cue = bellCue();
  const played = await adapter.play(cue);
  assert.equal(played.outcome, 'played');
  assert.equal(played.outcome === 'played' ? played.durationMs : 0, cue.durationMs);
  assert.ok(context.log.started > 0);
  assert.equal(adapter.getState().activeVoices, 1);

  await adapter.dispose();
});

test('a blocked context degrades to the plain-audio pipeline', async () => {
  const blocked = createFakeAudioContext({ resumeRejects: true });
  const element = createFakeAudioElement();
  const adapter = createHauntingAudio({
    webAudio: { createContext: () => blocked },
    plainAudio: { createElement: () => element },
  });

  const unlocked = await adapter.unlock();
  assert.deepEqual(unlocked, { ok: true, kind: 'plain-audio' });
  assert.equal(adapter.getState().kind, 'plain-audio');

  // A synthesized effect has no file, so it must report a fallback rather than
  // pretend it played.
  const effect = await adapter.play(bellCue());
  assert.equal(effect.outcome, 'fallback');
  assert.equal(effect.outcome === 'fallback' ? effect.reason : null, 'unsupported');

  // Published speech is a finished file and still arrives.
  const spoken = await adapter.speak(voiceCue(), 'voice-widow');
  assert.equal(spoken.outcome, 'played');
  assert.equal(element.plays(), 1);

  await adapter.dispose();
});

test('with no pipeline at all the game still runs on silence', async () => {
  const adapter = createHauntingAudio({});
  const unlocked = await adapter.unlock();

  assert.deepEqual(unlocked, { ok: true, kind: 'silent' });
  const result = await adapter.play(bellCue());
  assert.equal(result.outcome, 'fallback');
  assert.equal(result.outcome === 'fallback' ? result.reason : null, 'unsupported');
});

test('mute silences new cues and cuts the ones already sounding', async () => {
  const context = createFakeAudioContext();
  const adapter = webAdapter(context);
  await adapter.unlock();
  await adapter.play(bellCue());
  assert.equal(adapter.getState().activeVoices, 1);

  adapter.setMuted(true);
  assert.equal(adapter.getState().muted, true);
  assert.equal(adapter.getState().activeVoices, 0, 'mute left a voice sounding');

  const muted = await adapter.play(bellCue());
  assert.equal(muted.outcome, 'muted');

  adapter.setMuted(false);
  const resumed = await adapter.play(bellCue());
  assert.equal(resumed.outcome, 'played');

  await adapter.dispose();
});

test('a missing voice asset falls back without throwing', async () => {
  const context = createFakeAudioContext();
  const adapter = webAdapter(context, null);
  await adapter.unlock();

  const result = await adapter.speak(voiceCue(), 'voice-missing');
  assert.equal(result.outcome, 'fallback');
  assert.equal(result.outcome === 'fallback' ? result.reason : null, 'asset-missing');
});

test('an undecodable voice asset falls back without throwing', async () => {
  const context = createFakeAudioContext({ decodeRejects: true });
  const adapter = createWebAudioAdapter({
    createContext: () => context,
    loadAsset: async () => new ArrayBuffer(16),
  });
  await adapter.unlock();

  const result = await adapter.speak(voiceCue(), 'voice-widow');
  assert.equal(result.outcome, 'fallback');
  assert.equal(result.outcome === 'fallback' ? result.reason : null, 'decode-failed');
});

test('a decoded voice asset is cached rather than decoded twice', async () => {
  const context = createFakeAudioContext();
  const adapter = createWebAudioAdapter({
    createContext: () => context,
    loadAsset: async () => new ArrayBuffer(16),
  });
  await adapter.unlock();

  const first = await adapter.speak(voiceCue(), 'voice-widow');
  const second = await adapter.speak(voiceCue(), 'voice-widow');

  assert.equal(first.outcome, 'played');
  assert.equal(second.outcome, 'played');
  assert.equal(context.log.decoded, 1);

  await adapter.dispose();
});

test('dispose stops every voice, closes the context, and stays closed', async () => {
  const context = createFakeAudioContext();
  const adapter = webAdapter(context);
  await adapter.unlock();
  await adapter.play(bellCue());

  await adapter.dispose();
  assert.equal(context.log.closed, 1);
  assert.equal(adapter.getState().disposed, true);
  assert.equal(adapter.getState().activeVoices, 0);

  const afterDispose = await adapter.play(bellCue());
  assert.equal(afterDispose.outcome, 'fallback');
  assert.equal(
    afterDispose.outcome === 'fallback' ? afterDispose.reason : null,
    'disposed',
  );

  await adapter.dispose();
  assert.equal(context.log.closed, 1, 'dispose closed the context twice');
});

test('stopAll clears sounding voices without disposing the adapter', async () => {
  const context = createFakeAudioContext();
  const adapter = webAdapter(context);
  await adapter.unlock();
  await adapter.play(bellCue());

  adapter.stopAll();
  assert.equal(adapter.getState().activeVoices, 0);
  assert.equal(adapter.getState().disposed, false);

  await adapter.dispose();
});

test('a media element that refuses to play reports playback-failed', async () => {
  const element = createFakeAudioElement(true);
  const adapter = createPlainAudioAdapter({ createElement: () => element });
  await adapter.unlock();

  const result = await adapter.speak(voiceCue(), 'voice-widow');
  assert.equal(result.outcome, 'fallback');
  assert.equal(result.outcome === 'fallback' ? result.reason : null, 'playback-failed');
});

test('the silent adapter reports locked before unlock and muted after mute', async () => {
  const adapter = createSilentAudioAdapter();
  assert.equal((await adapter.play(bellCue())).outcome, 'locked');

  await adapter.unlock();
  adapter.setMuted(true);
  assert.equal((await adapter.play(bellCue())).outcome, 'muted');

  await adapter.dispose();
  assert.equal((await adapter.play(bellCue())).outcome, 'fallback');
});

test('synthesized noise is identical for the same cue id', async () => {
  const first = createFakeAudioContext();
  const second = createFakeAudioContext();
  const cue = bellCue();

  const a = webAdapter(first);
  const b = webAdapter(second);
  await a.unlock();
  await b.unlock();
  await a.play(cue);
  await b.play(cue);

  assert.equal(first.log.started, second.log.started);
  assert.equal(first.log.buffersCreated, second.log.buffersCreated);

  await a.dispose();
  await b.dispose();
});
