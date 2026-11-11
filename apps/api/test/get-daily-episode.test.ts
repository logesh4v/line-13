import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_EPISODE_ROUTE,
  createDailyEpisodeHandler,
} from '../src/handlers/get-daily-episode.ts';
import {
  MemoryEpisodeCatalogue,
  MemoryManifestReader,
  RecordingLogger,
  fixedClock,
} from '../src/adapters/memory/stores.ts';
import { nodeSha256Hasher } from '../src/integrity/hasher.ts';
import { LIMITS } from '../src/validation/limits.ts';
import { bodyOf, httpRequest, publishedEpisode } from './support/fixtures.ts';
import type { EpisodeCatalogue, PublishedEpisodeRecord } from '../src/ports/episode-catalogue.ts';
import type { HttpHandler } from '../src/http/types.ts';

const NOW = '2026-11-03T22:15:00.000Z';

interface World {
  readonly handler: HttpHandler;
  readonly catalogue: MemoryEpisodeCatalogue;
  readonly manifests: MemoryManifestReader;
  readonly logger: RecordingLogger;
  readonly fixture: ReturnType<typeof publishedEpisode>;
}

/** A published world: one sealed episode in the catalogue and its body in store. */
function world(options: { readonly dayKey?: string; readonly publish?: boolean } = {}): World {
  const fixture = publishedEpisode(options.dayKey ?? '2026-11-03');
  const catalogue = new MemoryEpisodeCatalogue();
  const manifests = new MemoryManifestReader();
  const logger = new RecordingLogger();

  if (options.publish !== false) {
    catalogue.publish({
      episodeId: fixture.episode.episodeId,
      publishedDay: fixture.dayKey,
      manifestLocation: fixture.location,
      manifestHash: fixture.manifestHash,
      schemaVersion: fixture.episode.schemaVersion,
    });
    manifests.put(fixture.location, fixture.body);
  }

  const handler = createDailyEpisodeHandler({
    catalogue,
    manifests,
    hasher: nodeSha256Hasher,
    clock: fixedClock(NOW),
    logger,
  });

  return { handler, catalogue, manifests, logger, fixture };
}

test('serves the episode published for the clock day', async () => {
  const { handler, fixture } = world();

  const response = await handler(httpRequest());
  const body = bodyOf(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body['dayKey'], '2026-11-03');
  assert.equal(body['episodeId'], fixture.episode.episodeId);
  assert.equal(body['manifestHash'], fixture.manifestHash);
  assert.equal(response.headers['etag'], `"${fixture.manifestHash}"`);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.match(String(response.headers['cache-control']), /max-age=300/);
});

test('the served episode is the sealed manifest, unaltered', async () => {
  const { handler, fixture } = world();

  const body = bodyOf(await handler(httpRequest()));

  assert.deepEqual(body['episode'], JSON.parse(fixture.body));
});

test('an explicit day parameter selects that day', async () => {
  const { handler, catalogue, manifests, fixture } = world();
  const other = publishedEpisode('2026-10-31');
  catalogue.publish({
    episodeId: other.episode.episodeId,
    publishedDay: other.dayKey,
    manifestLocation: 'manifests/halloween.json',
    manifestHash: other.manifestHash,
    schemaVersion: other.episode.schemaVersion,
  });
  manifests.put('manifests/halloween.json', other.body);

  const response = await handler(httpRequest({ queryParameters: { day: '2026-10-31' } }));

  assert.equal(response.statusCode, 200);
  assert.equal(bodyOf(response)['dayKey'], '2026-10-31');
  assert.equal(bodyOf(response)['manifestHash'], fixture.manifestHash);
});

test('a malformed day is a client error that does not ask for fallback', async () => {
  const { handler } = world();

  const response = await handler(httpRequest({ queryParameters: { day: '2026-02-30' } }));
  const error = bodyOf(response)['error'] as Record<string, unknown>;

  assert.equal(response.statusCode, 400);
  assert.equal(error['code'], 'INVALID_DAY');
  assert.equal(error['bundledFallback'], false);
});

test('an unpublished day says so and asks for the bundled episode', async () => {
  const { handler } = world({ publish: false });

  const response = await handler(httpRequest());
  const error = bodyOf(response)['error'] as Record<string, unknown>;

  assert.equal(response.statusCode, 404);
  assert.equal(error['code'], 'EPISODE_NOT_PUBLISHED');
  assert.equal(error['bundledFallback'], true);
});

test('a missing manifest body is reported as unpublished, not as a success', async () => {
  const { handler, catalogue, fixture } = world({ publish: false });
  catalogue.publish({
    episodeId: fixture.episode.episodeId,
    publishedDay: fixture.dayKey,
    manifestLocation: fixture.location,
    manifestHash: fixture.manifestHash,
    schemaVersion: fixture.episode.schemaVersion,
  });

  const response = await handler(httpRequest());

  assert.equal(response.statusCode, 404);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'EPISODE_NOT_PUBLISHED',
  );
});

test('an unreachable manifest store asks for the bundled episode', async () => {
  const { handler, manifests } = world();
  manifests.failNext();

  const response = await handler(httpRequest());
  const error = bodyOf(response)['error'] as Record<string, unknown>;

  assert.equal(response.statusCode, 503);
  assert.equal(error['code'], 'UPSTREAM_UNAVAILABLE');
  assert.equal(error['bundledFallback'], true);
});

