import { describe, expect, it } from "vitest";
import {
  clampSeeThrough,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_SEE_THROUGH,
  parseDeviceSettings,
} from "./device-settings";

describe("device settings", () => {
  it("starts at the mod's defaults: see-through 30%, names on, circuit off, Board section", () => {
    expect(DEFAULT_DEVICE_SETTINGS).toEqual({
      boardSeeThrough: 30,
      zoomedOutNames: true,
      circuitAsInput: false,
      settingsSection: "Board",
    });
    expect(parseDeviceSettings(null)).toBe(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings("not json")).toBe(DEFAULT_DEVICE_SETTINGS);
  });

  it("keeps a saved value, and an absent key falls back to its default", () => {
    const read = parseDeviceSettings(JSON.stringify({ boardSeeThrough: 55, zoomedOutNames: false }));
    expect(read.boardSeeThrough).toBe(55);
    expect(read.zoomedOutNames).toBe(false);
    expect(read.circuitAsInput).toBe(false);
    expect(read.settingsSection).toBe("Board");
    // Only an explicit false means off: a missing names key is on.
    expect(parseDeviceSettings("{}").zoomedOutNames).toBe(true);
  });

  it("clamps and steps See-through by five, 0 to 100", () => {
    expect(clampSeeThrough(-20)).toBe(0);
    expect(clampSeeThrough(130)).toBe(100);
    expect(clampSeeThrough(32)).toBe(30);
    expect(clampSeeThrough(33)).toBe(35);
    expect(clampSeeThrough(Number.NaN)).toBe(DEFAULT_SEE_THROUGH);
    expect(parseDeviceSettings(JSON.stringify({ boardSeeThrough: 999 })).boardSeeThrough).toBe(100);
  });

  it("ignores values of the wrong kind", () => {
    const read = parseDeviceSettings(JSON.stringify({ boardSeeThrough: "high", circuitAsInput: "yes", settingsSection: 4 }));
    expect(read).toEqual(DEFAULT_DEVICE_SETTINGS);
  });
});
