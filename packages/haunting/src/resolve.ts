import type { HauntCue } from './contracts.ts';
import { isAudibleCue } from './cue-mapper.ts';
import type { HauntingSettings } from './settings.ts';

/**
 * Channels whose cue is carried by movement. Reduced motion is applied to these
 * and nothing else, so a muted-but-moving player and a moving-but-silent player
 * each lose only the channel they opted out of.
 *
 * A lamp is listed conditionally: `flicker` is motion, a steady lamp is not.
 */
const MOTION_CHANNELS: ReadonlySet<HauntCue['channel']> = new Set<HauntCue['channel']>([
  'camera',
  'environment',
  'haptic',
]);

export function isMotionCue(cue: HauntCue): boolean {
  if (cue.channel === 'lamp') {
    return cue.effect === 'flicker';
  }
  return MOTION_CHANNELS.has(cue.channel);
}

export type SilenceReason = 'muted' | 'audio-unavailable';

/**
 * What the UI should actually do with a cue once the player's settings are
 * applied. A discriminated union so a renderer cannot forget a case.
 */
export type CuePresentation =
  | {
      readonly mode: 'as-authored';
      readonly cue: HauntCue;
    }
  | {
      readonly mode: 'reduced-motion';
      readonly cue: HauntCue;
      /** Never `'none'`; a `'none'` alternative resolves to `suppressed`. */
      readonly alternative: 'fade' | 'static';
    }
  | {
      readonly mode: 'silent';
      readonly cue: HauntCue;
      /** Never `'none'`; a `'none'` alternative resolves to `suppressed`. */
      readonly alternative: 'caption' | 'visual-signal';
      readonly reason: SilenceReason;
    }
  | {
      readonly mode: 'suppressed';
      readonly cue: HauntCue;
      readonly reason: 'reduced-motion' | SilenceReason;
    };

/**
 * Resolve one cue against the player's settings.
 *
 * Audio is decided before motion because a sound cue carries no motion, and the
 * authored `silentAlternative` is what keeps the game completable with no audio
 * at all (R7.4, R9.4).
 */
export function resolveCue(cue: HauntCue, settings: HauntingSettings): CuePresentation {
  if (isAudibleCue(cue)) {
    const reason: SilenceReason | null = !settings.audioAvailable
      ? 'audio-unavailable'
      : settings.muted
        ? 'muted'
        : null;

    if (reason !== null) {
      if (cue.silentAlternative === 'none') {
        return { mode: 'suppressed', cue, reason };
      }
      return { mode: 'silent', cue, alternative: cue.silentAlternative, reason };
    }
    return { mode: 'as-authored', cue };
  }

  if (settings.reducedMotion && isMotionCue(cue)) {
    if (cue.reducedMotionAlternative === 'none') {
      return { mode: 'suppressed', cue, reason: 'reduced-motion' };
    }
    return { mode: 'reduced-motion', cue, alternative: cue.reducedMotionAlternative };
  }

  return { mode: 'as-authored', cue };
}

export function resolveCues(
  cues: readonly HauntCue[],
  settings: HauntingSettings,
): readonly CuePresentation[] {
  return cues.map((cue) => resolveCue(cue, settings));
}

/**
 * True when the resolved batch still communicates something the player can
 * perceive. Used to prove that muting, silencing, or stilling the game never
 * leaves an event invisible (R5.4, R9.4).
 */
export function isPerceivable(presentations: readonly CuePresentation[]): boolean {
  return presentations.some((presentation) => presentation.mode !== 'suppressed');
}
