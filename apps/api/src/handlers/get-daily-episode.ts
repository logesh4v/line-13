import { ApiError } from '../http/errors.ts';
import { guard, json } from '../http/respond.ts';
import { LIMITS } from '../validation/limits.ts';
import { parseDayKey, toDayKey } from '../validation/identifiers.ts';
import { verifyManifestIntegrity } from '../integrity/manifest-integrity.ts';
import { validateEpisodeManifest } from '../contracts.ts';
import type { EpisodeManifestV1 } from '../contracts.ts';
import type { HttpHandler, HttpRequest, HttpResponse } from '../http/types.ts';
import type { Clock } from '../ports/clock.ts';
import type { Logger } from '../ports/logger.ts';
import type { EpisodeCatalogue, ManifestReader } from '../ports/episode-catalogue.ts';
import type { Sha256Hasher } from '../integrity/hasher.ts';

export const DAILY_EPISODE_ROUTE = 'GET /v1/episodes/daily';

export interface DailyEpisodeDeps {
  readonly catalogue: EpisodeCatalogue;
  readonly manifests: ManifestReader;
  readonly hasher: Sha256Hasher;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface DailyEpisodeResponse {
  readonly schemaVersion: string;
  readonly dayKey: string;
  readonly episodeId: string;
  readonly manifestHash: string;
  readonly episode: EpisodeManifestV1;
}

/**
 * Serves the published episode for a UTC day, or says plainly that there is
 * none.
 *
 * The handler is read-only and does four things in order: resolve the day,
 * look up the catalogue entry, fetch the manifest body under a byte cap, and
 * refuse to return it unless schema validation and the three-way integrity
 * check both pass. Each refusal is a distinct code carrying
 * `bundledFallback: true`, so the web app switches to its bundled episode
 * knowingly (R8.3) instead of receiving a quietly different puzzle.
 */
export function createDailyEpisodeHandler(deps: DailyEpisodeDeps): HttpHandler {
  return async (request: HttpRequest): Promise<HttpResponse> =>
    guard(DAILY_EPISODE_ROUTE, request.requestId, deps.logger, async () => {
      if (request.method !== 'GET') {
        throw new ApiError('METHOD_NOT_ALLOWED');
      }

      const requestedDay = request.queryParameters['day'];
      const dayKey =
        requestedDay === undefined
          ? toDayKey(new Date(deps.clock.nowIso()))
          : parseDayKey(requestedDay);

      const record = await deps.catalogue.findPublishedForDay(dayKey);
      if (record === undefined) {
        throw new ApiError('EPISODE_NOT_PUBLISHED');
      }

      const read = await deps.manifests.read(record.manifestLocation, LIMITS.maxManifestBytes);
      if (!read.ok) {
        deps.logger.warn({
          event: 'manifest_rejected',
          route: DAILY_EPISODE_ROUTE,
          requestId: request.requestId,
          episodeId: record.episodeId,
          code: read.reason === 'NOT_FOUND' ? 'EPISODE_NOT_PUBLISHED' : 'UPSTREAM_UNAVAILABLE',
        });
        throw new ApiError(
          read.reason === 'NOT_FOUND' ? 'EPISODE_NOT_PUBLISHED' : 'UPSTREAM_UNAVAILABLE',
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(read.body);
      } catch {
        deps.logger.warn({
          event: 'manifest_rejected',
          route: DAILY_EPISODE_ROUTE,
          requestId: request.requestId,
          episodeId: record.episodeId,
          code: 'MANIFEST_INVALID',
        });
        throw new ApiError('MANIFEST_INVALID');
      }

      const validation = validateEpisodeManifest(parsed);
      if (!validation.ok) {
        deps.logger.warn({
          event: 'manifest_rejected',
          route: DAILY_EPISODE_ROUTE,
          requestId: request.requestId,
          episodeId: record.episodeId,
          code: 'MANIFEST_INVALID',
          issueCount: validation.issues.length,
        });
        throw new ApiError('MANIFEST_INVALID');
      }

      const integrity = verifyManifestIntegrity(validation.value, deps.hasher, {
        catalogueHash: record.manifestHash,
      });
      if (!integrity.ok) {
        deps.logger.warn({
          event: 'manifest_rejected',
          route: DAILY_EPISODE_ROUTE,
          requestId: request.requestId,
          episodeId: record.episodeId,
          code: 'MANIFEST_INTEGRITY_FAILED',
        });
        throw new ApiError('MANIFEST_INTEGRITY_FAILED');
      }

      if (validation.value.episodeId !== record.episodeId) {
        deps.logger.warn({
          event: 'manifest_rejected',
          route: DAILY_EPISODE_ROUTE,
          requestId: request.requestId,
          episodeId: record.episodeId,
          code: 'MANIFEST_INVALID',
        });
        throw new ApiError('MANIFEST_INVALID');
      }

      const payload: DailyEpisodeResponse = {
        schemaVersion: validation.value.schemaVersion,
        dayKey,
        episodeId: validation.value.episodeId,
        manifestHash: integrity.manifestHash,
        episode: validation.value,
      };

      return json(payload, {
        cacheControl: 'public, max-age=300, stale-while-revalidate=600',
        etag: integrity.manifestHash,
      });
    });
}
