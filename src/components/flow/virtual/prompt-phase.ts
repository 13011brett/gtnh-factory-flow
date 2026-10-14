/**
 * Every "(set count)" prompt on the board blinks in one phase, however late its card mounted: a new card's
 * animations are pinned to the document timeline's start.
 *
 * `getAnimations` flushes style for the whole page, so doing it in each card's mount effect cost a full style
 * recalculation per card (7 ms each at 1,000 cards, 160 ms a batch of 24). The cards queue their roots here and
 * one flush a frame pins them all after a single recalculation.
 */
const pending = new Set<Element>();
let frame = 0;

function flush() {
  frame = 0;
  for (const root of pending) {
    if (!root.isConnected) continue;
    for (const animation of root.getAnimations?.({ subtree: true }) ?? []) {
      if ((animation as CSSAnimation).animationName === "cc-prompt") animation.startTime = 0;
    }
  }
  pending.clear();
}

/** Pins the prompt animations under `root` to the shared phase, in the next frame. */
export function syncPromptPhase(root: Element | null): void {
  if (!root) return;
  pending.add(root);
  if (!frame) frame = requestAnimationFrame(flush);
}
