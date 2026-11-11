import type { ReactElement } from 'react';

import type { Caller, Clue, Destination, EntityId } from '../contracts.ts';

export interface ClosedCircuit {
  readonly callerId: EntityId;
  /** "Ruth Bell → Bell Tower", already formatted. */
  readonly text: string;
}

export interface RoutingTicketProps {
  readonly caller: Caller | null;
  readonly clues: readonly Clue[];
  readonly destinations: readonly Destination[];
  readonly circuits: readonly ClosedCircuit[];
  readonly canCloseCircuit: boolean;
  readonly canPullCord: boolean;
  readonly canReopen: boolean;
  readonly onCloseCircuit: () => void;
  readonly onPullCord: () => void;
  readonly onReopen: (callerId: EntityId) => void;
}

/**
 * The ivory routing ticket on the desk.
 *
 * Everything on it is episode text rendered as text, never as markup, and the
 * ticket only ever prints what the caller has actually said, so the paper
 * fills up as the call goes on. Circuits already closed are listed beneath,
 * each with the one way back: reopen it, which frees the jack and puts the
 * caller on hold again.
 */
export function RoutingTicket({
  caller,
  clues,
  destinations,
  circuits,
  canCloseCircuit,
  canPullCord,
  canReopen,
  onCloseCircuit,
  onPullCord,
  onReopen,
}: RoutingTicketProps): ReactElement {
  return (
    <section className="ticket" aria-label="Routing ticket">
      <h2>{caller === null ? 'No ticket' : caller.displayName}</h2>

      {caller === null ? (
        <p className="ticket-empty">The desk is clear. Wait for a lamp.</p>
      ) : (
        <dl>
          <dt>Line</dt>
          <dd>{caller.initialLineId.replace('-', ' ')}</dd>
          <dt>Departed</dt>
          <dd>{caller.departedOn}</dd>
        </dl>
      )}

      <h3 className="visually-hidden">What they have told you</h3>
      {clues.length === 0 ? (
        <p className="ticket-empty">Nobody on the desk has said anything yet.</p>
      ) : (
        <ul className="ticket-clues">
          {clues.map((clue) => (
            <li key={clue.id}>{clue.text}</li>
          ))}
        </ul>
      )}

      <h3 className="visually-hidden">Destinations on the board</h3>
      <ul className="ticket-clues">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <strong>{destination.label}.</strong> {destination.description}
          </li>
        ))}
      </ul>

      <div className="ticket-actions">
        <button
          type="button"
          className="key key--primary"
          onClick={onCloseCircuit}
          disabled={!canCloseCircuit}
        >
          Close the circuit
        </button>
        <button type="button" className="key" onClick={onPullCord} disabled={!canPullCord}>
          Pull the cord
        </button>
      </div>

      {circuits.length === 0 ? null : (
        <>
          <h3 className="ticket-circuits-title">Circuits closed</h3>
          <ul className="ticket-circuits">
            {circuits.map((circuit) => (
              <li key={circuit.callerId}>
                <span>{circuit.text}</span>
                <button
                  type="button"
                  className="key key--small"
                  disabled={!canReopen}
                  onClick={() => onReopen(circuit.callerId)}
                  aria-label={`Reopen circuit: ${circuit.text}`}
                >
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
