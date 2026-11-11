import type { ApiErrorCode } from '../http/errors.ts';

/**
 * Structured log fields, closed by design.
 *
 * There is no free-text `message` and no `details` bag. Every field is a named
 * operational value, so dialogue, prompts, player input, store payloads and
 * credentials have nowhere to be written (R10.4, and the CloudWatch boundary in
 * the design's AWS extension path). Adding a field is a contract change that
 * shows up in review.
 */
export interface LogFields {
  readonly event:
    | 'request_completed'
    | 'request_rejected'
    | 'request_failed'
    | 'manifest_rejected'
    | 'replay_rejected'
    | 'ending_recorded';
  readonly route?: string | undefined;
  readonly requestId?: string | undefined;
  readonly statusCode?: number | undefined;
  readonly code?: ApiErrorCode | undefined;
  readonly errorName?: string | undefined;
  readonly episodeId?: string | undefined;
  readonly endingId?: string | undefined;
  readonly issueCount?: number | undefined;
  readonly durationMs?: number | undefined;
}

export interface Logger {
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}
