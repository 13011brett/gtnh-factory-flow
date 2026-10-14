"use client";

import { useSyncExternalStore } from "react";
import { COMPACT_MAX_HEIGHT, COMPACT_MAX_WIDTH } from "@/lib/viewport-breakpoints";
import { Cursor, draws } from "./cursor";
import { Director, tourWarnings, type NoteSpec } from "./director";
import { resetPointerState } from "./input";
import { enterSandbox, leaveSandbox } from "./sandbox";
import { STEPS } from "./script";
import { getTour, markTourOffered, resetTour, setTour } from "./tour-store";

/**
 * The tour's one running instance: the sandbox, the cursor, the director. `startTour` is what the ? key's
 * "Take the tour" and the first-run offer call; `TourHost` provides the layer the cursor draws into.
 */

let layer: HTMLElement | undefined;
let cursor: Cursor | undefined;
let director: Director | undefined;
let note: NoteSpec | null = null;
let starting = false;
const noteListeners = new Set<() => void>();

function setNote(next: NoteSpec | null) {
  note = next;
  for (const l of noteListeners) l();
}

export function useTourNote(): NoteSpec | null {
  return useSyncExternalStore(
    (l) => {
      noteListeners.add(l);
      return () => noteListeners.delete(l);
    },
    () => note,
    () => null,
  );
}

export function attachTourLayer(el: HTMLElement | undefined): void {
  layer = el;
}

export function getTourCursor(): Cursor | undefined {
  return cursor;
}

/** Whether the planner can be toured right now (the host is mounted). */
export function tourAvailable(): boolean {
  // The tour drives the full layout (the overview beside the board, the items column); compact boards have neither.
  return layer !== undefined && window.innerWidth > COMPACT_MAX_WIDTH && window.innerHeight > COMPACT_MAX_HEIGHT;
}

export async function startTour(step = 0): Promise<void> {
  if (starting || getTour().phase !== "idle" || !tourAvailable()) return;
  starting = true;
  markTourOffered();
  try {
    setTour({ phase: "playing", index: 0, total: STEPS.length, noteReady: false });
    await enterSandbox();
    cursor = new Cursor(layer!);
    director = new Director(STEPS, cursor, {
      onNote: setNote,
      onLeave: () => void leaveTour(),
    });
    await draws(3);
    if (step > 0) await director.jump(step);
    else await director.play(0);
  } catch (error) {
    console.error("[tour] could not start", error);
    await leaveTour();
  } finally {
    starting = false;
  }
}

export async function leaveTour(): Promise<void> {
  const d = director;
  if (!d && getTour().phase === "idle") return;
  d?.stop();
  director = undefined;
  cursor?.destroy();
  cursor = undefined;
  setNote(null);
  resetPointerState();
  resetTour();
  await leaveSandbox();
}

export function tourNext(): void {
  void director?.next();
}

export function tourBack(): void {
  void director?.back();
}

export function tourHurry(): void {
  director?.hurry();
}

export async function tourJump(step: number): Promise<void> {
  if (getTour().phase === "idle") await startTour(step);
  else await director?.jump(step);
}

/** For the dev harness and tests: where the tour is, and what it warned about. */
export function tourStatus(): { phase: string; index: number; total: number; warnings: readonly string[] } {
  const t = getTour();
  return { phase: t.phase, index: t.index, total: t.total, warnings: tourWarnings() };
}
