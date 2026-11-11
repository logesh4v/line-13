import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEntityId, parseDayKey, parseReplayCode, toDayKey } from '../src/validation/identifiers.ts';
import { parseEndingReport } from '../src/validation/ending-report.ts';
import { validateReplayRecord } from '../src/validation/replay-record.ts';
import { LIMITS, REPLAY_CODE_ALPHABET } from '../src/validation/limits.ts';
import { isApiError } from '../src/http/errors.ts';
import { SAMPLE_EVENTS, replayRecord } from './support/fixtures.ts';
import type { ApiErrorCode } from '../src/http/errors.ts';
import type { GameEvent } from '../src/contracts.ts';

function expectApiError(code: ApiErrorCode, run: () => unknown): void {
  assert.throws(run, (thrown: unknown) => isApiError(thrown) && thrown.code === code);
}

test('entity ids are lower-case hyphenated and bounded', () => {
  for (const value of ['caller-ruth', 'line-03', 'first-ring', 'a', 'a1-b2-c3']) {
    assert.equal(isEntityId(value), true, value);
  }

  for (const value of [
    '',
    'Caller-Ruth',
    'caller_ruth',
    'caller ruth',
    '-caller',
    'caller-',
    'caller--ruth',
    'caller.ruth',
    'caller/ruth',
    '../../etc/passwd',
    'a'.repeat(LIMITS.maxEntityIdLength + 1),
  ]) {
    assert.equal(isEntityId(value), false, JSON.stringify(value));
  }
});

test('entity id rejection covers non-string input', () => {
  for (const value of [undefined, null, 7, true, {}, [], Symbol('x')]) {
    assert.equal(isEntityId(value), false);
  }
});

test('an id exactly at the length cap is accepted', () => {
  assert.equal(isEntityId('a'.repeat(LIMITS.maxEntityIdLength)), true);
});

test('day keys must be real UTC calendar dates', () => {
  assert.equal(parseDayKey('2026-11-03'), '2026-11-03');
  assert.equal(parseDayKey('2024-02-29'), '2024-02-29');

  for (const value of [
    '2026-02-30',
    '2023-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-11-00',
    '2026-11-32',
    '2026-11-3',
    '26-11-03',
    '2026/11/03',
    '2026-11-03T00:00:00Z',
    '',
    'yesterday',
  ]) {
    expectApiError('INVALID_DAY', () => parseDayKey(value));
  }
});

test('day keys round-trip through the formatter', () => {
  assert.equal(toDayKey(new Date('2026-11-03T23:59:59.999Z')), '2026-11-03');
  assert.equal(toDayKey(new Date('2026-11-04T00:00:00.000Z')), '2026-11-04');
  assert.equal(toDayKey(new Date('0099-01-02T12:00:00.000Z')), '0099-01-02');
  assert.equal(parseDayKey(toDayKey(new Date('2026-01-01T00:00:00.000Z'))), '2026-01-01');
});

test('replay codes are normalized the way a player would retype them', () => {
  const canonical = 'R3TV9KMQ24';

  assert.equal(parseReplayCode(canonical), canonical);
  assert.equal(parseReplayCode('r3tv9kmq24'), canonical);
  assert.equal(parseReplayCode('R3TV9-KMQ24'), canonical);
  assert.equal(parseReplayCode('r3tv9 kmq24'), canonical);
  assert.equal(parseReplayCode(' R3TV9-KMQ-24 '.replace(/ /g, '')), canonical);
});

test('replay codes exclude ambiguous glyphs and reject near misses', () => {
  for (const glyph of ['I', 'L', 'O', 'U']) {
    assert.equal(REPLAY_CODE_ALPHABET.includes(glyph), false, glyph);
  }

  for (const value of [
    undefined,
    '',
    'R3TV9KMQ2',
    'R3TV9KMQ245',
    'R3TV9KMQ2I',
    'R3TV9KMQ2O',
    'R3TV9KMQ2!',
    'R3TV9KMQ2\n',
    'a'.repeat(33),
  ]) {
    expectApiError('INVALID_REPLAY_CODE', () => parseReplayCode(value));
  }
});

test('an over-long replay code is rejected on length before any pattern runs', () => {
  expectApiError('INVALID_REPLAY_CODE', () => parseReplayCode('-'.repeat(4096)));
});

test('an ending report is accepted only in its exact shape', () => {
  const report = parseEndingReport(
    JSON.stringify({
      schemaVersion: '1.0.0',
      episodeId: 'first-ring',
      endingId: 'ending-first-connection',
    }),
  );

  assert.deepEqual(report, {
    schemaVersion: '1.0.0',
    episodeId: 'first-ring',
    endingId: 'ending-first-connection',
  });
});

test('an ending report carrying any unknown key is rejected', () => {
  for (const extra of ['playerName', 'email', 'note', 'userId', 'ip', '__proto__']) {
    expectApiError('INVALID_ENDING_REPORT', () =>
      parseEndingReport(
        JSON.stringify({
          schemaVersion: '1.0.0',
          episodeId: 'first-ring',
          endingId: 'ending-first-connection',
          [extra]: 'anything at all',
        }),
      ),
    );
  }
});

test('an ending report with a wrong or missing schema version is rejected', () => {
  for (const schemaVersion of [undefined, '', '0.9.0', '2.0.0', 1]) {
    expectApiError('INVALID_ENDING_REPORT', () =>
      parseEndingReport(
        JSON.stringify({ schemaVersion, episodeId: 'first-ring', endingId: 'ending-x' }),
      ),
    );
  }
});

