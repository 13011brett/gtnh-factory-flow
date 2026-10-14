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
 * Written on the board that is every wire and every card of the plan on screen, and each coarse zoom step cost
 * 100 ms of style. Only two things read it:
 *
 * - the glance step's faces (every rule is under `[data-detail-level="glance"]`): written on the React Flow
 *   wrapper of each card and drawer the camera can see (the virtualizer's visible set, which the controller
 *   hands over with `setZoomTargets`), and only while the board is at the glance step. Without a controller
 *   (virtualization off) it is written on the board, as before;
 * - sticky notes, a handful of elements: each registers its root and is written directly, at every zoom.
 */

const consumers = new Set<HTMLElement>();
let lastZoom = 1;
let lastBoard: HTMLElement | null = null;
let subscribed = false;
let targetsOf: (() => Iterable<HTMLElement>) | undefined;
let written = new Set<HTMLElement>();

const NAME = "--board-zoom";

/** The controller says whose wrappers are on screen; without it the board itself carries the variable. */
export function setZoomTargets(provider: (() => Iterable<HTMLElement>) | undefined): void {
  targetsOf = provider;
  if (!provider) {
    for (const element of written) element.style.removeProperty(NAME);
    written = new Set();
  }
  // Whichever carried the variable hands it over now.
  if (lastBoard?.isConnected) applyToBoard(lastBoard);
}

function applyToBoard(board: HTMLElement) {
  const glance = getPublishedNodeDetailLevel() === NODE_DETAIL_GLANCE;
  if (targetsOf) {
    if (board.style.getPropertyValue(NAME) !== "") board.style.removeProperty(NAME);
    const next = new Set<HTMLElement>();
    if (glance) {
      const value = String(lastZoom);
      for (const element of targetsOf()) {
        element.style.setProperty(NAME, value);
        next.add(element);
      }
    }
    for (const element of written) if (!next.has(element)) element.style.removeProperty(NAME);
    written = next;
    return;
  }
  if (glance) {
    board.style.setProperty(NAME, String(lastZoom));
  } else if (board.style.getPropertyValue(NAME) !== "") {
    board.style.removeProperty(NAME);
  }
}

/** A wrapper that has just been shown at the glance step takes the zoom at once, not at the next step. */
export function applyZoomTo(element: HTMLElement): void {
  if (!targetsOf || getPublishedNodeDetailLevel() !== NODE_DETAIL_GLANCE) return;
  element.style.setProperty(NAME, String(lastZoom));
  written.add(element);
}

/** Writes the zoom where something reads it. Called by NodeDetailController in coarse steps. */
export function writeBoardZoom(board: HTMLElement | null, zoom: number): void {
  lastZoom = zoom;
  if (board) {
    lastBoard = board;
    applyToBoard(board);
    if (!subscribed) {
      subscribed = true;
      // The step flipped: the variable appears or goes at once, whatever the zoom is doing.
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
