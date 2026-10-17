"use client";

import { useSyncExternalStore } from "react";

/**
 * The planner's device settings: the mod's settings box, kept in this browser
 * (never in a plan, never synced). Read through `useDeviceSettings`, written
 * through `writeDeviceSettings`; storage that is blocked costs the reload its
 * values, nothing more.
 *
 */
export interface DeviceSettings {
  /** "Names when zoomed out": the glance cards carry their names. */
  zoomedOutNames: boolean;
  /** The settings box's open section, kept so it opens where it was left. */
  settingsSection: string;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  zoomedOutNames: true,
  settingsSection: "Board",
};

const STORAGE_KEY = "gtnh-factory-flow.device-settings.v1";

let state: DeviceSettings = DEFAULT_DEVICE_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

/** An absent key falls back to its default; only an explicit false means off. */
export function parseDeviceSettings(raw: string | null): DeviceSettings {
  if (!raw) return DEFAULT_DEVICE_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof DeviceSettings, unknown>>;
    return {
      zoomedOutNames:
        typeof parsed.zoomedOutNames === "boolean"
          ? parsed.zoomedOutNames
          : DEFAULT_DEVICE_SETTINGS.zoomedOutNames,
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
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Blocked storage: the setting holds until the page closes.
  }
  for (const listener of listeners) listener();
}

/** Test seam: forget what was read so the next read starts from storage. */
export function resetDeviceSettingsForTests(): void {
  state = DEFAULT_DEVICE_SETTINGS;
  loaded = false;
  for (const listener of listeners) listener();
}
