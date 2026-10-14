import { useRef, type MouseEvent, type PointerEvent } from "react";

/**
 * A left press on anything on the board is a click when let go within 3 px of
 * where it went down (the mod's `BoardCanvas.DRAG_SLOP`), and acts then; moved
 * further it carries the thing under it and the control does nothing. 3 CSS px
 * whatever the zoom. Right and middle presses act at once. React Flow's
 * `nodeDragThreshold={3}` makes a card start moving at the same distance.
 */
export const CLICK_SLOP = 3;

export function isClickMove(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) < CLICK_SLOP;
}

/** Put `onPointerDownCapture` on the card or drawer root; ask `wasClick` in each control's click handler. */
export function useClickSlop() {
  const down = useRef({ x: 0, y: 0 });
  return {
    onPointerDownCapture: (event: PointerEvent) => {
      down.current = { x: event.clientX, y: event.clientY };
    },
    wasClick: (event: MouseEvent) => isClickMove(down.current, { x: event.clientX, y: event.clientY }),
  };
}
