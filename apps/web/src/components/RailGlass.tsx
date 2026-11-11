import type { ReactElement } from 'react';

import type { TranscriptLine } from '../game/types.ts';

export interface RailGlassProps {
  readonly line: TranscriptLine | null;
  readonly subtitlesOn: boolean;
  /** Exact captions standing in for cues the operator cannot hear. */
  readonly captions: readonly string[];
}

const SPEAKER_NAME: Readonly<Record<TranscriptLine['speaker'], string>> = {
  caller: 'Caller',
  exchange: 'Exchange',
  'line-13': 'Line 13',
};

/**
 * The glass readout along the bottom rail: the exact subtitle for whatever was
 * last spoken, and captions for cues the speakers are not carrying.
 *
 * Every spoken line has an exact subtitle, so a player who never turns the
 * sound on misses nothing, and a voice that fails to play costs nothing.
 */
export function RailGlass({ line, subtitlesOn, captions }: RailGlassProps): ReactElement {
  return (
    <footer
      className="rail-glass"
      aria-label="Line readout"
      data-speaker={line === null ? 'none' : line.speaker}
    >
      <div aria-live="polite">
        {subtitlesOn && line !== null ? (
          <>
            <span className="subtitle-speaker">{SPEAKER_NAME[line.speaker]}</span>
            <p className="subtitle" data-corrupted={String(line.corrupted)}>
              {line.text}
            </p>
          </>
        ) : (
          <p className="subtitle" data-corrupted="false">
            {subtitlesOn ? 'The line is quiet.' : 'Subtitles are off.'}
          </p>
        )}
      </div>
      {captions.length === 0 ? null : (
        <ul className="captions" aria-label="Sound captions">
          {captions.map((caption) => (
            <li key={caption}>{caption}</li>
          ))}
        </ul>
      )}
    </footer>
  );
}
