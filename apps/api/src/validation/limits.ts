/**
 * Every bound the API enforces, in one place.
 *
 * Bounds are checked before any pattern match or parse, so a hostile body is
 * rejected on its length rather than on its content, and no regex ever runs
 * over an unbounded string.
 */
export const LIMITS = Object.freeze({
  /** Request body cap. An ending report is three short fields. */
  maxBodyBytes: 1024,
  /** Published manifest cap. The bundled minimal episode is ~2 KiB. */
  maxManifestBytes: 262_144,
  /** Replay codes are fixed length so a near-miss is rejected, not searched. */
  replayCodeLength: 10,
  maxEntityIdLength: 64,
  maxDayKeyLength: 10,
  /** A full playthrough is a few hundred events; this is a generous ceiling. */
  maxReplayEvents: 2_048,
});

export const REPLAY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
