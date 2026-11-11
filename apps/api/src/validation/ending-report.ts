import { LIMITS } from './limits.ts';
import { isEntityId } from './identifiers.ts';
import { ApiError } from '../http/errors.ts';
import { EPISODE_SCHEMA_VERSION } from '../contracts.ts';

/**
 * The anonymous ending report.
 *
 * This is the only write the API accepts, so its shape is the narrowest thing
 * in the package: three identifier fields, no free text, no client identifier,
 * no timestamp the caller controls, and no unknown keys. There is nothing here
 * that could carry personal data even if a client tried to send some (R8.4).
 */
export interface EndingReport {
  readonly schemaVersion: typeof EPISODE_SCHEMA_VERSION;
  readonly episodeId: string;
  readonly endingId: string;
}

const ALLOWED_KEYS: ReadonlySet<string> = new Set(['schemaVersion', 'episodeId', 'endingId']);

export function parseEndingReport(body: string | undefined): EndingReport {
  if (body === undefined || body.length === 0) {
    throw new ApiError('INVALID_ENDING_REPORT');
  }
  if (Buffer.byteLength(body, 'utf8') > LIMITS.maxBodyBytes) {
    throw new ApiError('PAYLOAD_TOO_LARGE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ApiError('INVALID_ENDING_REPORT');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError('INVALID_ENDING_REPORT');
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ApiError('INVALID_ENDING_REPORT');
    }
  }

  if (record['schemaVersion'] !== EPISODE_SCHEMA_VERSION) {
    throw new ApiError('INVALID_ENDING_REPORT');
  }
  if (!isEntityId(record['episodeId']) || !isEntityId(record['endingId'])) {
    throw new ApiError('INVALID_ENDING_REPORT');
  }

  return {
    schemaVersion: EPISODE_SCHEMA_VERSION,
    episodeId: record['episodeId'],
    endingId: record['endingId'],
  };
}
