/**
 * Safe error surface.
 *
 * Every failure the API can express is one of a closed set of codes with a
 * fixed, pre-written message. No message is built from request data, store
 * data, or a caught exception's text, so no input can be reflected back and no
 * internal detail can escape (R10.4).
 *
 * `bundledFallback` tells the client that the correct recovery is to play the
 * bundled episode (R8.3). It is explicit in the payload rather than inferred
 * from the status code, because the web app must never silently substitute a
 * different puzzle state without knowing it did.
 */

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_DAY'
  | 'INVALID_REPLAY_CODE'
  | 'INVALID_ENDING_REPORT'
  | 'PAYLOAD_TOO_LARGE'
  | 'METHOD_NOT_ALLOWED'
  | 'ROUTE_NOT_FOUND'
  | 'EPISODE_NOT_PUBLISHED'
  | 'REPLAY_NOT_FOUND'
  | 'MANIFEST_INVALID'
  | 'MANIFEST_INTEGRITY_FAILED'
  | 'REPLAY_INVALID'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR';

interface ApiErrorShape {
  readonly statusCode: number;
  readonly message: string;
  readonly bundledFallback: boolean;
}

export const API_ERRORS: Readonly<Record<ApiErrorCode, ApiErrorShape>> = Object.freeze({
  BAD_REQUEST: {
    statusCode: 400,
    message: 'The request could not be read.',
    bundledFallback: false,
  },
  INVALID_DAY: {
    statusCode: 400,
    message: 'The day parameter must be an ISO calendar date.',
    bundledFallback: false,
  },
  INVALID_REPLAY_CODE: {
    statusCode: 400,
    message: 'That replay code is not a valid exchange code.',
    bundledFallback: true,
  },
  INVALID_ENDING_REPORT: {
    statusCode: 400,
    message: 'The ending report did not match the accepted shape.',
    bundledFallback: false,
  },
  PAYLOAD_TOO_LARGE: {
    statusCode: 413,
    message: 'The request body exceeded the accepted size.',
    bundledFallback: false,
  },
  METHOD_NOT_ALLOWED: {
    statusCode: 405,
    message: 'That method is not served on this line.',
    bundledFallback: false,
  },
  ROUTE_NOT_FOUND: {
    statusCode: 404,
    message: 'No such line on this exchange.',
    bundledFallback: false,
  },
  EPISODE_NOT_PUBLISHED: {
    statusCode: 404,
    message: 'No episode is published for that day.',
    bundledFallback: true,
  },
  REPLAY_NOT_FOUND: {
    statusCode: 404,
    message: 'That replay code is not on record.',
    bundledFallback: true,
  },
  MANIFEST_INVALID: {
    statusCode: 503,
    message: 'The published episode failed schema validation and was rejected.',
    bundledFallback: true,
  },
  MANIFEST_INTEGRITY_FAILED: {
    statusCode: 503,
    message: 'The published episode failed its integrity check and was rejected.',
    bundledFallback: true,
  },
  REPLAY_INVALID: {
    statusCode: 503,
    message: 'The stored replay failed validation and was rejected.',
    bundledFallback: true,
  },
  UPSTREAM_UNAVAILABLE: {
    statusCode: 503,
    message: 'The exchange could not reach its records.',
    bundledFallback: true,
  },
  INTERNAL_ERROR: {
    statusCode: 500,
    message: 'The exchange failed to complete the request.',
    bundledFallback: true,
  },
});

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly bundledFallback: boolean;
  };
}

export function apiErrorBody(code: ApiErrorCode): ApiErrorBody {
  const shape = API_ERRORS[code];
  return {
    error: {
      code,
      message: shape.message,
      bundledFallback: shape.bundledFallback,
    },
  };
}
