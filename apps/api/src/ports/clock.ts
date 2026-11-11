/**
 * Time is injected so every handler test is deterministic. No handler calls
 * `Date.now()` directly.
 */
export interface Clock {
  nowIso(): string;
}
