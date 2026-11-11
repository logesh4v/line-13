import { LIMITS, REPLAY_CODE_ALPHABET } from './limits.ts';
import { ApiError } from '../http/errors.ts';

/**
 * Bounded parsers for every value that reaches the API from outside.
 *
 * Each parser caps length first, then matches a closed pattern, then returns a
 * normalized value. Nothing is passed through unparsed, and no parser ever
 * echoes the offending input: the caller throws a fixed-message `ApiError`.
 */

const ENTITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const REPLAY_CODE_PATTERN = new RegExp(`^[${REPLAY_CODE_ALPHABET}]{${LIMITS.replayCodeLength}}$`);

export function isEntityId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= LIMITS.maxEntityIdLength &&
    ENTITY_ID.test(value)
  );
}

export function parseEntityId(value: unknown, onFailure: ApiError): string {
  if (!isEntityId(value)) {
    throw onFailure;
  }
  return value;
}

/**
 * A replay code as a player might retype it: lower case, spaced or hyphenated
 * for readability. Ambiguous glyphs (I, L, O, U) are absent from the alphabet,
 * so there is nothing to guess at.
 */
export function parseReplayCode(raw: string | undefined): string {
  if (raw === undefined || raw.length > 32) {
    throw new ApiError('INVALID_REPLAY_CODE');
  }
  const normalized = raw.toUpperCase().replace(/[\s-]/g, '');
  if (!REPLAY_CODE_PATTERN.test(normalized)) {
    throw new ApiError('INVALID_REPLAY_CODE');
  }
  return normalized;
}

/** UTC calendar day key, `YYYY-MM-DD`, validated as a real date. */
export function parseDayKey(raw: string): string {
  if (raw.length !== LIMITS.maxDayKeyLength || !DAY_KEY.test(raw)) {
    throw new ApiError('INVALID_DAY');
  }
  const parsed = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    throw new ApiError('INVALID_DAY');
  }
  if (toDayKey(new Date(parsed)) !== raw) {
    throw new ApiError('INVALID_DAY');
  }
  return raw;
}

export function toDayKey(instant: Date): string {
  const year = instant.getUTCFullYear().toString().padStart(4, '0');
  const month = (instant.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = instant.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}
