import { createRestTracker, restWait, TIP_WAIT_MS } from "./rest-tracker";

/**
 * The 0.8 s rest wait for the board's older tooltips (`MinecraftTooltip`: top
 * bar, tabs, overview, library, pickers) on plan-mode boards. Each tooltip root
 * is a "thing"; the pointer resting on one keeps the wait, another resets it.
 */
const tracker = createRestTracker(TIP_WAIT_MS);
const ids = new WeakMap<Element, number>();
let counter = 0;

/** Milliseconds this root's tip must still wait; 0 shows it now (also when waiting is off). */
export function restRemaining(root: Element | null): number {
  if (restWait() <= 0 || !root) return 0;
  let id = ids.get(root);
  if (id === undefined) {
    id = ++counter;
    ids.set(root, id);
  }
  const now = performance.now();
  tracker.point(String(id), now);
  return tracker.ready(now) ? 0 : tracker.remaining(now);
}

/** The pointer left the tooltip's thing: the next one waits in full. */
export function restLeave(): void {
  tracker.point(undefined, performance.now());
}
