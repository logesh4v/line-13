import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import type { Ending } from '../contracts.ts';
import { ENDING_EFFECTS, ENDING_EPILOGUE, ENDING_REQUIREMENT } from '../game/endings.ts';

export interface EndingPlateProps {
  readonly ending: Ending;
  readonly allEndings: readonly Ending[];
  /** "LINE 03 → BELL TOWER", already formatted. */
  readonly routeSummary: string;
  readonly crossedLineCount: number;
  readonly onRestart: () => void;
}

/**
 * The ending.
 *
 * It states what the operator did in their own routing terms, says which of
 * the three endings the routes earned and what the other two ask for, so a
 * replay has somewhere to aim. The transition is carried as a data attribute
 * (connect, reverse or sever) that the stylesheet turns into a different
 * dissolve for each, and every one of them has a still equivalent.
 */
export function EndingPlate({
  ending,
  allEndings,
  routeSummary,
  crossedLineCount,
  onRestart,
}: EndingPlateProps): ReactElement {
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const crossed =
    crossedLineCount === 0
      ? 'You crossed no lines.'
      : crossedLineCount === 1
        ? 'You crossed one line and pulled it back.'
        : `You crossed ${crossedLineCount} lines and pulled every one of them back.`;

  return (
    <div
      className="ending"
      role="dialog"
      aria-modal="true"
      aria-label={ending.label}
      data-transition={ENDING_EFFECTS[ending.id] ?? 'connect'}
    >
      <div className="ending-panel">
        <span className="ending-eyebrow">Ending reached</span>
        <h2 ref={heading} tabIndex={-1}>
          {ending.label}
        </h2>
        <p>{ending.description}</p>
        {(ENDING_EPILOGUE[ending.id] ?? []).map((line) => (
          <p key={line} className="ending-epilogue">
            {line}
          </p>
        ))}
        <p className="ending-route">{routeSummary}</p>
        <p>{crossed}</p>

        <ul className="ending-ledger" aria-label="The three endings">
          {allEndings.map((candidate) => (
            <li key={candidate.id} data-reached={String(candidate.id === ending.id)}>
              <strong>{candidate.label}</strong>
              <span>{ENDING_REQUIREMENT[candidate.id] ?? ''}</span>
              <em>{candidate.id === ending.id ? 'Reached' : 'Not this shift'}</em>
            </li>
          ))}
        </ul>

        <button type="button" className="key key--primary" onClick={onRestart}>
          Take another shift
        </button>
      </div>
    </div>
  );
}
