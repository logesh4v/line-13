import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { BoardPoints, Point } from '../hooks/useBoardPoints.ts';

export type CordAppearance = 'held' | 'patched' | 'rejected' | 'closed';

export interface CordSpec {
  readonly id: string;
  readonly fromJackId: string;
  /** Null for the cord still in the operator's hand. */
  readonly toJackId: string | null;
  readonly appearance: CordAppearance;
}

export interface CordLayerProps {
  readonly points: BoardPoints;
  readonly boardElement: HTMLElement | null;
  readonly cords: readonly CordSpec[];
  /** The sigil is drawing: every cord pulls taut into a straight line. */
  readonly taut: boolean;
  readonly reducedMotion: boolean;
}

interface Spring {
  sag: number;
  velocity: number;
}

const STIFFNESS = 0.085;
const DAMPING = 0.84;
const SETTLED = 0.12;

function restingSag(from: Point, to: Point): number {
  return Math.max(26, Math.abs(to.x - from.x) * 0.22, Math.abs(to.y - from.y) * 0.12);
}

function cordPath(from: Point, to: Point, sag: number): string {
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + sag}, ${to.x} ${to.y - sag}, ${to.x} ${to.y}`;
}

/**
 * The cloth cords, with weight.
 *
 * Each cord is a damped spring on its sag: a cord that has just been plugged
 * drops, overshoots and settles; a cord in the hand trails the pointer with
 * lag; when the sigil begins to draw, every cord pulls taut. The geometry is
 * measured off the real board, so it lands on the sockets at any size.
 *
 * Decoration only: hidden from assistive technology, and with reduced motion
 * every cord is drawn at rest with no animation loop at all. The plug in the
 * socket and the status plate say what is connected to what.
 */
export function CordLayer({
  points,
  boardElement,
  cords,
  taut,
  reducedMotion,
}: CordLayerProps): ReactElement | null {
  const springs = useRef(new Map<string, Spring>());
  const tail = useRef<Point | null>(null);
  const pointer = useRef<Point | null>(null);
  const [, setFrame] = useState(0);
  const raf = useRef<number | null>(null);

  // Track the pointer in board coordinates, for the cord in the hand.
  useEffect(() => {
    if (boardElement === null) {
      return undefined;
    }
    function onMove(event: PointerEvent): void {
      if (boardElement === null) {
        return;
      }
      const box = boardElement.getBoundingClientRect();
      pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [boardElement]);

  const held = cords.some((cord) => cord.appearance === 'held');

  useEffect(() => {
    if (reducedMotion) {
      springs.current.clear();
      return undefined;
    }

    function step(): void {
      let moving = false;
      for (const cord of cords) {
        const from = points.sockets[cord.fromJackId];
        const to = cord.toJackId === null ? undefined : points.sockets[cord.toJackId];
        if (from === undefined || to === undefined) {
          continue;
        }
        const goal = taut ? 0 : restingSag(from, to);
        let spring = springs.current.get(cord.id);
        if (spring === undefined) {
          // A cord that has just been plugged falls in from above its rest.
          spring = { sag: goal + 70, velocity: 0 };
          springs.current.set(cord.id, spring);
        }
        spring.velocity = (spring.velocity + (goal - spring.sag) * STIFFNESS) * DAMPING;
        spring.sag += spring.velocity;
        if (Math.abs(spring.velocity) > SETTLED || Math.abs(goal - spring.sag) > SETTLED) {
          moving = true;
        }
      }

      const origin = cords.find((cord) => cord.appearance === 'held');
      if (origin !== undefined) {
        const from = points.sockets[origin.fromJackId];
        if (from !== undefined) {
          const goal = pointer.current ?? { x: from.x, y: from.y + 78 };
          const current = tail.current ?? { x: from.x, y: from.y + 40 };
          tail.current = {
            x: current.x + (goal.x - current.x) * 0.22,
            y: current.y + (goal.y - current.y) * 0.22,
          };
          moving = true;
        }
      }

      setFrame((value) => value + 1);
      raf.current = moving ? requestAnimationFrame(step) : null;
    }

    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };
  }, [cords, points, taut, reducedMotion, held]);

  useEffect(() => {
    if (!held) {
      tail.current = null;
    }
  }, [held]);

  if (points.width === 0) {
    return null;
  }

  const drawn: ReactElement[] = [];
  for (const cord of cords) {
    const from = points.sockets[cord.fromJackId];
    if (from === undefined) {
      continue;
    }
    let to: Point | undefined;
    if (cord.toJackId === null) {
      to = reducedMotion
        ? { x: from.x, y: from.y + 78 }
        : (tail.current ?? { x: from.x, y: from.y + 40 });
    } else {
      to = points.sockets[cord.toJackId];
    }
    if (to === undefined) {
      continue;
    }
    const rest = taut ? 0 : restingSag(from, to);
    const sag = reducedMotion ? rest : (springs.current.get(cord.id)?.sag ?? rest);
    const d = cordPath(from, to, sag);
    drawn.push(
      <g key={cord.id} className="cord" data-cord={cord.appearance} data-taut={String(taut)}>
        <path className="cord-shadow" d={d} transform="translate(0 5)" />
        <path className="cord-path" data-cord={cord.appearance} d={d} />
        <path className="cord-weave" d={d} />
        <circle className="cord-plug" cx={from.x} cy={from.y} r={9} />
        {cord.toJackId === null ? null : <circle className="cord-plug" cx={to.x} cy={to.y} r={9} />}
      </g>,
    );
  }

  return (
    <svg
      className="cord-layer"
      width={points.width}
      height={points.height}
      viewBox={`0 0 ${points.width} ${points.height}`}
      aria-hidden="true"
      focusable="false"
    >
      {drawn}
    </svg>
  );
}
