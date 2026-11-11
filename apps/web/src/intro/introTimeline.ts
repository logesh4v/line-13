/**
 * The cinematic entrance, as data.
 *
 * Four beats, six seconds, and a hard ceiling of seven (R2.1). The timeline is
 * a plain array so the ceiling is a test rather than a promise, and so the
 * reduced-motion path can be a different, shorter reveal instead of the same
 * camera move played slowly.
 */
export const INTRO_MAX_MS = 7000;

export interface IntroBeat {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  /** Shown as text, and also the visual equivalent of the bell (R7.2). */
  readonly caption: string;
  /** The brass-plate legend, when this beat shows one. */
  readonly plate: string | null;
}

export const INTRO_BEATS: readonly IntroBeat[] = [
  {
    id: 'darkness',
    startMs: 0,
    endMs: 1200,
    caption: 'An exchange bell rings in the dark.',
    plate: null,
  },
  {
    id: 'plate',
    startMs: 1200,
    endMs: 2700,
    caption: 'A brass plate surfaces out of the dark.',
    plate: 'NIGHT EXCHANGE — CLOSED OCTOBER 31, 1931',
  },
  {
    id: 'door',
    startMs: 2700,
    endMs: 4500,
    caption: 'The operator-room door opens. Dormant lamps stand in rows.',
    plate: null,
  },
  {
    id: 'desk',
    startMs: 4500,
    endMs: 6000,
    caption: 'Line 03 begins to ring. The desk is yours.',
    plate: null,
  },
];

export const INTRO_DURATION_MS: number = INTRO_BEATS.reduce(
  (latest, beat) => Math.max(latest, beat.endMs),
  0,
);

/**
 * With motion held, the entrance becomes a static reveal: the same four
 * captions, no camera move, no flicker, no rush, and shorter.
 */
export const REDUCED_MOTION_INTRO_MS = 2400;

export function introDuration(reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_MOTION_INTRO_MS : INTRO_DURATION_MS;
}

export function beatAt(elapsedMs: number): IntroBeat | null {
  return (
    INTRO_BEATS.find((beat) => elapsedMs >= beat.startMs && elapsedMs < beat.endMs) ?? null
  );
}

/** Keys that skip the entrance. Any key skips; these are the documented ones. */
export const SKIP_KEYS: readonly string[] = ['Escape', 'Enter', ' ', 'Spacebar'];

export const SKIP_LABEL = 'Skip the entrance';
