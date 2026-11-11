import { API_ERRORS, apiErrorBody, isApiError } from './errors.ts';
import type { ApiErrorCode } from './errors.ts';
import type { HttpResponse } from './types.ts';
import type { Logger } from '../ports/logger.ts';

const BASE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
});

export interface JsonOptions {
  readonly statusCode?: number | undefined;
  readonly cacheControl?: string | undefined;
  readonly etag?: string | undefined;
}

export function json(payload: unknown, options: JsonOptions = {}): HttpResponse {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (options.cacheControl !== undefined) {
    headers['cache-control'] = options.cacheControl;
  }
  if (options.etag !== undefined) {
    headers['etag'] = `"${options.etag}"`;
  }
  return {
    statusCode: options.statusCode ?? 200,
    headers: Object.freeze(headers),
    body: JSON.stringify(payload),
  };
}

export function errorResponse(code: ApiErrorCode): HttpResponse {
  return json(apiErrorBody(code), { statusCode: API_ERRORS[code].statusCode });
}

/**
 * Wraps a handler so that no throw can reach the runtime unshaped.
 *
 * A caught exception's message is never read: only its constructor name is
 * logged, because a message can carry a store key, a presigned URL fragment or
 * a credential from a lower layer. The response carries a fixed sentence.
 */
export async function guard(
  route: string,
  requestId: string,
  logger: Logger,
  run: () => Promise<HttpResponse>,
): Promise<HttpResponse> {
  try {
    const response = await run();
    logger.info({ event: 'request_completed', route, requestId, statusCode: response.statusCode });
    return response;
  } catch (thrown: unknown) {
    if (isApiError(thrown)) {
      const response = errorResponse(thrown.code);
      logger.warn({
        event: 'request_rejected',
        route,
        requestId,
        code: thrown.code,
        statusCode: response.statusCode,
      });
      return response;
    }
    logger.error({
      event: 'request_failed',
      route,
      requestId,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      errorName: thrown instanceof Error ? thrown.name : 'UnknownThrow',
    });
    return errorResponse('INTERNAL_ERROR');
  }
}
