import type { SizeOf } from "./group-model";

/**
 * The board's measured sizes for the group edits (a card's real height, a summary's), published by the board as it
 * publishes its geometry. Edits made off the board (menus, the store) read it; with no board it answers nothing and
 * the edits estimate.
 */
let source: SizeOf = () => undefined;

export function setBoardSizeSource(next: SizeOf): void {
  source = next;
}

export const boardSizeOf: SizeOf = (id) => source(id);
