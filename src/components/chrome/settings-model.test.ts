import { describe, expect, it } from "vitest";
import {
  SIZE_NAMES,
  sizeIndexOf,
  sizePercentOf,
  soundIndexOf,
  SOUND_NAMES,
  SOUND_VOLUME,
  ZOOMED_OUT_NAMES,
  ZOOMED_OUT_STEPS,
  zoomedOutIndexOf,
} from "./settings-model";

describe("the settings box's choices", () => {
  it("names the sizes and sounds as the mod does", () => {
    expect([...SIZE_NAMES]).toEqual(["Tiny", "Small", "Normal", "Large"]);
    expect([...SOUND_NAMES]).toEqual(["Off", "Quiet", "Normal", "Loud"]);
  });

  it("Normal is the interface's own 100%, and a custom size matches none", () => {
    expect(sizePercentOf(2)).toBe(100);
    expect(sizeIndexOf(100)).toBe(2);
    expect(sizeIndexOf(70)).toBe(0);
    expect(sizeIndexOf(130)).toBe(3);
    expect(sizeIndexOf(110)).toBe(-1);
  });

  it("the zoomed-out view starts anywhere from 35% to 100% of a 1:1 zoom, in steps of 5", () => {
    expect(ZOOMED_OUT_NAMES[0]).toBe("35%");
    expect(ZOOMED_OUT_NAMES.at(-1)).toBe("100%");
    expect(ZOOMED_OUT_STEPS).toHaveLength(14);
    expect(ZOOMED_OUT_STEPS[zoomedOutIndexOf(0.65)]).toBe(0.65);
    expect(ZOOMED_OUT_NAMES[zoomedOutIndexOf(0.65)]).toBe("65%");
    // A saved zoom between stops shows on the nearest.
    expect(ZOOMED_OUT_NAMES[zoomedOutIndexOf(0.71)]).toBe("70%");
  });

  it("maps sound on and its volume to the nearest choice", () => {
    expect(soundIndexOf(false, 0.5)).toBe(0);
    expect(soundIndexOf(true, SOUND_VOLUME[1])).toBe(1);
    expect(soundIndexOf(true, 1)).toBe(2);
    expect(soundIndexOf(true, 1.7)).toBe(3);
    // The default volume is Normal.
    expect(soundIndexOf(true, 0.9)).toBe(2);
  });
});
