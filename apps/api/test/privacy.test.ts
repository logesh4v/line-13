import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLambdaHandler, toHttpRequest } from '../src/runtime/lambda-adapter.ts';
import { createEndingReportHandler } from '../src/handlers/post-ending-report.ts';
import { createDailyEpisodeHandler } from '../src/handlers/get-daily-episode.ts';
import { API_ERRORS, apiErrorBody } from '../src/http/errors.ts';
import { guard, json } from '../src/http/respond.ts';
import { LIMITS } from '../src/validation/limits.ts';
import { nodeSha256Hasher } from '../src/integrity/hasher.ts';
import {
  MemoryEndingCounterStore,
  MemoryEpisodeCatalogue,
  MemoryManifestReader,
  RecordingLogger,
  fixedClock,
} from '../src/adapters/memory/stores.ts';
import { apiEvent, bodyOf, httpRequest } from './support/fixtures.ts';
import type { ApiErrorCode } from '../src/http/errors.ts';
import type { ApiGatewayProxyEventV2 } from '../src/http/types.ts';

/**
 * R8.4 (no account, no personal data) and R10.4 (no secrets or personal data in
 * captured errors) are enforced by construction rather than by review. These
 * tests are that claim made checkable: what the gateway sends that handlers
 * cannot see, what the response can contain, and what may reach a log.
 */

const PRIVATE_FIELDS = [
  'headers',
  'cookies',
  'identity',
  'authorizer',
  'sourceIp',
  'userAgent',
  'requestContext',
] as const;

test('the request a handler receives carries no identifying transport fields', () => {
  const event = {
    ...apiEvent({ method: 'POST', body: '{}' }),
    headers: {
      authorization: 'Bearer secret-token',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '203.0.113.7',
      cookie: 'session=abc123',
    },
    cookies: ['session=abc123'],
  } as unknown as ApiGatewayProxyEventV2;

  const translation = toHttpRequest(event);
  assert.equal(translation.ok, true);
  if (!translation.ok) {
    return;
  }

  for (const field of PRIVATE_FIELDS) {
    assert.equal(field in translation.request, false, field);
  }
  assert.deepEqual(Object.keys(translation.request).sort(), [
    'body',
    'method',
    'pathParameters',
    'queryParameters',
    'requestId',
    'routeKey',
  ]);
  assert.equal(JSON.stringify(translation.request).includes('203.0.113.7'), false);
  assert.equal(JSON.stringify(translation.request).includes('secret-token'), false);
  assert.equal(JSON.stringify(translation.request).includes('session=abc123'), false);
});

test('a base64 body is decoded, which is what a non-browser caller sends', async () => {
  const body = JSON.stringify({
    schemaVersion: '1.0.0',
    episodeId: 'first-ring',
    endingId: 'ending-first-connection',
  });
  const handler = createLambdaHandler(
    createEndingReportHandler({
      counters: new MemoryEndingCounterStore(),
      logger: new RecordingLogger(),
    }),
  );

  const result = await handler(
    apiEvent({
      method: 'POST',
      routeKey: 'POST /v1/endings',
      path: '/v1/endings',
      body: Buffer.from(body, 'utf8').toString('base64'),
      isBase64Encoded: true,
    }),
  );

  assert.equal(result.statusCode, 202);
  assert.equal(result.isBase64Encoded, false);
});

test('an over-sized body is refused at the transport edge', async () => {
  const handler = createLambdaHandler(
    createEndingReportHandler({
      counters: new MemoryEndingCounterStore(),
      logger: new RecordingLogger(),
    }),
  );
  const oversized = 'x'.repeat(LIMITS.maxBodyBytes + 1);

  const plain = await handler(
    apiEvent({ method: 'POST', routeKey: 'POST /v1/endings', body: oversized }),
  );
  const encoded = await handler(
    apiEvent({
      method: 'POST',
      routeKey: 'POST /v1/endings',
      body: Buffer.from(oversized, 'utf8').toString('base64'),
      isBase64Encoded: true,
    }),
  );

  assert.equal(plain.statusCode, 413);
  assert.equal(encoded.statusCode, 413);
});

test('an unsupported method never reaches a handler', async () => {
  let reached = false;
  const handler = createLambdaHandler(async () => {
    reached = true;
    return json({});
  });

  for (const method of ['DELETE', 'PUT', 'PATCH', 'OPTIONS', 'HEAD', 'TRACE']) {
    const result = await handler(apiEvent({ method }));
    assert.equal(result.statusCode, 405, method);
  }

  assert.equal(reached, false);
});

