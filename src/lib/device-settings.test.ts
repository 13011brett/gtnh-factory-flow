import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_SETTINGS, parseDeviceSettings } from "./device-settings";

describe("device settings", () => {
  it("starts at the mod's defaults: names on, circuit off, Board section", () => {
    expect(DEFAULT_DEVICE_SETTINGS).toEqual({
      zoomedOutNames: true,
      circuitAsInput: false,
      settingsSection: "Board",
    });
    expect(parseDeviceSettings(null)).toBe(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings("not json")).toBe(DEFAULT_DEVICE_SETTINGS);
  });

  it("keeps a saved value, and an absent key falls back to its default", () => {
    const read = parseDeviceSettings(JSON.stringify({ zoomedOutNames: false }));
    expect(read.zoomedOutNames).toBe(false);
    expect(read.circuitAsInput).toBe(false);
    expect(read.settingsSection).toBe("Board");
    // Only an explicit false means off: a missing names key is on.
    expect(parseDeviceSettings("{}").zoomedOutNames).toBe(true);
  });

  it("ignores values of the wrong kind", () => {
    const read = parseDeviceSettings(JSON.stringify({ circuitAsInput: "yes", settingsSection: 4 }));
    expect(read).toEqual(DEFAULT_DEVICE_SETTINGS);
  });
});
