/**
 * The tour's hands: real DOM events dispatched at the real elements, the way a person's mouse and keyboard
 * produce them, so the planner reacts exactly as it does to a player (React's handlers, React Flow's drag, the
 * board's key handlers). Nothing here moves the player's own mouse. Events are `isTrusted: false`, which is also
 * how the tour's key handler tells them from the player's.
 */

export interface Mods {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/** The tour's own layers (shield, cursor, note): never what a press lands on. */
const TOUR_SELECTOR = "[data-tour]";

export function hitTest(x: number, y: number): Element | null {
  if (typeof document === "undefined") return null;
  for (const el of document.elementsFromPoint(x, y)) {
    if (!el.closest(TOUR_SELECTOR)) return el;
  }
  return null;
}

type Pt = { x: number; y: number };

function init(p: Pt, button: number, buttons: number, mods: Mods | undefined, extra?: object) {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: p.x,
    clientY: p.y,
    screenX: p.x + (window.screenX || 0),
    screenY: p.y + (window.screenY || 0),
    button,
    buttons,
    shiftKey: Boolean(mods?.shift),
    ctrlKey: Boolean(mods?.ctrl),
    altKey: Boolean(mods?.alt),
    ...extra,
  };
}

function pointer(type: string, target: Element, p: Pt, button: number, buttons: number, mods?: Mods) {
  const event = new PointerEvent(
    type,
    init(p, button, buttons, mods, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: buttons ? 0.5 : 0,
    }),
  );
  target.dispatchEvent(event);
}

function mouse(type: string, target: Element, p: Pt, button: number, buttons: number, mods?: Mods, detail = 0) {
  target.dispatchEvent(new MouseEvent(type, init(p, button, buttons, mods, { detail })));
}

let hovered: Element | null = null;
let pressed: { el: Element; button: number } | null = null;
let buttonsDown = 0;

/** Moves the (virtual) pointer over what is at the point: leave, enter and move events, as a mouse makes them. */
export function moveTo(p: Pt, mods?: Mods): Element | null {
  const el = hitTest(p.x, p.y);
  if (!el) return null;
  if (el !== hovered) {
    if (hovered && hovered.isConnected) {
      pointer("pointerout", hovered, p, 0, buttonsDown, mods);
      mouse("mouseout", hovered, p, 0, buttonsDown, mods);
      // enter/leave do not bubble; React derives them from over/out, but plain listeners want them too.
      pointer("pointerleave", hovered, p, 0, buttonsDown, mods);
      mouse("mouseleave", hovered, p, 0, buttonsDown, mods);
    }
    pointer("pointerover", el, p, 0, buttonsDown, mods);
    mouse("mouseover", el, p, 0, buttonsDown, mods);
    pointer("pointerenter", el, p, 0, buttonsDown, mods);
    mouse("mouseenter", el, p, 0, buttonsDown, mods);
    hovered = el;
  }
  pointer("pointermove", el, p, 0, buttonsDown, mods);
  mouse("mousemove", el, p, 0, buttonsDown, mods);
  return el;
}

const FOCUSABLE = "input, textarea, select, button, a[href], [tabindex], [contenteditable='true']";

export function press(p: Pt, button = 0, mods?: Mods): Element | null {
  const el = moveTo(p, mods);
  if (!el) return null;
  const bit = button === 0 ? 1 : button === 2 ? 2 : 4;
  buttonsDown |= bit;
  pointer("pointerdown", el, p, button, buttonsDown, mods);
  mouse("mousedown", el, p, button, buttonsDown, mods, 1);
  const focusable = el.closest<HTMLElement>(FOCUSABLE);
  if (focusable) focusable.focus({ preventScroll: true });
  else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  pressed = { el, button };
  return el;
}

export function release(p: Pt, button = 0, mods?: Mods, click = true): Element | null {
  const el = hitTest(p.x, p.y) ?? pressed?.el ?? null;
  if (!el) return null;
  const bit = button === 0 ? 1 : button === 2 ? 2 : 4;
  buttonsDown &= ~bit;
  pointer("pointerup", el, p, button, buttonsDown, mods);
  mouse("mouseup", el, p, button, buttonsDown, mods, 1);
  const down = pressed;
  pressed = null;
  if (click && down && down.button === button) {
    // A click lands on the nearest element that holds both ends of the press.
    let target: Element | null = el;
    while (target && !target.contains(down.el)) target = target.parentElement;
    if (target) {
      if (button === 0) mouse("click", target, p, 0, 0, mods, 1);
      else if (button === 1) mouse("auxclick", target, p, 1, 0, mods, 1);
      else mouse("contextmenu", target, p, 2, 0, mods, 0);
    }
  }
  return el;
}

