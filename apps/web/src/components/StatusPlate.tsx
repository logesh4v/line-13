import type { ReactElement } from 'react';

export interface StatusPlateProps {
  readonly status: string;
  readonly prompt: string;
  /** Non-blocking episode-source notice, or null when there is nothing to say. */
  readonly notice: string | null;
}

/**
 * The engraved plate across the top rail of the board. It is the exchange's own
 * nameplate, not an application header, and it is where every state is
 * readable as words rather than inferred from a lamp.
 */
export function StatusPlate({ status, prompt, notice }: StatusPlateProps): ReactElement {
  return (
    <header className="plate">
      <p className="plate-mark">
        Night exchange
        <strong>
          LINE <span>13</span>
        </strong>
      </p>
      <div className="status">
        {/* A live region: a change of state is announced, not just redrawn. */}
        <p className="status-line" role="status" aria-live="polite">
          {status}
        </p>
        <p className="status-prompt">{prompt}</p>
        {notice !== null ? <p className="status-notice">{notice}</p> : null}
      </div>
    </header>
  );
}
