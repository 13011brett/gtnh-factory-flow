"use client";

import { useSyncExternalStore } from "react";

/**
 * The minimap's settings, the mod's: show, size, shape, corner, zoom (fitted to the whole plan unless set by
 * hand), and whether it follows the card you select. No see-through of its own: the map is see-through enough
 * (the owner, 2026-10-14). Kept in the browser under `boardMinimap`; the gear on the map and the settings dialog's
 * rows both write through `setMinimap`.
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
  /** Index into `MINIMAP_ZOOMS`, used once the zoom is set by hand. */
  zoom: number;
  /** The whole plan fitted in the map (the default); a hand zoom (wheel, [ ], the slider) turns it off. */
  fit: boolean;
  /** Centre on the selected card when there is one (the mod's "Centre on the machine you look at"). */
  follow: boolean;
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
  size: "small",
  shape: "square",
  corner: "bottom-right",
  zoom: 2,
  fit: true,
  follow: false,
};

const SIZES = Object.keys(MINIMAP_SIZES) as MinimapSize[];
const CORNERS = Object.keys(MINIMAP_CORNER_LABELS) as MinimapCorner[];

/** Anything stored, as settings: bad or missing parts fall back to the defaults. */
export function normalizeMinimap(raw: unknown): MinimapSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MINIMAP;
  const zoom = typeof r.zoom === "number" && Number.isFinite(r.zoom) ? Math.round(r.zoom) : d.zoom;
  return {
    show: typeof r.show === "boolean" ? r.show : d.show,
    size: SIZES.includes(r.size as MinimapSize) ? (r.size as MinimapSize) : d.size,
    shape: r.shape === "circle" ? "circle" : "square",
    corner: CORNERS.includes(r.corner as MinimapCorner) ? (r.corner as MinimapCorner) : d.corner,
    zoom: Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, zoom)),
    fit: typeof r.fit === "boolean" ? r.fit : d.fit,
    follow: typeof r.follow === "boolean" ? r.follow : d.follow,
  };
}

/**
 * Settings saved before the map fitted the plan (no `fit` in them) carry the old default size and a stepped zoom
 * nobody chose: those go back to the new defaults (small, fitted); the rest is kept.
 */
export function upgradeMinimap(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || "fit" in raw) return raw;
  const rest = { ...(raw as Record<string, unknown>) };
  delete rest.size;
  delete rest.zoom;
  delete rest.fade;
  return rest;
}

let current: MinimapSettings | undefined;
const listeners = new Set<() => void>();

function read(): MinimapSettings {
  try {
    const text = window.localStorage.getItem(MINIMAP_KEY);
    return normalizeMinimap(upgradeMinimap(text ? JSON.parse(text) : undefined));
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

/** The zoom the map last drew at while fitted, so a hand zoom steps on from what is on screen. */
let fittedZoom: number | undefined;

export function noteFittedZoom(zoom: number): void {
  fittedZoom = zoom;
}

/** The zoom step nearest a zoom (by ratio). */
export function nearestZoomIndex(zoom: number): number {
  let best = 0;
  MINIMAP_ZOOMS.forEach((z, i) => {
    if (Math.abs(Math.log(z / zoom)) < Math.abs(Math.log(MINIMAP_ZOOMS[best] / zoom))) best = i;
  });
  return best;
}

/** Steps the zoom one notch (the `[` and `]` keys; the wheel over the map), leaving the fitted zoom. */
export function stepMinimapZoom(direction: -1 | 1): void {
  const s = getMinimap();
  const from = s.fit && fittedZoom ? nearestZoomIndex(fittedZoom) : s.zoom;
  setMinimap({ fit: false, zoom: from + direction });
}
