import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { INTRO_BEATS, SKIP_LABEL, beatAt, introDuration } from '../intro/introTimeline.ts';

export interface EntranceProps {
  readonly reducedMotion: boolean;
  /** Called once, either when the timeline runs out or when the player skips. */
  readonly onFinish: (skipped: boolean) => void;
}

const BEAT_TICK_MS = 100;

/**
 * The cinematic entrance.
 *
 * Darkness and a bell, a brass plate, the operator-room door, then the desk —
 * six seconds, and a hard ceiling of seven. It is skippable by click, tap, any
 * key and Escape, and the game behind it is fully understandable without it:
 * skipping lands on a ringing lamp with the status plate already explaining
 * what to do.
 *
 * With motion held it becomes a static reveal — the same authored captions,
 * read all at once, with no camera move, no flicker and no rush.
 *
 * The bell is a caption here rather than a sound: no audio exists until the
 * player's first gesture, so the entrance never relies on autoplay.
 */
export function Entrance({ reducedMotion, onFinish }: EntranceProps): ReactElement {
  const [elapsed, setElapsed] = useState(0);
  const finished = useRef(false);
  const skipButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    skipButton.current?.focus();
  }, []);

  useEffect(() => {
    function finish(skipped: boolean): void {
      if (finished.current) {
        return;
      }
      finished.current = true;
      onFinish(skipped);
    }

    const duration = introDuration(reducedMotion);
    const startedAt = Date.now();

    const ticker = window.setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, BEAT_TICK_MS);

    const ender = window.setTimeout(() => {
      finish(false);
    }, duration);

    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Tab') {
        return;
      }
      event.preventDefault();
      finish(true);
    }

    window.addEventListener('keydown', handleKey);

    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(ender);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onFinish, reducedMotion]);

  function skip(): void {
    if (finished.current) {
      return;
    }
    finished.current = true;
    onFinish(true);
  }

  const beat = beatAt(elapsed);
  const plate = INTRO_BEATS.find((candidate) => candidate.plate !== null)?.plate ?? null;

  return (
    <div
      className="entrance"
      data-still={String(reducedMotion)}
      role="dialog"
      aria-modal="true"
      aria-label="LINE 13 opening sequence"
      onClick={skip}
    >
      <div className="entrance-signal" aria-hidden="true" />
      <div className="entrance-bell" aria-hidden="true" />

      <div className="entrance-copy">
        <span className="entrance-eyebrow">The exchange closed in 1931</span>
        <h1 className="entrance-title">
          LINE <span>13</span>
        </h1>

        {reducedMotion ? (
          <>
            {plate === null ? null : <p className="entrance-plate">{plate}</p>}
            <div className="entrance-caption entrance-caption--stacked">
              {INTRO_BEATS.map((entry) => (
                <p key={entry.id}>{entry.caption}</p>
              ))}
            </div>
          </>
        ) : (
          <>
            {beat !== null && beat.plate !== null ? (
              <p className="entrance-plate">{beat.plate}</p>
            ) : null}
            <p className="entrance-caption" aria-live="polite">
              {beat?.caption ?? ''}
            </p>
          </>
        )}
      </div>

      <div className="entrance-vignette" aria-hidden="true" />

      <button
        type="button"
        className="entrance-skip"
        ref={skipButton}
        onClick={(event) => {
          event.stopPropagation();
          skip();
        }}
      >
        {SKIP_LABEL}
      </button>
    </div>
  );
}
