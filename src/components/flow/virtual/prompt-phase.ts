/**
 * Every pulsing prompt on the board ("(set count)", "Set rate", the acceptance glow) shares one phase, however
 * late it mounted: a new animation's start time is set to the document timeline's origin.
 *
 * Doing it per card (in the mount effect, and again from an `animationstart` listener for each animation) forced
 * a style recalculation and a walk of the card's subtree for every card mounted: 600 ms of a 1,000-card load.
 * Cards and the listener queue here instead and one flush a frame pins every pulse with a single
 * `document.getAnimations()`.
 */
const PULSES = new Set(["cc-prompt", "cc-accept", "cc-glow"]);

let frame = 0;

function flush() {
  frame = 0;
  for (const animation of document.getAnimations()) {
    const name = (animation as CSSAnimation).animationName;
    if (name && PULSES.has(name) && animation.startTime !== 0) animation.startTime = 0;
  }
}

/** Pins the pulses on the page to the shared phase, in the next frame. */
export function queuePhaseSync(): void {
  if (!frame && typeof document !== "undefined") frame = requestAnimationFrame(flush);
}

/** The card's own call: its root is not needed, every pulse is pinned together. */
export function syncPromptPhase(): void {
  queuePhaseSync();
}
