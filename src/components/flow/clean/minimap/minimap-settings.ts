"use client";

import { useSyncExternalStore } from "react";

/**
 * The minimap's settings, the mod's: show, size, shape, corner, zoom, whether it follows the card you
 * point at, and its own fade. Kept in the browser under `boardMinimap`; the gear on the map and the settings
 * dialog's rows both write through `setMinimap`.
 */

export const MINIMAP_KEY = "boardMinimap";

export type MinimapSize = "small" | "medium" | "large" | "huge";
export type MinimapShape = "square" | "circle";
export type MinimapCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface MinimapSettings {
  show: boolean;
  size: MinimapSize;
  shape: MinimapShape;
  corner: MinimapCorner;
  /** Index into `MINIMAP_ZOOMS`. */
  zoom: number;
  /** Centre on the selected card when there is one (the mod's "Centre on the machine you look at"). */
  follow: boolean;
  /** 0 to 80 in steps of 10. */
  fade: number;
}

/** The mod's 110/160/220/300 GUI px, x1.19 for the page. */
export const MINIMAP_SIZES: Record<MinimapSize, number> = { small: 130, medium: 190, large: 260, huge: 355 };
export const MINIMAP_SIZE_LABELS: Record<MinimapSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  huge: "Huge",
};
export const MINIMAP_CORNER_LABELS: Record<MinimapCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
/** Map pixels per board pixel, the mod's ten steps. */
export const MINIMAP_ZOOMS = [0.04, 0.06, 0.09, 0.13, 0.18, 0.25, 0.35, 0.5, 0.71, 1] as const;
export const DEFAULT_MINIMAP: MinimapSettings = {
  show: true,
  size: "medium",
  shape: "square",
  corner: "bottom-right",
  zoom: 2,
  follow: false,
  fade: 0,
};
export const MINIMAP_FADE_MAX = 80;
export const MINIMAP_FADE_STEP = 10;

const SIZES = Object.keys(MINIMAP_SIZES) as MinimapSize[];
const CORNERS = Object.keys(MINIMAP_CORNER_LABELS) as MinimapCorner[];

/** Anything stored, as settings: bad or missing parts fall back to the defaults. */
export function normalizeMinimap(raw: unknown): MinimapSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MINIMAP;
  const fade = typeof r.fade === "number" && Number.isFinite(r.fade) ? r.fade : d.fade;
  const zoom = typeof r.zoom === "number" && Number.isFinite(r.zoom) ? Math.round(r.zoom) : d.zoom;
  return {
    show: typeof r.show === "boolean" ? r.show : d.show,
    size: SIZES.includes(r.size as MinimapSize) ? (r.size as MinimapSize) : d.size,
    shape: r.shape === "circle" ? "circle" : "square",
    corner: CORNERS.includes(r.corner as MinimapCorner) ? (r.corner as MinimapCorner) : d.corner,
    zoom: Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, zoom)),
    follow: typeof r.follow === "boolean" ? r.follow : d.follow,
    fade: Math.max(0, Math.min(MINIMAP_FADE_MAX, Math.round(fade / MINIMAP_FADE_STEP) * MINIMAP_FADE_STEP)),
  };
}

let current: MinimapSettings | undefined;
const listeners = new Set<() => void>();

function read(): MinimapSettings {
  try {
    const text = window.localStorage.getItem(MINIMAP_KEY);
    return normalizeMinimap(text ? JSON.parse(text) : undefined);
  } catch {
    return DEFAULT_MINIMAP;
  }
}

export function getMinimap(): MinimapSettings {
  return (current ??= read());
}

export function setMinimap(patch: Partial<MinimapSettings>): void {
  const next = normalizeMinimap({ ...getMinimap(), ...patch });
  if (JSON.stringify(next) === JSON.stringify(getMinimap())) return;
  current = next;
  try {
    window.localStorage.setItem(MINIMAP_KEY, JSON.stringify(next));
  } catch {
    // Without storage the map still follows the setting until the page closes.
  }
  for (const listener of listeners) listener();
}

/** A copy of the current settings, to put back later (the tour borrows them). */
export function snapshotMinimap(): MinimapSettings {
  return { ...getMinimap() };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === MINIMAP_KEY || event.key === null) {
      current = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMinimapSettings(): MinimapSettings {
  return useSyncExternalStore(subscribe, getMinimap, () => DEFAULT_MINIMAP);
}

/** Steps the zoom one notch (the `[` and `]` keys; the wheel over the map). */
export function stepMinimapZoom(direction: -1 | 1): void {
  setMinimap({ zoom: getMinimap().zoom + direction });
}