test('an ending report with malformed identifiers is rejected', () => {
  for (const ids of [
    { episodeId: '', endingId: 'ending-x' },
    { episodeId: 'First-Ring', endingId: 'ending-x' },
    { episodeId: 'first-ring', endingId: 'Ending X' },
    { episodeId: 'first-ring', endingId: 7 },
    { episodeId: ['first-ring'], endingId: 'ending-x' },
  ]) {
    expectApiError('INVALID_ENDING_REPORT', () =>
      parseEndingReport(JSON.stringify({ schemaVersion: '1.0.0', ...ids })),
    );
  }
});

test('a non-object or unreadable body is rejected', () => {
  for (const body of [undefined, '', 'null', '[]', '"text"', '7', 'true', '{', '{"a":']) {
    expectApiError('INVALID_ENDING_REPORT', () => parseEndingReport(body));
  }
});

test('an over-sized body is rejected on bytes, not on content', () => {
  const padding = 'x'.repeat(LIMITS.maxBodyBytes + 1);

  expectApiError('PAYLOAD_TOO_LARGE', () =>
    parseEndingReport(
      JSON.stringify({
        schemaVersion: '1.0.0',
        episodeId: 'first-ring',
        endingId: 'ending-first-connection',
        padding,
      }),
    ),
  );
});

test('a multi-byte body is measured in bytes rather than code units', () => {
  // Each of these is 3 UTF-8 bytes but one UTF-16 code unit.
  const body = JSON.stringify({ schemaVersion: '\u3042'.repeat(LIMITS.maxBodyBytes) });

  expectApiError('PAYLOAD_TOO_LARGE', () => parseEndingReport(body));
});

test('a well-formed replay record validates', () => {
  const validation = validateReplayRecord(replayRecord());

  assert.equal(validation.ok, true);
  assert.equal(validation.ok && validation.record.events.length, SAMPLE_EVENTS.length);
});

test('a replay record from another schema version is rejected', () => {
  const validation = validateReplayRecord(replayRecord({ schemaVersion: '0.9.0' }));

  assert.equal(validation.ok, false);
  assert.equal(validation.ok === false && validation.reason, 'SCHEMA_VERSION_MISMATCH');
});

test('a replay record with malformed identifiers is rejected', () => {
  for (const overrides of [{ episodeId: 'First Ring' }, { endingId: '' }]) {
    const validation = validateReplayRecord(replayRecord(overrides));
    assert.equal(validation.ok, false);
    assert.equal(validation.ok === false && validation.reason, 'IDENTIFIER_MALFORMED');
  }
});

test('an empty or over-long event sequence is rejected', () => {
  const empty = validateReplayRecord(replayRecord({ events: [] }));
  assert.equal(empty.ok === false && empty.reason, 'EVENTS_EMPTY');

  const tooMany = validateReplayRecord(
    replayRecord({
      events: Array.from({ length: LIMITS.maxReplayEvents + 1 }, (_unused, index) => ({
        sequence: index + 1,
        timestampOffsetMs: index,
        type: 'CALL_ANSWERED',
        callerId: 'caller-ruth',
      })) as unknown as readonly GameEvent[],
    }),
  );
  assert.equal(tooMany.ok === false && tooMany.reason, 'EVENTS_TOO_MANY');
});

test('a sequence that is not strictly increasing is rejected', () => {
  for (const sequences of [
    [1, 1],
    [2, 1],
    [1, 3, 2],
  ]) {
    const events = sequences.map((sequence) => ({
      sequence,
      timestampOffsetMs: 0,
      type: 'CALL_ANSWERED',
      callerId: 'caller-ruth',
    })) as unknown as readonly GameEvent[];

    const validation = validateReplayRecord(replayRecord({ events }));
    assert.equal(validation.ok, false);
    assert.equal(validation.ok === false && validation.reason, 'SEQUENCE_NOT_MONOTONIC');
  }
});

test('a malformed event is rejected rather than replayed', () => {
  const malformed: readonly unknown[] = [
    { sequence: 1, timestampOffsetMs: 0, type: 'NOT_A_REAL_EVENT' },
    { sequence: 1.5, timestampOffsetMs: 0, type: 'CALL_ANSWERED' },
    { sequence: 1, timestampOffsetMs: -1, type: 'CALL_ANSWERED' },
    { sequence: 1, timestampOffsetMs: 0.5, type: 'CALL_ANSWERED' },
    { sequence: Number.MAX_SAFE_INTEGER + 2, timestampOffsetMs: 0, type: 'CALL_ANSWERED' },
    { sequence: 1, timestampOffsetMs: 0 },
    null,
  ];

  for (const event of malformed) {
    const validation = validateReplayRecord(
      replayRecord({ events: [event] as unknown as readonly GameEvent[] }),
    );
    assert.equal(validation.ok, false, JSON.stringify(event));
    assert.equal(validation.ok === false && validation.reason, 'EVENT_MALFORMED');
  }
});

test('a record at exactly the event ceiling is accepted', () => {
  const events = Array.from({ length: LIMITS.maxReplayEvents }, (_unused, index) => ({
    sequence: index + 1,
    timestampOffsetMs: index,
    type: 'CALL_ANSWERED',
    callerId: 'caller-ruth',
  })) as unknown as readonly GameEvent[];

  assert.equal(validateReplayRecord(replayRecord({ events })).ok, true);
});
