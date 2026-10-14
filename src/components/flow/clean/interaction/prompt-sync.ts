/**
 * Every prompt that pulses ("(set count)", "Set rate", the acceptance glow)
 * shares one phase however late it mounted: when a CSS animation of ours
 * starts, its start time is set to the document timeline's origin, so all
 * copies of it are in step (the mod draws them off one clock).
 */
import { queuePhaseSync } from "../../virtual/prompt-phase";

const PULSES = new Set(["cc-prompt", "cc-accept", "cc-glow"]);

let installed = false;

export function syncAnimation(animation: Animation): void {
  const name = (animation as CSSAnimation).animationName;
  if (name && PULSES.has(name)) animation.startTime = 0;
}

export function installPromptSync(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "animationstart",
    (event) => {
      if (!PULSES.has(event.animationName)) return;
      // One flush a frame for every pulse that started in it, not a style recalculation and a subtree walk each.
      queuePhaseSync();
    },
    { capture: true, passive: true },
  );
}
