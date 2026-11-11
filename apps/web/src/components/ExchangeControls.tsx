import type { ReactElement } from 'react';

import type { ExchangeSettings, SettingKey } from '../settings/settings.ts';
import { CONTROL_ENGRAVINGS, positionWord } from '../settings/settings.ts';

export interface ExchangeControlsProps {
  readonly settings: ExchangeSettings;
  readonly onToggle: (key: SettingKey) => void;
  /** Stated plainly when the browser gave us no audio at all. */
  readonly audioAvailable: boolean;
}

/**
 * The control strip screwed to the board.
 *
 * Sound, subtitles, motion and contrast are four brass toggle switches on the
 * exchange itself, not a settings menu bolted onto a game. Each one is a real
 * `switch` with its position read out in words as well as thrown, so none of
 * them depends on seeing which way a lever points.
 */
export function ExchangeControls({
  settings,
  onToggle,
  audioAvailable,
}: ExchangeControlsProps): ReactElement {
  return (
    <section className="controls" aria-label="Exchange controls">
      <p className="controls-legend">Operator controls</p>
      <div className="switch-bank">
        {CONTROL_ENGRAVINGS.map((control) => {
          const thrown = settings[control.key];
          return (
            <button
              key={control.key}
              type="button"
              className="switch"
              role="switch"
              aria-checked={thrown}
              aria-label={control.accessibleName}
              onClick={() => onToggle(control.key)}
            >
              <span className="switch-engraving">{control.engraving}</span>
              <span className="switch-throw" aria-hidden="true" />
              <span className="switch-position">{positionWord(settings, control)}</span>
            </button>
          );
        })}
      </div>
      {audioAvailable ? null : (
        <p className="controls-legend" role="status">
          No audio on this browser. Captions carry every cue.
        </p>
      )}
    </section>
  );
}
