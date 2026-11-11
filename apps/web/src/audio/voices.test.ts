import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createExchangeAudio } from './exchangeAudio.ts';
import { BUNDLED_EPISODE } from '../episode/bundled-episode.ts';
import { LINE_13_VOICE, OPERATOR_COPY } from '../game/reducer.ts';
import {
  EMPTY_VOICE_INDEX,
  parseVoiceManifest,
  voiceFileFor,
} from './voices.ts';

const VOICE_DIR = new URL('../../public/audio/voices/', import.meta.url);
const INPUT = new URL('../../../../scripts/voices/voices.input.json', import.meta.url);
const manifestRaw: unknown = JSON.parse(readFileSync(new URL('manifest.json', VOICE_DIR), 'utf8'));

/** Every line the reducer marks `spoken` with episode or LINE 13 text. */
function spokenCaptions(): string[] {
  const captions: string[] = [];
  for (const caller of BUNDLED_EPISODE.callers) {
    captions.push(caller.subtitle);
    for (const clueId of caller.clueIds) {
      const clue = BUNDLED_EPISODE.clues.find((candidate) => candidate.id === clueId);
      assert.ok(clue, clueId);
      captions.push(clue.text);
    }
  }
  captions.push(OPERATOR_COPY.line13Wakes, ...LINE_13_VOICE);
  return captions;
}

test('every spoken caption has a Polly file whose manifest text is exactly that caption', () => {
  const index = parseVoiceManifest(manifestRaw);
  for (const caption of spokenCaptions()) {
    const file = voiceFileFor(index, caption);
    assert.ok(file, `no voice for: ${caption}`);
    assert.equal(index.get(caption)?.text, caption);
  }
});

test('no voiced line lacks a caption: manifest and review input hold only spoken captions', () => {
  const captions = new Set(spokenCaptions());
  const input = JSON.parse(readFileSync(INPUT, 'utf8')) as { lines: { text: string }[] };
  const index = parseVoiceManifest(manifestRaw);
  assert.equal(input.lines.length, captions.size);
  assert.equal(index.size, captions.size);
  for (const line of input.lines) assert.ok(captions.has(line.text), line.text);
});

test('assets are immutable: file name is the sha256 of its bytes', () => {
  for (const entry of parseVoiceManifest(manifestRaw).values()) {
    const url = new URL(entry.file, VOICE_DIR);
    assert.ok(existsSync(url), entry.file);
    assert.equal(createHash('sha256').update(readFileSync(url)).digest('hex'), entry.sha256);
  }
});

test('a missing manifest means no voices, not a failure', () => {
  assert.equal(parseVoiceManifest(undefined), EMPTY_VOICE_INDEX);
  assert.equal(voiceFileFor(EMPTY_VOICE_INDEX, 'anything'), null);
});

test('a corrupted manifest yields no voices or drops only the bad entries', () => {
  for (const raw of [null, 7, 'x', [], {}, { schemaVersion: 2, lines: {} }, { schemaVersion: 1, lines: [] }]) {
    assert.equal(parseVoiceManifest(raw).size, 0);
  }
  const good = parseVoiceManifest(manifestRaw);
  const [first] = [...good.values()];
  assert.ok(first);
  const wrongName = { ...first, file: 'evil.mp3', text: 'a' };
  const pathy = { ...first, file: `../${first.file}`, text: 'b' };
  const noText = { ...first, text: '' };
  const badDuration = { ...first, durationMs: -1, text: 'c' };
  const parsed = parseVoiceManifest({
    schemaVersion: 1,
    lines: { first, wrongName, pathy, noText, badDuration, junk: 42 },
  });
  assert.deepEqual([...parsed.keys()], [first.text]);
});

test('audio is optional: speak is a safe no-op when the browser has no audio', () => {
  const audio = createExchangeAudio();
  assert.equal(audio.isAvailable(), false);
  audio.setMuted(true);
  audio.speak('Operator. Put me where the clock rang after midnight.');
  audio.dispose();
});

test('judge-video narration is hashed too and never enters the in-game index', () => {
  const raw = manifestRaw as { narration: Record<string, { file: string; sha256: string; text: string }> };
  const entries = Object.values(raw.narration);
  assert.equal(entries.length, 11);
  const index = parseVoiceManifest(manifestRaw);
  for (const entry of entries) {
    const url = new URL(entry.file, VOICE_DIR);
    assert.equal(createHash('sha256').update(readFileSync(url)).digest('hex'), entry.sha256);
    assert.equal(entry.file, `${entry.sha256}.mp3`);
    assert.equal(index.has(entry.text), false);
  }
});
