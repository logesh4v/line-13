import { ApiError } from '../http/errors.ts';
import { guard, json } from '../http/respond.ts';
import { parseEndingReport } from '../validation/ending-report.ts';
import type { HttpHandler, HttpRequest, HttpResponse } from '../http/types.ts';
import type { Logger } from '../ports/logger.ts';
import type { EndingCounterStore } from '../ports/ending-counter-store.ts';

export const ENDING_REPORT_ROUTE = 'POST /v1/endings';

export interface EndingReportDeps {
  readonly counters: EndingCounterStore;
  readonly logger: Logger;
}

export interface EndingReportResponse {
  readonly episodeId: string;
  readonly endingId: string;
  readonly total: number;
}

/**
 * Records one anonymous ending and returns the new aggregate.
 *
 * The only write in the API. The body is capped, strictly parsed and rejected
 * on any unknown key, so the request cannot carry a nickname, a free-text note
 * or an identifier. The count comes back from the atomic increment itself,
 * which is why the handler's role needs no read permission at all.
 *
 * This endpoint is first on the cut list in the task plan: nothing in the core
 * playthrough depends on it, and a failure here never blocks an ending.
 */
export function createEndingReportHandler(deps: EndingReportDeps): HttpHandler {
  return async (request: HttpRequest): Promise<HttpResponse> =>
    guard(ENDING_REPORT_ROUTE, request.requestId, deps.logger, async () => {
      if (request.method !== 'POST') {
        throw new ApiError('METHOD_NOT_ALLOWED');
      }

      const report = parseEndingReport(request.body);
      const total = await deps.counters.increment(report.episodeId, report.endingId);

      deps.logger.info({
        event: 'ending_recorded',
        route: ENDING_REPORT_ROUTE,
        requestId: request.requestId,
        episodeId: report.episodeId,
        endingId: report.endingId,
      });

      const payload: EndingReportResponse = {
        episodeId: report.episodeId,
        endingId: report.endingId,
        total,
      };

      return json(payload, { statusCode: 202, cacheControl: 'no-store' });
    });
}
