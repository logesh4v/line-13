/**
 * Player-facing presentation settings consumed by cue resolution.
 *
 * These are declarative inputs only. Changing a setting can never change which
 * cues an event produces, so a muted or reduced-motion player replays to the
 * identical cue list as everybody else and only the PRESENTATION differs.
 */
export interface HauntingSettings {
  /** Player pressed mute. All audible output resolves to its silent alternative. */
  readonly muted: boolean;
  /** No usable audio pipeline at all (unsupported context, blocked, disposed). */
  readonly audioAvailable: boolean;
  /** `prefers-reduced-motion: reduce`, or the in-game toggle. */
  readonly reducedMotion: boolean;
  /** Subtitles are rendered for every spoken line. */
  readonly subtitles: boolean;
  /** High-contrast presentation requested. */
  readonly highContrast: boolean;
}

export const DEFAULT_HAUNTING_SETTINGS: HauntingSettings = {
  muted: false,
  audioAvailable: true,
  reducedMotion: false,
  subtitles: true,
  highContrast: false,
};

/**
 * The settings a judge path falls back to when nothing can be played: the game
 * stays completable on captions and visual signals alone.
 */
export const SILENT_HAUNTING_SETTINGS: HauntingSettings = {
  muted: true,
  audioAvailable: false,
  reducedMotion: false,
  subtitles: true,
  highContrast: false,
};

export function withSettings(
  base: HauntingSettings,
  patch: Partial<HauntingSettings>,
): HauntingSettings {
  return {
    muted: patch.muted ?? base.muted,
    audioAvailable: patch.audioAvailable ?? base.audioAvailable,
    reducedMotion: patch.reducedMotion ?? base.reducedMotion,
    subtitles: patch.subtitles ?? base.subtitles,
    highContrast: patch.highContrast ?? base.highContrast,
  };
}
