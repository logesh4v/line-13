import { readFileSync } from 'node:fs';
import { sealManifest } from '../../src/integrity/manifest-integrity.ts';
import { nodeSha256Hasher } from '../../src/integrity/hasher.ts';
import { validateEpisodeManifest } from '../../src/contracts.ts';
import type { EpisodeManifestV1, GameEvent } from '../../src/contracts.ts';
import type {
  ApiGatewayProxyEventV2,
  HttpRequest,
  HttpResponse,
} from '../../src/http/types.ts';
import type { ReplayRecord } from '../../src/ports/replay-store.ts';

const MINIMAL_EPISODE_PATH = new URL(
  '../../../../packages/contracts/fixtures/minimal-episode.json',
  import.meta.url,
);

/** The bundled minimal episode, exactly as it ships in the contracts package. */
export function loadMinimalEpisode(): EpisodeManifestV1 {
  const parsed: unknown = JSON.parse(readFileSync(MINIMAL_EPISODE_PATH, 'utf8'));
  const validation = validateEpisodeManifest(parsed);
  if (!validation.ok) {
    throw new Error('The bundled minimal episode fixture no longer validates.');
  }
  return validation.value;
}

/** The same episode with a verified solver proof and a correct integrity seal. */
export function loadPublishableEpisode(): EpisodeManifestV1 {
  const base = loadMinimalEpisode();
  return sealManifest(
    {
      ...base,
      solverProof: { ...base.solverProof, status: 'verified', proofHash: 'a'.repeat(64) },
    },
    nodeSha256Hasher,
  );
}

export function apiEvent(overrides: {
  readonly method?: string;
  readonly routeKey?: string;
  readonly path?: string;
  readonly pathParameters?: Readonly<Record<string, string>>;
  readonly queryStringParameters?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
  readonly requestId?: string;
}): ApiGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: overrides.routeKey ?? 'GET /v1/episodes/daily',
    rawPath: overrides.path ?? '/v1/episodes/daily',
    pathParameters: overrides.pathParameters ?? {},
    queryStringParameters: overrides.queryStringParameters ?? {},
    body: overrides.body ?? null,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
    requestContext: {
      requestId: overrides.requestId ?? 'req-0000000001',
      http: {
        method: overrides.method ?? 'GET',
        path: overrides.path ?? '/v1/episodes/daily',
      },
    },
  };
}

export const SAMPLE_EVENTS: readonly GameEvent[] = Object.freeze([
  { sequence: 1, timestampOffsetMs: 0, type: 'CALL_RINGING', callerId: 'caller-ruth', lineId: 'line-03' },
  { sequence: 2, timestampOffsetMs: 1_200, type: 'CALL_ANSWERED', callerId: 'caller-ruth' },
  {
    sequence: 3,
    timestampOffsetMs: 4_800,
    type: 'ROUTE_CONFIRMED',
    callerId: 'caller-ruth',
    destinationId: 'destination-bell-tower',
  },
  { sequence: 4, timestampOffsetMs: 6_000, type: 'ENDING_SELECTED', endingId: 'ending-first-connection' },
]);

export function replayRecord(overrides: Partial<ReplayRecord> = {}): ReplayRecord {
  return {
    replayCode: 'R3TV9KMQ24',
    episodeId: 'first-ring',
    endingId: 'ending-first-connection',
    schemaVersion: '1.0.0',
    events: SAMPLE_EVENTS,
    createdAt: '2026-11-03T18:00:00.000Z',
    expiresAt: 1_800_000_000,
    ...overrides,
  };
}

/** A transport-free request, with only the fields a handler is allowed to see. */
export function httpRequest(overrides: {
  readonly method?: 'GET' | 'POST';
  readonly routeKey?: string;
  readonly pathParameters?: Readonly<Record<string, string | undefined>>;
  readonly queryParameters?: Readonly<Record<string, string | undefined>>;
  readonly body?: string | undefined;
  readonly requestId?: string;
} = {}): HttpRequest {
  return {
    method: overrides.method ?? 'GET',
    routeKey: overrides.routeKey ?? 'GET /v1/episodes/daily',
    pathParameters: overrides.pathParameters ?? {},
    queryParameters: overrides.queryParameters ?? {},
    body: overrides.body,
    requestId: overrides.requestId ?? 'req-0000000001',
  };
}

/** Parses a handler response body, which is always JSON by construction. */
export function bodyOf(response: HttpResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

export interface PublishedEpisodeFixture {
  readonly episode: EpisodeManifestV1;
  readonly dayKey: string;
  readonly location: string;
  readonly manifestHash: string;
  readonly body: string;
}

/**
 * A sealed, publishable episode plus the catalogue facts that describe it.
 * The body is the canonical bytes a manifest reader would return.
 */
export function publishedEpisode(dayKey = '2026-11-03'): PublishedEpisodeFixture {
  const episode = loadPublishableEpisode();
  return {
    episode,
    dayKey,
    location: `manifests/${episode.episodeId}/${episode.integrity.manifestHash}.json`,
    manifestHash: episode.integrity.manifestHash,
    body: JSON.stringify(episode),
  };
}
