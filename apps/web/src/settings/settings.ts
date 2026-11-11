/**
 * The four accessibility controls are physical switches on the exchange's own
 * control strip, not an application settings menu. Each one is engraved with a
 * noun and reads out a word for its position, so its state is never carried by
 * a colour or a lamp alone.
 */
export interface ExchangeSettings {
  readonly muted: boolean;
  readonly subtitles: boolean;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
}

export type SettingKey = keyof ExchangeSettings;

export interface ControlEngraving {
  readonly key: SettingKey;
  /** The plate engraving. */
  readonly engraving: string;
  /** The word shown when the setting is on. */
  readonly onWord: string;
  /** The word shown when the setting is off. */
  readonly offWord: string;
  /** Read by assistive technology in place of the engraving alone. */
  readonly accessibleName: string;
}

export const CONTROL_ENGRAVINGS: readonly ControlEngraving[] = [
  {
    key: 'muted',
    engraving: 'SOUND',
    onWord: 'CUT',
    offWord: 'LIVE',
    accessibleName: 'Cut all exchange sound',
  },
  {
    key: 'subtitles',
    engraving: 'SUBTITLES',
    onWord: 'ON',
    offWord: 'OFF',
    accessibleName: 'Print spoken lines on the ticket rail',
  },
  {
    key: 'reducedMotion',
    engraving: 'MOTION',
    onWord: 'HELD',
    offWord: 'FULL',
    accessibleName: 'Hold the room still',
  },
  {
    key: 'highContrast',
    engraving: 'CONTRAST',
    onWord: 'HIGH',
    offWord: 'LAMP',
    accessibleName: 'Raise panel contrast',
  },
];

export const DEFAULT_SETTINGS: ExchangeSettings = {
  muted: false,
  subtitles: true,
  reducedMotion: false,
  highContrast: false,
};

export type MediaQueryMatcher = (query: string) => boolean;

export const QUERY_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
export const QUERY_HIGH_CONTRAST = '(prefers-contrast: more)';

/**
 * Start from what the operating system already knows about the player. The
 * matcher is injected so this is testable without a browser.
 */
export function detectSettings(matches: MediaQueryMatcher): ExchangeSettings {
  return {
    ...DEFAULT_SETTINGS,
    reducedMotion: matches(QUERY_REDUCED_MOTION),
    highContrast: matches(QUERY_HIGH_CONTRAST),
  };
}

export function toggleSetting(settings: ExchangeSettings, key: SettingKey): ExchangeSettings {
  return { ...settings, [key]: !settings[key] };
}

export function positionWord(settings: ExchangeSettings, control: ControlEngraving): string {
  return settings[control.key] ? control.onWord : control.offWord;
}
