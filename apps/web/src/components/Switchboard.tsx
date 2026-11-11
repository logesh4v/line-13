import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import type { EntityId } from '../contracts.ts';
import type { ConfirmedRoute, CordState } from '../game/types.ts';
import { useBoardPoints } from '../hooks/useBoardPoints.ts';
import { useCordDrag } from '../hooks/useCordDrag.ts';
import type { BoardJack } from '../selectors.ts';
import { CordLayer } from './CordLayer.tsx';
import type { CordSpec } from './CordLayer.tsx';
import { Sigil } from './Sigil.tsx';

export interface SwitchboardProps {
  readonly jacks: readonly BoardJack[];
  readonly dormantLabels: readonly string[];
  readonly cord: CordState;
  readonly closedRoutes: readonly ConfirmedRoute[];
  /** The sigil is drawing: LINE 13 is ringing or the shift has ended. */
  readonly sigil: boolean;
  readonly sigilLabel: string;
  readonly reducedMotion: boolean;
  readonly onAnswerCall: (callerId: EntityId) => void;
  readonly onLiftCord: (callerId: EntityId) => void;
  readonly onPlugCord: (destinationId: EntityId) => void;
  readonly onAnswerLine13: () => void;
}

interface JackAction {
  readonly verb: string;
  readonly run: () => void;
}

const ARROW_FORWARD = new Set(['ArrowRight', 'ArrowDown']);
const ARROW_BACK = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * The face of the switchboard: the lines, the destination jacks and the
 * thirteenth lamp.
 *
 * Three ways to route a call, all reaching the same actions:
 *
 * - pointer: tap a ringing line to answer it, tap it again to lift the cord,
 *   then tap a jack, or drag the cord between them;
 * - touch: the same taps, on targets that clear 44px;
 * - keyboard: Tab or the arrow keys to move along the board, Enter or Space to
 *   answer, lift and plug.
 *
 * Nothing here decides a puzzle rule. The board only reports what the reducer
 * says is operable and sends the operator's gesture back as an action.
 */
