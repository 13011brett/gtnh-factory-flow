import { playSfx, sfxClick, sfxSelect } from "./sfx";

/**
 * The sounds of the hand rather than the plan, heard from the page's own events so no control has to remember them:
 *
 * - anything pressed clicks (`Hyb.click`), unless a sound that says more follows within 80 ms (the click gives way,
 *   in `sfx.ts`) or the control plays its own (`data-sfx-own` on it or an ancestor);
 * - a card, drawer or note lifts once a press on it has moved 3 px (the board's click slop) and drops when let go;
 *   a press on one that does not move selects it, the click softer and higher;
 * - a wire leaves its port once the press on the port has moved 3 px;
 * - a wheel step is remembered, so the plan watcher can tick it instead of sounding every step of a spin.
 */

const SLOP = 3;

const PRESSABLE = [
  "button",
  "a[href]",
  "summary",
  "select",
  "input[type=checkbox]",
  "input[type=radio]",
  "[role=button]",
  "[role=menuitem]",
  "[role=menuitemradio]",
  "[role=menuitemcheckbox]",
  "[role=tab]",
  "[role=option]",
  "[role=radio]",
  "[role=switch]",
  "[role=checkbox]",
].join(",");

const TEXT = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]), textarea, [contenteditable=''], [contenteditable=true]";

function isOff(element: Element): boolean {
  return (
    (element as HTMLButtonElement).disabled === true ||
    element.getAttribute("aria-disabled") === "true" ||
    element.hasAttribute("data-off")
  );
}

/** The control a press landed on, if it is one: a pressable element, or anything drawn with a pointer cursor. */
export function pressedControl(target: Element): Element | undefined {
  const pressable = target.closest(PRESSABLE);
  if (pressable) return isOff(pressable) ? undefined : pressable;
  let element: Element | null = target;
  for (let depth = 0; element && depth < 6; depth++, element = element.parentElement) {
    if (element.classList.contains("react-flow__node") || element.classList.contains("react-flow__pane")) return undefined;
    if (getComputedStyle(element).cursor === "pointer") return isOff(element) ? undefined : element;
  }
  return undefined;
}

interface Press {
  x: number;
  y: number;
  kind: "card" | "wire";
  target: Element;
  moved: boolean;
}

let lastWheel: { at: number; up: boolean } | undefined;

/** The last wheel step (when, and whether it turned up), for the plan watcher. */
export function lastWheelStep(): { at: number; up: boolean } | undefined {
  return lastWheel;
}

export function installBoardGestureSounds(): () => void {
  if (typeof window === "undefined") return () => {};
  let press: Press | undefined;
  let movedAt = -1;

  const onPointerDown = (event: PointerEvent) => {
    press = undefined;
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const target = event.target;
    if (target.closest(".react-flow__handle.connectablestart")) {
      press = { x: event.clientX, y: event.clientY, kind: "wire", target, moved: false };
      return;
    }
    if (!target.closest(".react-flow__node.draggable") || target.closest(TEXT) || target.closest(".nodrag")) return;
    press = { x: event.clientX, y: event.clientY, kind: "card", target, moved: false };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!press || press.moved) return;
    if (Math.max(Math.abs(event.clientX - press.x), Math.abs(event.clientY - press.y)) < SLOP) return;
    press.moved = true;
    movedAt = performance.now();
    playSfx(press.kind === "wire" ? "wire.grab" : "board.lift");
  };

  const onPointerUp = () => {
    const done = press;
    press = undefined;
    if (!done || done.kind !== "card") return;
    if (done.moved) {
      movedAt = performance.now();
      playSfx("board.drop");
    } else if (!pressedControl(done.target)) {
      sfxSelect();
    }
  };

  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    // The click that ends a drag is not a press.
    if (movedAt >= 0 && performance.now() - movedAt < 400) return;
    if (event.target.closest("[data-sfx-own]")) return;
    if (pressedControl(event.target) || event.target.closest(".react-flow__handle")) sfxClick();
  };

  const onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return;
    lastWheel = { at: performance.now(), up: event.deltaY < 0 };
  };

  const capture = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", onPointerDown, capture);
  window.addEventListener("pointermove", onPointerMove, capture);
  window.addEventListener("pointerup", onPointerUp, capture);
  window.addEventListener("pointercancel", onPointerUp, capture);
  window.addEventListener("click", onClick, capture);
  window.addEventListener("wheel", onWheel, capture);
  return () => {
    window.removeEventListener("pointerdown", onPointerDown, capture);
    window.removeEventListener("pointermove", onPointerMove, capture);
    window.removeEventListener("pointerup", onPointerUp, capture);
    window.removeEventListener("pointercancel", onPointerUp, capture);
    window.removeEventListener("click", onClick, capture);
    window.removeEventListener("wheel", onWheel, capture);
  };
}