test('every error message is a fixed sentence that reflects no input', async () => {
  const hostile = 'caller-\u202e<script>alert(1)</script>';
  const handler = createEndingReportHandler({
    counters: new MemoryEndingCounterStore(),
    logger: new RecordingLogger(),
  });

  const response = await handler(
    httpRequest({
      method: 'POST',
      routeKey: 'POST /v1/endings',
      body: JSON.stringify({ schemaVersion: '1.0.0', episodeId: hostile, endingId: hostile }),
    }),
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.includes('script'), false);
  assert.equal(response.body.includes('\u202e'), false);

  const error = bodyOf(response)['error'] as Record<string, unknown>;
  const code = error['code'] as ApiErrorCode;
  assert.equal(error['message'], API_ERRORS[code].message);
});

test('the error body shape is closed and names the fallback explicitly', () => {
  for (const code of Object.keys(API_ERRORS) as readonly ApiErrorCode[]) {
    const body = apiErrorBody(code);
    assert.deepEqual(Object.keys(body), ['error']);
    assert.deepEqual(Object.keys(body.error).sort(), ['bundledFallback', 'code', 'message']);
    assert.equal(typeof body.error.bundledFallback, 'boolean');
    assert.ok(body.error.message.length > 0);
    // No message interpolates anything.
    assert.equal(/[<>{}$]/.test(body.error.message), false, code);
  }
});

test('every failure that should hand over to the bundled episode says so', () => {
  const mustFallBack: readonly ApiErrorCode[] = [
    'EPISODE_NOT_PUBLISHED',
    'MANIFEST_INVALID',
    'MANIFEST_INTEGRITY_FAILED',
    'REPLAY_NOT_FOUND',
    'REPLAY_INVALID',
    'INVALID_REPLAY_CODE',
    'UPSTREAM_UNAVAILABLE',
    'INTERNAL_ERROR',
  ];

  for (const code of mustFallBack) {
    assert.equal(API_ERRORS[code].bundledFallback, true, code);
  }

  // A client mistake in a request the client controls is not a fallback signal.
  for (const code of ['BAD_REQUEST', 'INVALID_DAY', 'INVALID_ENDING_REPORT'] as const) {
    assert.equal(API_ERRORS[code].bundledFallback, false, code);
  }
});

test('a thrown exception contributes only its constructor name to the log', async () => {
  const logger = new RecordingLogger();
  const leaky = new Error('AKIAIOSFODNN7EXAMPLE / s3://line-13-content/manifests/secret.json');
  leaky.name = 'CredentialError';

  const response = await guard('GET /v1/episodes/daily', 'req-1', logger, async () => {
    throw leaky;
  });

  assert.equal(response.statusCode, 500);
  const values = logger.values();
  assert.ok(values.includes('CredentialError'));
  assert.equal(
    values.some((value) => value.includes('AKIA') || value.includes('s3://')),
    false,
  );
  assert.equal(response.body.includes('AKIA'), false);
});

test('no handler outcome writes free text into a log entry', async () => {
  const logger = new RecordingLogger();
  const handler = createDailyEpisodeHandler({
    catalogue: new MemoryEpisodeCatalogue(),
    manifests: new MemoryManifestReader(),
    hasher: nodeSha256Hasher,
    clock: fixedClock('2026-11-03T22:15:00.000Z'),
    logger,
  });

  await handler(httpRequest());
  await handler(httpRequest({ queryParameters: { day: 'not-a-day' } }));
  await handler(httpRequest({ method: 'POST' }));

  const allowedKeys = new Set([
    'event',
    'route',
    'requestId',
    'statusCode',
    'code',
    'errorName',
    'episodeId',
    'endingId',
    'issueCount',
    'durationMs',
  ]);

  assert.ok(logger.entries.length >= 3);
  for (const entry of logger.entries) {
    for (const key of Object.keys(entry)) {
      assert.ok(allowedKeys.has(key), key);
    }
  }
  assert.equal(
    logger.values().some((value) => value.includes('not-a-day')),
    false,
  );
});

test('responses carry defensive headers and are never cached by default', () => {
  const response = json({ ok: true });

  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal('set-cookie' in response.headers, false);
  assert.equal('access-control-allow-credentials' in response.headers, false);
});

test('the lambda result never claims a base64 body', async () => {
  const handler = createLambdaHandler(async () => json({ ok: true }));

  const result = await handler(apiEvent({}));

  assert.equal(result.isBase64Encoded, false);
  assert.equal(typeof result.body, 'string');
});
