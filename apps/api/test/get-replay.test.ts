import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REPLAY_ROUTE, createReplayHandler } from '../src/handlers/get-replay.ts';
import { MemoryReplayStore, RecordingLogger } from '../src/adapters/memory/stores.ts';
import { bodyOf, httpRequest, replayRecord, SAMPLE_EVENTS } from './support/fixtures.ts';
import type { ReplayRecord, ReplayStore } from '../src/ports/replay-store.ts';
import type { GameEvent } from '../src/contracts.ts';

const CODE = 'R3TV9KMQ24';

function world(record: ReplayRecord | undefined = replayRecord()): {
  readonly handler: ReturnType<typeof createReplayHandler>;
  readonly logger: RecordingLogger;
} {
  const replays = new MemoryReplayStore();
  if (record !== undefined) {
    replays.put(record);
  }
  const logger = new RecordingLogger();
  return { handler: createReplayHandler({ replays, logger }), logger };
}

function request(replayCode: string | undefined): ReturnType<typeof httpRequest> {
  return httpRequest({ routeKey: REPLAY_ROUTE, pathParameters: { replayCode } });
}

test('resolves a code to the event sequence that reproduces the playthrough', async () => {
  const { handler } = world();

  const response = await handler(request(CODE));
  const body = bodyOf(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body['replayCode'], CODE);
  assert.equal(body['episodeId'], 'first-ring');
  assert.equal(body['endingId'], 'ending-first-connection');
  assert.deepEqual(body['events'], JSON.parse(JSON.stringify(SAMPLE_EVENTS)));
});

test('a replay response carries no stored timestamps or expiry', async () => {
  const { handler } = world();

  const body = bodyOf(await handler(request(CODE)));

  assert.equal('createdAt' in body, false);
  assert.equal('expiresAt' in body, false);
});

test('an immutable record is cacheable for a long time', async () => {
  const { handler } = world();

  const response = await handler(request(CODE));

  assert.equal(response.headers['cache-control'], 'public, max-age=3600, immutable');
});

test('a code typed in lower case, spaced or hyphenated still resolves', async () => {
  const { handler } = world();

  for (const typed of ['r3tv9kmq24', 'R3TV9-KMQ24', 'r3tv9 kmq24', 'R3Tv9-kMq24']) {
    const response = await handler(request(typed));
    assert.equal(response.statusCode, 200, typed);
    assert.equal(bodyOf(response)['replayCode'], CODE);
  }
});

test('an unknown code is reported as not on record, with fallback', async () => {
  const { handler } = world();

  const response = await handler(request('Z9Z9Z9Z9Z9'));
  const error = bodyOf(response)['error'] as Record<string, unknown>;

  assert.equal(response.statusCode, 404);
  assert.equal(error['code'], 'REPLAY_NOT_FOUND');
  assert.equal(error['bundledFallback'], true);
});

test('a malformed code is rejected without reading the store', async () => {
  let reads = 0;
  const counting: ReplayStore = {
    async findByCode(): Promise<ReplayRecord | undefined> {
      reads += 1;
      return undefined;
    },
  };
  const handler = createReplayHandler({ replays: counting, logger: new RecordingLogger() });

  for (const malformed of [undefined, '', 'SHORT', 'R3TV9KMQ2I', 'R3TV9KMQ245', '../../etc']) {
    const response = await handler(request(malformed));
    const error = bodyOf(response)['error'] as Record<string, unknown>;
    assert.equal(response.statusCode, 400, String(malformed));
    assert.equal(error['code'], 'INVALID_REPLAY_CODE');
    // An invalid code asks for the bundled episode too: the design's failure
    // strategy opens the bundled episode with an explanation.
    assert.equal(error['bundledFallback'], true);
  }

  assert.equal(reads, 0);
});

test('a stored record that fails validation is rejected, not replayed', async () => {
  const broken = replayRecord({
    events: [
      { sequence: 2, timestampOffsetMs: 0, type: 'CALL_ANSWERED', callerId: 'caller-ruth' },
      { sequence: 1, timestampOffsetMs: 10, type: 'CALL_ANSWERED', callerId: 'caller-ruth' },
    ] as readonly GameEvent[],
  });
  const { handler, logger } = world(broken);

  const response = await handler(request(CODE));
  const error = bodyOf(response)['error'] as Record<string, unknown>;

  assert.equal(response.statusCode, 503);
  assert.equal(error['code'], 'REPLAY_INVALID');
  assert.equal(error['bundledFallback'], true);
  assert.ok(logger.entries.some((entry) => entry.event === 'replay_rejected'));
});

test('a record written by an older publisher is rejected', async () => {
  const { handler } = world(replayRecord({ schemaVersion: '0.9.0' }));

  const response = await handler(request(CODE));

  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'REPLAY_INVALID',
  );
});

test('a non-GET method is refused', async () => {
  const { handler } = world();

  const response = await handler(
    httpRequest({ method: 'POST', routeKey: REPLAY_ROUTE, pathParameters: { replayCode: CODE } }),
  );

  assert.equal(response.statusCode, 405);
});

test('a store failure becomes a fixed internal error', async () => {
  const exploding: ReplayStore = {
    async findByCode(): Promise<ReplayRecord | undefined> {
      throw new Error('table arn:aws:dynamodb:eu-west-1:123456789012:table/replays');
    },
  };
  const handler = createReplayHandler({ replays: exploding, logger: new RecordingLogger() });

  const response = await handler(request(CODE));

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.includes('123456789012'), false);
});

test('repeated reads of the same code are byte-identical', async () => {
  const { handler } = world();

  const first = await handler(request(CODE));
  const second = await handler(request('r3tv9-kmq24'));

  assert.equal(first.body, second.body);
});
