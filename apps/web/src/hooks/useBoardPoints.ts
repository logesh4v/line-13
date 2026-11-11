import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BoardPoints {
  readonly width: number;
  readonly height: number;
  /** Socket centre per jack id, in board coordinates. */
  readonly sockets: Readonly<Record<string, Point>>;
}

const EMPTY: BoardPoints = { width: 0, height: 0, sockets: {} };

function measureBoard(board: HTMLElement): BoardPoints {
  const boardBox = board.getBoundingClientRect();
  const sockets: Record<string, Point> = {};
  for (const jack of board.querySelectorAll<HTMLElement>('[data-jack-id]')) {
    const id = jack.dataset.jackId;
    if (id === undefined) {
      continue;
    }
    const socket = jack.querySelector('.jack-socket') ?? jack;
    const box = socket.getBoundingClientRect();
    sockets[id] = {
      x: Math.round(box.left - boardBox.left + box.width / 2),
      y: Math.round(box.top - boardBox.top + box.height / 2),
    };
  }
  return { width: Math.round(boardBox.width), height: Math.round(boardBox.height), sockets };
}

/**
 * Where every socket on the board really is, measured off the DOM rather than
 * guessed at, so cords and the sigil still land on the jacks after a resize,
 * a reflow or a rotation. Re-measures after every render but only publishes a
 * change when a socket actually moved.
 */
export function useBoardPoints(boardRef: RefObject<HTMLElement | null>): BoardPoints {
  const [points, setPoints] = useState<BoardPoints>(EMPTY);
  const last = useRef('');

  const measure = useCallback((): void => {
    const board = boardRef.current;
    if (board === null) {
      return;
    }
    const next = measureBoard(board);
    const key = JSON.stringify(next);
    if (key !== last.current) {
      last.current = key;
      setPoints(next);
    }
  }, [boardRef]);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const board = boardRef.current;
    if (board === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [boardRef, measure]);

  return points;
}