export function Switchboard({
  jacks,
  dormantLabels,
  cord,
  closedRoutes,
  sigil,
  sigilLabel,
  reducedMotion,
  onAnswerCall,
  onLiftCord,
  onPlugCord,
  onAnswerLine13,
}: SwitchboardProps): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardElement, setBoardElement] = useState<HTMLDivElement | null>(null);
  const points = useBoardPoints(boardRef);
  const callerJacks = jacks.filter((jack) => jack.kind === 'caller');
  const destinationJacks = jacks.filter((jack) => jack.kind === 'destination');
  const lineThirteen = jacks.find((jack) => jack.kind === 'line-13') ?? null;
  const anyLiftable = callerJacks.some((jack) => jack.action === 'lift');

  const drag = useCordDrag({
    enabled: anyLiftable,
    onLift: onLiftCord,
    onPlug: onPlugCord,
  });

  const moveFocus = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const forward = ARROW_FORWARD.has(event.key);
    const back = ARROW_BACK.has(event.key);
    const home = event.key === 'Home';
    const end = event.key === 'End';
    if (!forward && !back && !home && !end) {
      return;
    }

    const field = event.currentTarget;
    const operable = [...field.querySelectorAll<HTMLButtonElement>('button.jack:not(:disabled)')];
    if (operable.length === 0) {
      return;
    }

    const current = operable.findIndex((element) => element === document.activeElement);
    let next: number;
    if (home) {
      next = 0;
    } else if (end) {
      next = operable.length - 1;
    } else if (current === -1) {
      next = 0;
    } else {
      next = forward ? current + 1 : current - 1;
      next = (next + operable.length) % operable.length;
    }

    operable[next]?.focus();
    event.preventDefault();
  }, []);

  function actionFor(jack: BoardJack): JackAction | null {
    switch (jack.action) {
      case 'answer':
        return { verb: 'answer the call', run: () => onAnswerCall(jack.id) };
      case 'lift':
        return { verb: 'lift the cord', run: () => onLiftCord(jack.id) };
      case 'plug':
        return { verb: 'plug the cord in here', run: () => onPlugCord(jack.id) };
      case 'line-13':
        return { verb: 'answer the thirteenth lamp', run: onAnswerLine13 };
      default:
        return null;
    }
  }

  function renderJack(jack: BoardJack): ReactElement {
    const action = actionFor(jack);
    // WCAG 2.5.3: the accessible name must start with the visible text, in the
    // same order (label, name, state word), so voice control can say what it sees.
    const spoken = [jack.label, jack.name, jack.lampWord].filter((part) => part !== '').join(' ');
    const label = `${spoken}${action === null ? '' : `, ${action.verb}`}`;

    const body = (
      <>
        <span className="lamp" data-lamp={jack.lamp} aria-hidden="true" />
        <span className="jack-socket" aria-hidden="true" />
        <span className="jack-label">{jack.label}</span>{' '}
        {jack.name === '' ? null : <span className="jack-name">{jack.name}</span>}{' '}
        <span className="jack-state">{jack.lampWord}</span>
      </>
    );

    if (action === null) {
      // Not operable right now. The visible label and state word carry
      // everything, so it needs no accessible name of its own.
      return (
        <div
          key={jack.id}
          className="jack"
          data-jack-id={jack.id}
          data-jack-kind={jack.kind}
          data-lamp={jack.lamp}
          data-operable="false"
          data-plugged={String(jack.plugged)}
        >
          {body}
        </div>
      );
    }

    return (
      <button
        key={jack.id}
        type="button"
        className="jack"
        data-jack-id={jack.id}
        data-jack-kind={jack.kind}
        data-lamp={jack.lamp}
        data-operable="true"
        data-plugged={String(jack.plugged)}
        aria-label={label}
        {...(jack.action === 'lift' ? { onPointerDown: drag.onSourcePointerDown } : {})}
        onClick={() => {
          if (drag.shouldIgnoreClick()) {
            return;
          }
          action.run();
        }}
      >
        {body}
      </button>
    );
  }

  const cords = useMemo<readonly CordSpec[]>(() => {
    const specs: CordSpec[] = closedRoutes.map((route) => ({
      id: `cord-${route.callerId}`,
      fromJackId: route.callerId,
      toJackId: route.destinationId,
      appearance: 'closed' as const,
    }));
    if (cord.kind === 'held') {
      specs.push({ id: 'cord-hand', fromJackId: cord.callerId, toJackId: null, appearance: 'held' });
    } else if (cord.kind === 'patched' || cord.kind === 'rejected') {
      specs.push({
        id: `cord-${cord.callerId}`,
        fromJackId: cord.callerId,
        toJackId: cord.destinationId,
        appearance: cord.kind,
      });
    }
    return specs;
  }, [closedRoutes, cord]);

  const usedDestinations = new Set(closedRoutes.map((route) => route.destinationId));
  const sealed = destinationJacks
    .filter((jack) => !usedDestinations.has(jack.id))
    .map((jack) => jack.id);

  return (
    <div
      className="board"
      data-sigil={String(sigil)}
      ref={(element) => {
        boardRef.current = element;
        if (element !== boardElement) {
          setBoardElement(element);
        }
      }}
    >
      <div
        className="jack-field"
        role="group"
        aria-label="Switchboard jack field"
        onKeyDown={moveFocus}
      >
        <p className="jack-row-label">Lines</p>
        <div className="jack-row jack-row--lines">{callerJacks.map((jack) => renderJack(jack))}</div>
        <p className="jack-row-label">Destinations</p>
        <div className="jack-row jack-row--destinations">
          {destinationJacks.map((jack) => renderJack(jack))}
        </div>
        <div className="jack-row jack-row--finale">
          {lineThirteen === null ? null : renderJack(lineThirteen)}
          {dormantLabels.map((label) => (
            <div className="jack jack--dormant" key={label} aria-hidden="true">
              <span className="lamp" data-lamp="dark" />
              <span className="jack-socket" />
              <span className="jack-label">{label}</span>
              <span className="jack-state">NO CIRCUIT</span>
            </div>
          ))}
        </div>
      </div>
      <CordLayer
        points={points}
        boardElement={boardElement}
        cords={cords}
        taut={sigil}
        reducedMotion={reducedMotion}
      />
      {sigil ? (
        <Sigil
          points={points}
          routes={closedRoutes}
          sealedDestinationIds={sealed}
          centreId="line-13"
          label={sigilLabel}
        />
      ) : null}
    </div>
  );
}
