import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Below this, a pointer gesture is a tap and the click handler owns it. */
const DRAG_THRESHOLD_PX = 12;

export interface CordDrag {
  /** Attach to the caller jack. Pointer, mouse and touch all arrive here. */
  readonly onSourcePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** True while a cord is actually being dragged across the board. */
  readonly dragging: boolean;
  /**
   * Call at the top of the jack's click handler. Returns true when the click
   * is the tail of a drag that already did the work, so a drag never fires the
   * tap path as well.
   */
  readonly shouldIgnoreClick: () => boolean;
}

export interface CordDragOptions {
  readonly enabled: boolean;
  readonly onLift: (callerId: string) => void;
  readonly onPlug: (destinationId: string) => void;
}

interface DragOrigin {
  readonly callerId: string;
  readonly x: number;
  readonly y: number;
  readonly pointerId: number;
}

function destinationUnder(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY);
  if (element === null) {
    return null;
  }
  const jack = element.closest('[data-jack-kind="destination"]');
  if (!(jack instanceof HTMLElement)) {
    return null;
  }
  return jack.dataset.jackId ?? null;
}

/**
 * Dragging a cord from a ringing line to a jack, for the players who will
 * instinctively try it.
 *
 * This is an enhancement and never the only way through: tapping the line and
 * then the jack, and the keyboard path, both reach the same actions. If
 * pointer capture, `elementFromPoint` or the drag itself goes wrong, the
 * gesture does nothing and the tap path is untouched.
 *
 * The window listeners stay attached for the component's whole life and do
 * nothing until a gesture starts, which is simpler — and more reliable — than
 * attaching them per gesture from inside a ref write.
 */
export function useCordDrag({ enabled, onLift, onPlug }: CordDragOptions): CordDrag {
  const [dragging, setDragging] = useState(false);
  const origin = useRef<DragOrigin | null>(null);
  const lifted = useRef(false);
  const suppressClick = useRef(false);
  const handlers = useRef({ onLift, onPlug });

  // Keep the latest callbacks without re-attaching listeners on every render.
  useEffect(() => {
    handlers.current = { onLift, onPlug };
  }, [onLift, onPlug]);

  const finish = useCallback((): void => {
    origin.current = null;
    lifted.current = false;
    setDragging(false);
  }, []);

  useEffect(() => {
    function handleMove(event: PointerEvent): void {
      const start = origin.current;
      if (start === null || event.pointerId !== start.pointerId) {
        return;
      }
      const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (travelled < DRAG_THRESHOLD_PX || lifted.current) {
        return;
      }
      lifted.current = true;
      setDragging(true);
      handlers.current.onLift(start.callerId);
    }

    function handleUp(event: PointerEvent): void {
      const start = origin.current;
      if (start === null || event.pointerId !== start.pointerId) {
        return;
      }
      if (lifted.current) {
        suppressClick.current = true;
        const destinationId = destinationUnder(event.clientX, event.clientY);
        if (destinationId !== null) {
          handlers.current.onPlug(destinationId);
        }
      }
      finish();
    }

    function handleCancel(): void {
      if (origin.current === null) {
        return;
      }
      if (lifted.current) {
        suppressClick.current = true;
      }
      finish();
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [finish]);

  const onSourcePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (!enabled || event.button !== 0) {
        return;
      }
      origin.current = {
        callerId: event.currentTarget.dataset.jackId ?? '',
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
      lifted.current = false;
    },
    [enabled],
  );

  const shouldIgnoreClick = useCallback((): boolean => {
    if (!suppressClick.current) {
      return false;
    }
    suppressClick.current = false;
    return true;
  }, []);

  return { onSourcePointerDown, dragging, shouldIgnoreClick };
}
