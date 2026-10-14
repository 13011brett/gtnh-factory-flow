"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { getUiScale } from "@/lib/ui-scale";
import { isWiringConnection } from "../../connection-drag";
import { createRestTracker, handFull, onHandChange, TIP_WAIT_MS } from "./rest-tracker";
import { readTip, type TipSpec } from "./tip-spec";
import { TipPanel } from "./TipPanel";

/**
 * One tooltip for the whole board (the mod's `Tip` plus `Tip.Wait`). Controls
 * carry `data-tip-id` and `data-tip` (see `tipAttrs`); this host listens on the
 * document, waits until the pointer has rested on the same thing for 0.8 s and
 * draws it in a portal. Moving about on the thing keeps the wait, moving to
 * another thing or off everything resets it, and nothing shows while something
 * is in hand, a button is down, a menu is open or text is being typed.
 */

interface Shown {
  spec: TipSpec;
  /** Real (unzoomed) pointer position. */
  x: number;
  y: number;
}

let shown: Shown | null = null;
const subscribers = new Set<() => void>();
const tracker = createRestTracker(TIP_WAIT_MS);
let timer: ReturnType<typeof setTimeout> | undefined;
let lastX = 0;
let lastY = 0;
let buttonsDown = false;
let installed = false;

function publish(next: Shown | null): void {
  shown = next;
  for (const subscriber of subscribers) subscriber();
}

function hide(): void {
  if (shown) publish(null);
}

function clearTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function now(): number {
  return performance.now();
}

/** Why a tip may not show right now, if it may not. Pure of the pointer: the gates the spec lists (10.1). */
export function tipBlocked(target: Element | null | undefined): boolean {
  if (handFull() || isWiringConnection() || buttonsDown) return true;
  if (typeof document === "undefined") return true;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || (active as HTMLElement).isContentEditable)) {
    return true;
  }
  // A menu or popup explains only itself.
  if (document.querySelector('[role="menu"]') && !target?.closest('[role="menu"]')) return true;
  return false;
}

function targetAt(x: number, y: number): Element | null {
  const under = document.elementFromPoint?.(x, y) ?? null;
  return under?.closest("[data-tip-id]") ?? null;
}

function fire(): void {
  timer = undefined;
  if (!tracker.ready(now())) {
    schedule();
    return;
  }
  const element = targetAt(lastX, lastY);
  if (!element || element.getAttribute("data-tip-id") !== tracker.target() || tipBlocked(element)) return;
  const spec = readTip(element);
  if (spec) publish({ spec, x: lastX, y: lastY });
}

function schedule(): void {
  clearTimer();
  const wait = tracker.remaining(now());
  if (Number.isFinite(wait)) timer = setTimeout(fire, Math.max(0, wait) + 1);
}

function onMove(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  lastX = event.clientX;
  lastY = event.clientY;
  buttonsDown = event.buttons !== 0;
  const element = (event.target as Element | null)?.closest?.("[data-tip-id]") ?? null;
  const id = element?.getAttribute("data-tip-id") ?? undefined;
  const before = tracker.target();
  tracker.point(id, now());
  if (buttonsDown || !id || handFull() || isWiringConnection()) {
    clearTimer();
    hide();
    if (buttonsDown) tracker.restart(now());
    return;
  }
  if (shown) {
    if (shown.spec.id === id) {
      publish({ ...shown, x: lastX, y: lastY });
      return;
    }
    hide();
  }
  if (id !== before || timer === undefined) schedule();
}

function onDown(): void {
  buttonsDown = true;
  clearTimer();
  hide();
  tracker.restart(now());
}

function onUp(event: PointerEvent): void {
  buttonsDown = false;
  tracker.restart(now());
  onMove(event);
}

function reset(): void {
  clearTimer();
  hide();
  tracker.point(undefined, now());
}

function PanelView() {
  const state = useSyncExternalStore(
    (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    () => shown,
    () => null,
  );
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!state || !element) return;
    // The panel is a body portal wearing .ui-zoom: its box is in shell pixels, the pointer in real ones.
    const scale = getUiScale();
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    const vw = window.innerWidth / scale;
    const vh = window.innerHeight / scale;
    let x = state.x / scale + 12;
    if (x + w > vw - 4) x = state.x / scale - 12 - w;
    let y = state.y / scale + 12;
    if (y + h > vh - 4) y = state.y / scale - 12 - h;
    element.style.left = `${Math.max(4, x)}px`;
    element.style.top = `${Math.max(4, y)}px`;
    element.style.visibility = "visible";
  });
  if (!state) return null;
  return <TipPanel ref={ref} spec={state.spec} style={{ left: 0, top: 0, visibility: "hidden" }} />;
}

/** Installs the one tooltip host. Idempotent; the first clean card calls it. */
export function ensureTipHost(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const mount = document.createElement("div");
  mount.setAttribute("data-clean-tip-host", "");
  document.body.appendChild(mount);
  createRoot(mount).render(<PanelView />);
  const capture = { capture: true, passive: true } as const;
  document.addEventListener("pointermove", onMove, capture);
  document.addEventListener("pointerdown", onDown, capture);
  document.addEventListener("pointerup", onUp, capture);
  document.addEventListener("pointercancel", reset, capture);
  document.addEventListener("wheel", reset, capture);
  document.addEventListener("contextmenu", reset, capture);
  document.addEventListener("keydown", reset, capture);
  document.documentElement.addEventListener("pointerleave", reset);
  window.addEventListener("blur", reset);
  onHandChange(reset);
}
