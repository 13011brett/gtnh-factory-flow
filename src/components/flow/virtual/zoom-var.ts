import {
  getPublishedNodeDetailLevel,
  NODE_DETAIL_GLANCE,
  subscribeNodeDetailLevel,
} from "../node-detail";

/**
 * `--board-zoom`, the live zoom for CSS that must hold a constant size on screen (the zoomed-out look's rings and
 * figures, a sticky note's keys).
 *
 * It is an INHERITED custom property, so every write restyles every element under the element it is written on.
 * With cards mounted only near the screen the board still holds a few thousand elements, and each coarse zoom step
 * cost 100 ms of style. Only two things read it:
 *
 * - the glance step's faces (every rule is under `[data-detail-level="glance"]`), which are two elements a card:
 *   so it is written on the board only while the board is at the glance step and removed from it at full detail;
 * - sticky notes, a handful of elements: each registers its root and is written directly, at every zoom.
 */

const consumers = new Set<HTMLElement>();
let lastZoom = 1;
let lastBoard: HTMLElement | null = null;
let subscribed = false;

const NAME = "--board-zoom";

function applyToBoard(board: HTMLElement) {
  if (getPublishedNodeDetailLevel() === NODE_DETAIL_GLANCE) {
    board.style.setProperty(NAME, String(lastZoom));
  } else if (board.style.getPropertyValue(NAME) !== "") {
    board.style.removeProperty(NAME);
  }
}

/** Writes the zoom where something reads it. Called by NodeDetailController in coarse steps. */
export function writeBoardZoom(board: HTMLElement | null, zoom: number): void {
  lastZoom = zoom;
  if (board) {
    lastBoard = board;
    applyToBoard(board);
    if (!subscribed) {
      subscribed = true;
      // The step flipped: the board gains or loses the variable at once, whatever the zoom is doing.
      subscribeNodeDetailLevel(() => {
        if (lastBoard?.isConnected) applyToBoard(lastBoard);
      });
    }
  }
  for (const element of consumers) element.style.setProperty(NAME, String(zoom));
}

/** A sticky note's root: it reads the zoom whatever the step. Returns the unregister function. */
export function registerZoomConsumer(element: HTMLElement | null): () => void {
  if (!element) return () => undefined;
  consumers.add(element);
  element.style.setProperty(NAME, String(lastZoom));
  return () => {
    consumers.delete(element);
  };
}
