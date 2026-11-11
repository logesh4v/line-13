/**
 * `@line-13/api` — the optional AWS extension.
 *
 * Everything here is additive. The web application ships a complete bundled
 * episode and a full playthrough needs no account, no backend, no model call
 * and no network beyond the static assets (R8.1, R8.4, R6.5). This package adds
 * a daily episode, replay resolution by short code, and anonymous ending
 * aggregation, and every one of its failure paths tells the client to fall back
 * to the bundled episode rather than degrade the puzzle (R8.3).
 *
 * Layering: handlers are transport-free functions over injected ports. No AWS
 * SDK type reaches a handler, nothing calls the clock or the network directly,
 * and the only adapters in the package are in-memory, which is what makes the
 * test suite deterministic and credential-free.
 */

export * from './http/types.ts';
export * from './http/errors.ts';
export * from './http/respond.ts';

export * from './integrity/canonical-json.ts';
export * from './integrity/hasher.ts';
export * from './integrity/manifest-integrity.ts';

export * from './validation/limits.ts';
export * from './validation/identifiers.ts';
export * from './validation/ending-report.ts';
export * from './validation/replay-record.ts';

export * from './ports/clock.ts';
export * from './ports/logger.ts';
export * from './ports/episode-catalogue.ts';
export * from './ports/replay-store.ts';
export * from './ports/ending-counter-store.ts';

export * from './handlers/get-daily-episode.ts';
export * from './handlers/get-replay.ts';
export * from './handlers/post-ending-report.ts';

export * from './runtime/lambda-adapter.ts';

export * from './publication/speech.ts';
export * from './publication/draft-model.ts';
export * from './publication/gate.ts';
