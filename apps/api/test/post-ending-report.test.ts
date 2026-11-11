import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENDING_REPORT_ROUTE,
  createEndingReportHandler,
} from '../src/handlers/post-ending-report.ts';
import { MemoryEndingCounterStore, RecordingLogger } from '../src/adapters/memory/stores.ts';
import { LIMITS } from '../src/validation/limits.ts';
import { bodyOf, httpRequest } from './support/fixtures.ts';
import type { EndingCounterStore } from '../src/ports/ending-counter-store.ts';

function report(overrides: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    episodeId: 'first-ring',
    endingId: 'ending-first-connection',
    ...overrides,
  });
}

function request(body: string | undefined): ReturnType<typeof httpRequest> {
  return httpRequest({ method: 'POST', routeKey: ENDING_REPORT_ROUTE, body });
}

function world(): {
  readonly handler: ReturnType<typeof createEndingReportHandler>;
  readonly counters: MemoryEndingCounterStore;
  readonly logger: RecordingLogger;
} {
  const counters = new MemoryEndingCounterStore();
  const logger = new RecordingLogger();
  return { handler: createEndingReportHandler({ counters, logger }), counters, logger };
}

test('an accepted report returns the new aggregate', async () => {
  const { handler } = world();

  const response = await handler(request(report()));
  const body = bodyOf(response);

  assert.equal(response.statusCode, 202);
  assert.equal(body['episodeId'], 'first-ring');
  assert.equal(body['endingId'], 'ending-first-connection');
  assert.equal(body['total'], 1);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('reports aggregate per ending and store nothing per player', async () => {
  const { handler, counters } = world();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await handler(request(report()));
    assert.equal(bodyOf(response)['total'], attempt);
  }

  await handler(request(report({ endingId: 'ending-severed-line' })));

  // Two counters for two endings; five submissions left no fifth record.
  assert.equal(counters.size(), 2);
  assert.equal(counters.total('first-ring', 'ending-first-connection'), 5);
  assert.equal(counters.total('first-ring', 'ending-severed-line'), 1);
});

test('counters for different episodes do not collide', async () => {
  const { handler, counters } = world();

  await handler(request(report({ episodeId: 'first-ring' })));
  await handler(request(report({ episodeId: 'second-ring' })));

  assert.equal(counters.total('first-ring', 'ending-first-connection'), 1);
  assert.equal(counters.total('second-ring', 'ending-first-connection'), 1);
});

test('the total comes from the increment, so no read is needed', async () => {
  const calls: Array<readonly [string, string]> = [];
  const incrementOnly: EndingCounterStore = {
    async increment(episodeId: string, endingId: string): Promise<number> {
      calls.push([episodeId, endingId]);
      return 42;
    },
  };
  const handler = createEndingReportHandler({
    counters: incrementOnly,
    logger: new RecordingLogger(),
  });

  const response = await handler(request(report()));

  assert.equal(bodyOf(response)['total'], 42);
  assert.deepEqual(calls, [['first-ring', 'ending-first-connection']]);
});

test('a body carrying anything beyond the three accepted fields is refused', async () => {
  const { handler, counters } = world();

  for (const extra of [
    { playerName: 'Ruth' },
    { email: 'someone@example.com' },
    { note: 'that was unsettling' },
    { sessionId: 'abc' },
    { timestamp: '2026-11-03T00:00:00Z' },
  ]) {
    const response = await handler(request(report(extra)));
    assert.equal(response.statusCode, 400, JSON.stringify(extra));
    assert.equal(
      (bodyOf(response)['error'] as Record<string, unknown>)['code'],
      'INVALID_ENDING_REPORT',
    );
  }

  assert.equal(counters.size(), 0);
});

test('a rejected report never reaches the counter', async () => {
  const { handler, counters } = world();

  for (const body of [undefined, '', '[]', 'null', '{bad', report({ episodeId: 'Bad Id' })]) {
    await handler(request(body));
  }

  assert.equal(counters.size(), 0);
});

test('an over-sized body is refused with 413', async () => {
  const { handler } = world();

  const response = await handler(
    request(report({ endingId: `ending-${'a'.repeat(LIMITS.maxBodyBytes)}` })),
  );

  assert.equal(response.statusCode, 413);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'PAYLOAD_TOO_LARGE',
  );
});

test('a non-POST method is refused', async () => {
  const { handler } = world();

  const response = await handler(
    httpRequest({ method: 'GET', routeKey: ENDING_REPORT_ROUTE, body: report() }),
  );

  assert.equal(response.statusCode, 405);
});

test('a counter failure becomes a fixed internal error', async () => {
  const exploding: EndingCounterStore = {
    async increment(): Promise<number> {
      throw new Error('ConditionalCheckFailed on table line-13-ending-counters');
    },
  };
  const handler = createEndingReportHandler({
    counters: exploding,
    logger: new RecordingLogger(),
  });

  const response = await handler(request(report()));

  assert.equal(response.statusCode, 500);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'INTERNAL_ERROR',
  );
  assert.equal(response.body.includes('ConditionalCheckFailed'), false);
});

test('the recorded log names only the episode and ending', async () => {
  const { handler, logger } = world();

  await handler(request(report()));

  const recorded = logger.entries.find((entry) => entry.event === 'ending_recorded');
  assert.ok(recorded);
  assert.equal(recorded.episodeId, 'first-ring');
  assert.equal(recorded.endingId, 'ending-first-connection');
  assert.equal(recorded.route, ENDING_REPORT_ROUTE);
});