test('a manifest that is not JSON is rejected', async () => {
  const { handler, manifests, fixture } = world();
  manifests.put(fixture.location, '<!doctype html><title>login</title>');

  const response = await handler(httpRequest());

  assert.equal(response.statusCode, 503);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'MANIFEST_INVALID',
  );
});

test('a manifest that fails schema validation is rejected', async () => {
  const { handler, manifests, fixture } = world();
  const broken = { ...JSON.parse(fixture.body), callers: 'not-an-array' };
  manifests.put(fixture.location, JSON.stringify(broken));

  const response = await handler(httpRequest());

  assert.equal(response.statusCode, 503);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'MANIFEST_INVALID',
  );
});

test('a manifest from an unknown schema version is rejected', async () => {
  const { handler, manifests, fixture } = world();
  manifests.put(
    fixture.location,
    JSON.stringify({ ...JSON.parse(fixture.body), schemaVersion: '2.0.0' }),
  );

  const response = await handler(httpRequest());

  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'MANIFEST_INVALID',
  );
});

test('a tampered manifest body fails the integrity check', async () => {
  const { handler, manifests, fixture } = world();
  const tampered = { ...JSON.parse(fixture.body), title: 'Another Exchange' };
  manifests.put(fixture.location, JSON.stringify(tampered));

  const response = await handler(httpRequest());
  const error = bodyOf(response)['error'] as Record<string, unknown>;

  assert.equal(response.statusCode, 503);
  assert.equal(error['code'], 'MANIFEST_INTEGRITY_FAILED');
  assert.equal(error['bundledFallback'], true);
});

test('a manifest whose hash disagrees with the catalogue is rejected', async () => {
  const { handler, catalogue, fixture } = world();
  catalogue.publish({
    episodeId: fixture.episode.episodeId,
    publishedDay: fixture.dayKey,
    manifestLocation: fixture.location,
    manifestHash: 'f'.repeat(64),
    schemaVersion: fixture.episode.schemaVersion,
  });

  const response = await handler(httpRequest());

  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'MANIFEST_INTEGRITY_FAILED',
  );
});

test('a manifest served under the wrong catalogue entry is rejected', async () => {
  const { handler, catalogue, manifests, fixture } = world();
  const parsed = JSON.parse(fixture.body) as Record<string, unknown>;
  catalogue.publish({
    episodeId: 'different-episode',
    publishedDay: fixture.dayKey,
    manifestLocation: 'manifests/swapped.json',
    manifestHash: fixture.manifestHash,
    schemaVersion: String(parsed['schemaVersion']),
  });
  manifests.put('manifests/swapped.json', fixture.body);

  const response = await handler(httpRequest());

  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'MANIFEST_INVALID',
  );
});

test('the manifest read is bounded', async () => {
  const seen: number[] = [];
  const fixture = publishedEpisode();
  const catalogue = new MemoryEpisodeCatalogue();
  catalogue.publish({
    episodeId: fixture.episode.episodeId,
    publishedDay: fixture.dayKey,
    manifestLocation: fixture.location,
    manifestHash: fixture.manifestHash,
    schemaVersion: fixture.episode.schemaVersion,
  });

  const handler = createDailyEpisodeHandler({
    catalogue,
    manifests: {
      async read(_location: string, maxBytes: number) {
        seen.push(maxBytes);
        return { ok: false, reason: 'TOO_LARGE' } as const;
      },
    },
    hasher: nodeSha256Hasher,
    clock: fixedClock(NOW),
    logger: new RecordingLogger(),
  });

  const response = await handler(httpRequest());

  assert.deepEqual(seen, [LIMITS.maxManifestBytes]);
  assert.equal(response.statusCode, 503);
});

test('a non-GET method is refused', async () => {
  const { handler } = world();

  const response = await handler(httpRequest({ method: 'POST' }));

  assert.equal(response.statusCode, 405);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'METHOD_NOT_ALLOWED',
  );
});

test('a store failure becomes a fixed internal error, never a leak', async () => {
  const logger = new RecordingLogger();
  const exploding: EpisodeCatalogue = {
    async findPublishedForDay(): Promise<PublishedEpisodeRecord | undefined> {
      throw new Error('dynamodb:GetItem denied for table arn:aws:dynamodb:...:secret');
    },
  };

  const handler = createDailyEpisodeHandler({
    catalogue: exploding,
    manifests: new MemoryManifestReader(),
    hasher: nodeSha256Hasher,
    clock: fixedClock(NOW),
    logger,
  });

  const response = await handler(httpRequest());

  assert.equal(response.statusCode, 500);
  assert.equal(
    (bodyOf(response)['error'] as Record<string, unknown>)['code'],
    'INTERNAL_ERROR',
  );
  assert.equal(response.body.includes('dynamodb'), false);
  assert.equal(response.body.includes('arn:aws'), false);
  assert.equal(
    logger.values().some((value) => value.includes('arn:aws')),
    false,
  );
});

test('repeated identical requests return byte-identical responses', async () => {
  const { handler } = world();

  const first = await handler(httpRequest());
  const second = await handler(httpRequest());

  assert.equal(first.statusCode, second.statusCode);
  assert.equal(first.body, second.body);
  assert.deepEqual(first.headers, second.headers);
});

test('every outcome is logged against the route with its status', async () => {
  const { handler, logger } = world();

  await handler(httpRequest());

  const completed = logger.entries.find((entry) => entry.event === 'request_completed');
  assert.ok(completed);
  assert.equal(completed.route, DAILY_EPISODE_ROUTE);
  assert.equal(completed.statusCode, 200);
});
