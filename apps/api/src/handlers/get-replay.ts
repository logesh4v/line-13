import { ApiError } from '../http/errors.ts';
import { guard, json } from '../http/respond.ts';
import { parseReplayCode } from '../validation/identifiers.ts';
import { validateReplayRecord } from '../validation/replay-record.ts';
import type { GameEvent } from '../contracts.ts';
import type { HttpHandler, HttpRequest, HttpResponse } from '../http/types.ts';
import type { Logger } from '../ports/logger.ts';
import type { ReplayStore } from '../ports/replay-store.ts';

export const REPLAY_ROUTE = 'GET /v1/replays/{replayCode}';

export interface ReplayDeps {
  readonly replays: ReplayStore;
  readonly logger: Logger;
}

export interface ReplayResponse {
  readonly schemaVersion: string;
  readonly replayCode: string;
  readonly episodeId: string;
  readonly endingId: string;
  readonly events: readonly GameEvent[];
}

/**
 * Resolves a short code to the event sequence that reproduces a playthrough.
 *
 * The code is normalized and matched against a fixed-length unambiguous
 * alphabet before the store is touched, so a mistyped code costs no read. A
 * record that fails validation is rejected rather than replayed, because a
 * partially valid event sequence would desynchronize the graph engine.
 */
export function createReplayHandler(deps: ReplayDeps): HttpHandler {
  return async (request: HttpRequest): Promise<HttpResponse> =>
    guard(REPLAY_ROUTE, request.requestId, deps.logger, async () => {
      if (request.method !== 'GET') {
        throw new ApiError('METHOD_NOT_ALLOWED');
      }

      const replayCode = parseReplayCode(request.pathParameters['replayCode']);
      const record = await deps.replays.findByCode(replayCode);
      if (record === undefined) {
        throw new ApiError('REPLAY_NOT_FOUND');
      }

      const validation = validateReplayRecord(record);
      if (!validation.ok) {
        deps.logger.warn({
          event: 'replay_rejected',
          route: REPLAY_ROUTE,
          requestId: request.requestId,
          episodeId: record.episodeId,
          code: 'REPLAY_INVALID',
        });
        throw new ApiError('REPLAY_INVALID');
      }

      const payload: ReplayResponse = {
        schemaVersion: validation.record.schemaVersion,
        replayCode,
        episodeId: validation.record.episodeId,
        endingId: validation.record.endingId,
        events: validation.record.events,
      };

      // A replay record is immutable once minted, so it can be cached hard.
      return json(payload, { cacheControl: 'public, max-age=3600, immutable' });
    });
}
