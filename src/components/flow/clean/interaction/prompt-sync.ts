/**
 * Every prompt that pulses ("(set count)", "Set rate", the acceptance glow)
 * shares one phase however late it mounted: when a CSS animation of ours
 * starts, its start time is set to the document timeline's origin, so all
 * copies of it are in step (the mod draws them off one clock).
 */
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
      const target = event.target as Element | null;
      for (const animation of target?.getAnimations?.({ subtree: true }) ?? []) syncAnimation(animation);
    },
    { capture: true, passive: true },
  );
}
