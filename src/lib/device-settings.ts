"use client";

import { useSyncExternalStore } from "react";

/**
 * The planner's device settings: the mod's settings box, kept in this browser
 * (never in a plan, never synced). Read through `useDeviceSettings`, written
 * through `writeDeviceSettings`; storage that is blocked costs the reload its
 * values, nothing more.
 *
 * `boardSeeThrough` is the gear's See-through slider, 0 to 100 in steps of 5
 * (the mod's `board.seeThrough`, default 30): the board's dots, the overview
 * and the grid fade down to nothing while cards and text stay solid. The
 * setting is stored here; whatever draws the effect reads this key.
 */
export interface DeviceSettings {
  /** The gear's See-through slider, percent, steps of 5. */
  boardSeeThrough: number;
  /** "Names when zoomed out": the glance cards carry their names. */
  zoomedOutNames: boolean;
  /** "Circuit as an input": a programmed circuit counts as an input of its card. */
  circuitAsInput: boolean;
  /** The settings box's open section, kept so it opens where it was left. */
  settingsSection: string;
}

export const SEE_THROUGH_STEP = 5;
export const DEFAULT_SEE_THROUGH = 30;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  boardSeeThrough: DEFAULT_SEE_THROUGH,
  zoomedOutNames: true,
  circuitAsInput: false,
  settingsSection: "Board",
};

const STORAGE_KEY = "gtnh-factory-flow.device-settings.v1";

let state: DeviceSettings = DEFAULT_DEVICE_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

export function clampSeeThrough(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SEE_THROUGH;
  return Math.max(0, Math.min(100, Math.round(value / SEE_THROUGH_STEP) * SEE_THROUGH_STEP));
}

/** An absent key falls back to its default; only an explicit false means off. */
export function parseDeviceSettings(raw: string | null): DeviceSettings {
  if (!raw) return DEFAULT_DEVICE_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof DeviceSettings, unknown>>;
    return {
      boardSeeThrough:
        typeof parsed.boardSeeThrough === "number"
          ? clampSeeThrough(parsed.boardSeeThrough)
          : DEFAULT_DEVICE_SETTINGS.boardSeeThrough,
      zoomedOutNames:
        typeof parsed.zoomedOutNames === "boolean"
          ? parsed.zoomedOutNames
          : DEFAULT_DEVICE_SETTINGS.zoomedOutNames,
      circuitAsInput:
        typeof parsed.circuitAsInput === "boolean"
          ? parsed.circuitAsInput
          : DEFAULT_DEVICE_SETTINGS.circuitAsInput,
      settingsSection:
        typeof parsed.settingsSection === "string"
          ? parsed.settingsSection
          : DEFAULT_DEVICE_SETTINGS.settingsSection,
    };
  } catch {
    return DEFAULT_DEVICE_SETTINGS;
  }
}

function getSnapshot(): DeviceSettings {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      state = parseDeviceSettings(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      state = DEFAULT_DEVICE_SETTINGS;
    }
  }
  return state;
}

function getServerSnapshot(): DeviceSettings {
  return DEFAULT_DEVICE_SETTINGS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeviceSettings(): DeviceSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function readDeviceSettings(): DeviceSettings {
  return getSnapshot();
}

export function writeDeviceSettings(patch: Partial<DeviceSettings>): void {
  const next = { ...getSnapshot(), ...patch };
  next.boardSeeThrough = clampSeeThrough(next.boardSeeThrough);
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Blocked storage: the setting holds until the page closes.
  }
  // The see-through value is also a CSS variable, so styles can read it
  // without a hook (0 = solid board, 1 = nothing of the board's backdrop).
  try {
    document.documentElement.style.setProperty("--board-see-through", String(state.boardSeeThrough / 100));
  } catch {
    // No document (tests): nothing to stamp.
  }
  for (const listener of listeners) listener();
}

/** Test seam: forget what was read so the next read starts from storage. */
export function resetDeviceSettingsForTests(): void {
  state = DEFAULT_DEVICE_SETTINGS;
  loaded = false;
  for (const listener of listeners) listener();
}
