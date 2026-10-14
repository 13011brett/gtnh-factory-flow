/**
 * What a card's shell needs from the card model, as pure functions (tested without React).
 *
 * The shell is the stand-in for a card whose contents are not mounted: a box of the card's size that wears the
 * card's frame and the glance face. Its size is what React Flow measured while the card was drawn, so the box
 * never changes size when the contents come and go; a card nobody has drawn yet (a plan just opened) is
 * mounted instead (card-virtualizer.ts), so the estimate below is only the very first paint of a card whose
 * measure is still on its way.
 */

import { CC_GEOMETRY } from "../clean/tokens";
import type { CleanCardView } from "../clean/clean-model";

/** A port row is two cells; a row with a forced line under it is two more. */
const ROW = CC_GEOMETRY.rowHeight;

function railHeight(ports: CleanCardView["inputs"], extraRows: number): number {
  let height = extraRows * ROW;
  for (const port of ports) height += port.forced ? 2 * ROW : ROW;
  return height;
}

/** The card's height from its view: head, the tallest of the two rails and the picture, the strip. */
export function estimateCardHeight(view: CleanCardView): number {
  const rails = Math.max(
    railHeight(view.inputs, view.power ? 1 : 0),
    railHeight(view.outputs, 0),
    CC_GEOMETRY.pictureMinHeight,
  );
  return CC_GEOMETRY.headHeight + rails + (view.chips.length > 0 ? view.stripHeight : 0);
}

/**
 * Everything about a card that moves its box or its handles, as one string. When it changes while the card is
 * not mounted, the card is mounted once so React Flow measures the new box and handles (use-rendered-handles.ts
 * does the same for a mounted card).
 */
export function cardLayoutSignature(view: CleanCardView): string {
  const rail = (ports: CleanCardView["inputs"]) => ports.map((p) => `${p.handleId}${p.forced ? "+" : ""}`).join(",");
  return `${rail(view.inputs)}|${rail(view.outputs)}|${view.power ? 1 : 0}|${view.chips.length > 0 ? view.stripHeight : 0}`;
}
