import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapEvent, mapEvents } from '../src/cue-mapper.ts';
import { resolveSubtitles, type SubtitleSource } from '../src/subtitles.ts';
import { sampleEvents } from './events.ts';

const EXACT_LINE = 'I kept ringing the bell. Nobody came up the stairs.';

const SOURCE: SubtitleSource = {
  callers: [
    { id: 'caller-widow', subtitle: 'The widow speaks.', voiceAssetId: 'voice-widow' },
    { id: 'caller-sailor', subtitle: 'Water in the line.' },
    { id: 'caller-mute', subtitle: '' },
  ],
  assets: [
    {
      id: 'voice-widow',
      kind: 'audio',
      source: 'episodes/night-01/voice-widow.mp3',
      sha256: 'a'.repeat(64),
      transcript: EXACT_LINE,
      voiceEngine: 'polly-neural',
    },
  ],
};

function voiceCue(callerId: string) {
  const cue = mapEvent({
    type: 'CALL_ANSWERED',
    sequence: 0,
    timestampOffsetMs: 0,
    callerId,
  }).cues.find((candidate) => candidate.channel === 'voice-filter');
  assert.ok(cue !== undefined);
  return cue;
}

test('a published transcript is used verbatim', () => {
  const { lines, missing } = resolveSubtitles([voiceCue('caller-widow')], SOURCE);

  assert.deepEqual(missing, []);
  assert.equal(lines.length, 1);
  const line = lines[0];
  assert.ok(line !== undefined);
  assert.equal(line.text, EXACT_LINE);
  assert.equal(line.origin, 'asset-transcript');
  assert.equal(line.sourceId, 'caller-widow');
});

test('a caller with no voice asset falls back to the authored subtitle', () => {
  const { lines, missing } = resolveSubtitles([voiceCue('caller-sailor')], SOURCE);

  assert.deepEqual(missing, []);
  assert.equal(lines[0]?.text, 'Water in the line.');
  assert.equal(lines[0]?.origin, 'caller-subtitle');
});

test('an unknown caller is reported rather than given invented words', () => {
  const { lines, missing } = resolveSubtitles([voiceCue('caller-ghost')], SOURCE);

  assert.deepEqual(lines, []);
  assert.equal(missing.length, 1);
  assert.equal(missing[0]?.reason, 'no-caller');
  assert.equal(missing[0]?.sourceId, 'caller-ghost');
});

test('empty authored text is a reported defect, not an empty caption', () => {
  const { lines, missing } = resolveSubtitles([voiceCue('caller-mute')], SOURCE);

  assert.deepEqual(lines, []);
  assert.equal(missing[0]?.reason, 'empty-text');
});

test('synthesized effects produce no subtitles and no defects', () => {
  const { cues } = mapEvents(sampleEvents());
  const sounds = cues.filter((cue) => cue.channel === 'sound');
  assert.ok(sounds.length > 0);

  const { lines, missing } = resolveSubtitles(sounds, SOURCE);
  assert.deepEqual(lines, []);
  assert.deepEqual(missing, []);
});

test('a published sound asset contributes its own transcript', () => {
  const cue = {
    id: 'cue-1-sound-0',
    channel: 'sound',
    triggerEventType: 'CALL_ANSWERED',
    intensity: 1,
    durationMs: 1200,
    reducedMotionAlternative: 'none',
    silentAlternative: 'visual-signal',
    assetId: 'voice-widow',
    effect: 'plain',
  } as const;

  const { lines } = resolveSubtitles([cue], SOURCE);
  assert.equal(lines[0]?.text, EXACT_LINE);
  assert.equal(lines[0]?.origin, 'asset-transcript');
});

test('resolution is stable across repeated calls', () => {
  const cues = mapEvents(sampleEvents()).cues;
  assert.deepEqual(resolveSubtitles(cues, SOURCE), resolveSubtitles(cues, SOURCE));
});