export function click(p: Pt, button = 0, mods?: Mods): Element | null {
  const el = press(p, button, mods);
  if (!el) return null;
  release(p, button, mods);
  return el;
}

export function doubleClick(p: Pt, mods?: Mods): Element | null {
  const first = click(p, 0, mods);
  const el = press(p, 0, mods);
  if (!el) return first;
  mouse("mouseup", el, p, 0, 0, mods, 2);
  mouse("click", el, p, 0, 0, mods, 2);
  mouse("dblclick", el, p, 0, 0, mods, 2);
  pressed = null;
  buttonsDown = 0;
  return el;
}

/** The wheel over a point (the board's camera, a number box). */
export function wheel(p: Pt, deltaY: number, mods?: Mods, deltaX = 0): Element | null {
  const el = moveTo(p, mods);
  if (!el) return null;
  el.dispatchEvent(new WheelEvent("wheel", { ...init(p, 0, 0, mods), deltaY, deltaX, deltaMode: 0 }));
  return el;
}

function keyInit(key: string, mods?: Mods) {
  const code = key.length === 1 ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : /\d/.test(key) ? `Digit${key}` : "") : key;
  return {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    shiftKey: Boolean(mods?.shift),
    ctrlKey: Boolean(mods?.ctrl),
    altKey: Boolean(mods?.alt),
  };
}

function keyTarget(): Element {
  return document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
}

export function keyDown(key: string, mods?: Mods): void {
  keyTarget().dispatchEvent(new KeyboardEvent("keydown", keyInit(key, mods)));
}

export function keyUp(key: string, mods?: Mods): void {
  keyTarget().dispatchEvent(new KeyboardEvent("keyup", keyInit(key, mods)));
}

/** One key pressed and let go. */
export function pressKey(key: string, mods?: Mods): void {
  keyDown(key, mods);
  keyUp(key, mods);
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/**
 * One typed character into the focused text box (or the given one): key down, the value changed the way the browser
 * changes it (so React's onChange fires), key up.
 */
export function typeChar(char: string, into?: HTMLInputElement | HTMLTextAreaElement): void {
  const el =
    into ??
    (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      ? document.activeElement
      : null);
  if (!el) {
    pressKey(char);
    return;
  }
  el.dispatchEvent(new KeyboardEvent("keydown", keyInit(char)));
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + char + el.value.slice(end);
  setNativeValue(el, next);
  try {
    el.setSelectionRange(start + 1, start + 1);
  } catch {
    // number inputs have no selection
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
  el.dispatchEvent(new KeyboardEvent("keyup", keyInit(char)));
}

/** Clears the box, as select-all then delete does. */
export function clearText(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.focus({ preventScroll: true });
  if (!el.value) return;
  setNativeValue(el, "");
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
}

/**
 * A drag of an element that uses the browser's own drag and drop (the items column's tiles): dragstart, enter and over
 * on the way, drop and dragend, with one DataTransfer carried through, as a drag makes them.
 */
export function dragDrop(source: Element, from: Pt, to: Pt, steps: Pt[] = []): Element | null {
  const data = new DataTransfer();
  const fire = (type: string, target: Element, p: Pt) => {
    target.dispatchEvent(
      new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, dataTransfer: data }),
    );
  };
  fire("dragstart", source, from);
  let over: Element | null = null;
  for (const p of [...steps, to]) {
    const el = hitTest(p.x, p.y);
    if (!el) continue;
    if (el !== over) {
      fire("dragenter", el, p);
      over = el;
    }
    fire("dragover", el, p);
  }
  const drop = hitTest(to.x, to.y);
  if (drop) fire("drop", drop, to);
  fire("dragend", source, to);
  return drop;
}

/** Forgets what the pointer was over (a step jump or a new screen). */
export function resetPointerState(): void {
  hovered = null;
  pressed = null;
  buttonsDown = 0;
}
