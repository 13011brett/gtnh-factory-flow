import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_SETTINGS, parseDeviceSettings } from "./device-settings";

describe("device settings", () => {
  it("starts at the mod's defaults: names on, problem outlines on, items on the right, Board section", () => {
    expect(DEFAULT_DEVICE_SETTINGS).toEqual({
      zoomedOutNames: true,
      zoomedOutAt: 0.65,
      problemOutlines: true,
      itemsLeft: false,
      settingsSection: "Board",
    });
    expect(parseDeviceSettings(null)).toBe(DEFAULT_DEVICE_SETTINGS);
    expect(parseDeviceSettings("not json")).toBe(DEFAULT_DEVICE_SETTINGS);
  });

  it("keeps a saved value, and an absent key falls back to its default", () => {
    const read = parseDeviceSettings(JSON.stringify({ zoomedOutNames: false }));
    expect(read.zoomedOutNames).toBe(false);
    expect(read.settingsSection).toBe("Board");
    // Only an explicit false means off: a missing names key is on.
    expect(parseDeviceSettings("{}").zoomedOutNames).toBe(true);
    expect(parseDeviceSettings("{}").problemOutlines).toBe(true);
    expect(parseDeviceSettings(JSON.stringify({ problemOutlines: false })).problemOutlines).toBe(
      false,
    );
  });

  it("keeps a zoomed-out zoom inside the slider's range and drops one outside it", () => {
    expect(parseDeviceSettings(JSON.stringify({ zoomedOutAt: 0.9 })).zoomedOutAt).toBe(0.9);
    expect(parseDeviceSettings(JSON.stringify({ zoomedOutAt: 0.35 })).zoomedOutAt).toBe(0.35);
    expect(parseDeviceSettings(JSON.stringify({ zoomedOutAt: 1 })).zoomedOutAt).toBe(1);
    expect(parseDeviceSettings(JSON.stringify({ zoomedOutAt: 0.1 })).zoomedOutAt).toBe(0.65);
    expect(parseDeviceSettings(JSON.stringify({ zoomedOutAt: 3 })).zoomedOutAt).toBe(0.65);
    expect(parseDeviceSettings(JSON.stringify({ zoomedOutAt: "0.9" })).zoomedOutAt).toBe(0.65);
  });

  it("ignores values of the wrong kind", () => {
    const read = parseDeviceSettings(JSON.stringify({ zoomedOutNames: "yes", settingsSection: 4 }));
    expect(read).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it("forgets the old Circuit as an input switch: the circuit is always on the card", () => {
    const read = parseDeviceSettings(
      JSON.stringify({ circuitAsInput: false, zoomedOutNames: false }),
    );
    expect(read).toEqual({
      zoomedOutNames: false,
      zoomedOutAt: 0.65,
      problemOutlines: true,
      itemsLeft: false,
      settingsSection: "Board",
    });
  });
});
