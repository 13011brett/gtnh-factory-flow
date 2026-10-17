/**
 * The first paint of a shell, as pure functions (tested without React).
 *
 * A shell is the stand-in for a card whose contents are not mounted: a box of the card's size that wears the
 * card's frame and the glance face. Its size is what React Flow measured while the card was drawn, so the box
 * never changes size when the contents come and go. A card nobody has drawn yet (a plan just opened) is measured
 * at the estimate below and drawn once in the background pass (card-virtualizer.ts), which gives React Flow the
 * real box and handles.
 */

import { CC_GEOMETRY } from "../clean/tokens";

/** A port row is two cells. */
const ROW = CC_GEOMETRY.rowHeight;

/**
 * The machine's well (the picture and the count under it, clean.css `.cc-pic`) is at least six cells: an 80 px picture
 * over what runs and what is set.
 */
export const WELL_MIN_HEIGHT = 120;

type Slot = { kind: string; id: string };

/**
 * A card's height from its recipe alone: a row for each distinct input and output (a free input is a row too),
 * a power row on the input rail, the well's minimum, no strip and no bar along the foot.
 */
export function estimateRecipeCardHeight(
  recipe: { inputs: ReadonlyArray<Slot>; outputs: ReadonlyArray<Slot> },
  hasPowerRow: boolean,
): number {
  const distinct = (list: ReadonlyArray<Slot>) =>
    new Set(list.map((entry) => `${entry.kind}:${entry.id}`)).size;
  const rails = Math.max(
    (distinct(recipe.inputs) + (hasPowerRow ? 1 : 0)) * ROW,
    distinct(recipe.outputs) * ROW,
    WELL_MIN_HEIGHT,
  );
  return CC_GEOMETRY.headHeight + rails;
}
