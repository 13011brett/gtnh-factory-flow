"use client";

import { useSyncExternalStore } from "react";

/**
 * The board's See-through setting (the mod's gear slider, shipped here as Paper strength: 0 keeps the paper
 * at full, 100 leaves nothing but the page behind it). Percent, steps of 5, kept in the browser under
 * `boardSeeThrough`; the settings dialog (chrome) writes it through `setSeeThrough`, the controller turns it
 * into `--board-bg-alpha` for the board's paper and dots and the overview rail's fill.
 */

export const SEE_THROUGH_KEY = "boardSeeThrough";
export const SEE_THROUGH_STEP = 5;
/** The mod ships 30. Here the page behind is flat, so the board starts solid and the slider only weakens its paper. */
export const DEFAULT_SEE_THROUGH = 0;
/** The least of its fill the overview keeps when the board is all see-through, so it still reads (the mod's 0.45). */
export const RAIL_FLOOR = 0.45;

const listeners = new Set<() => void>();

export function clampSeeThrough(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SEE_THROUGH;
  return Math.max(0, Math.min(100, Math.round(value / SEE_THROUGH_STEP) * SEE_THROUGH_STEP));
}

export function readSeeThrough(): number {
  try {
    const raw = window.localStorage.getItem(SEE_THROUGH_KEY);
    if (raw === null) return DEFAULT_SEE_THROUGH;
    return clampSeeThrough(Number(raw));
  } catch {
    return DEFAULT_SEE_THROUGH;
  }
}

export function setSeeThrough(percent: number): void {
  const next = clampSeeThrough(percent);
  try {
    window.localStorage.setItem(SEE_THROUGH_KEY, String(next));
  } catch {
    // Private mode: the slider still works until the page closes (see the memo below).
    memo = next;
  }
  memo = next;
  for (const listener of listeners) listener();
}

let memo: number | undefined;

function snapshot(): number {
  if (memo === undefined) memo = readSeeThrough();
  return memo;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SEE_THROUGH_KEY || event.key === null) {
      memo = readSeeThrough();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The setting, in percent. */
export function useSeeThrough(): number {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SEE_THROUGH);
}

/** How solid the board's paper is drawn, 0 to 1 (the mod's `backgroundAlpha`). */
export function backgroundAlpha(percent: number): number {
  return 1 - clampSeeThrough(percent) / 100;
}

/** The overview rail's alpha: never fainter than the floor. */
export function railAlpha(percent: number): number {
  return Math.max(RAIL_FLOOR, backgroundAlpha(percent));
}
