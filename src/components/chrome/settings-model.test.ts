import { describe, expect, it } from "vitest";
import { SEE_THROUGH_NAMES, SIZE_NAMES, sizeIndexOf, sizePercentOf, soundIndexOf, SOUND_NAMES, SOUND_VOLUME } from "./settings-model";

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

  it("maps sound on and its volume to the nearest choice", () => {
    expect(soundIndexOf(false, 0.5)).toBe(0);
    expect(soundIndexOf(true, SOUND_VOLUME[1])).toBe(1);
    expect(soundIndexOf(true, 1)).toBe(2);
    expect(soundIndexOf(true, 1.7)).toBe(3);
    // The default volume is Normal.
    expect(soundIndexOf(true, 0.9)).toBe(2);
  });

  it("lists See-through from 0% to 100% in fives", () => {
    expect(SEE_THROUGH_NAMES[0]).toBe("0%");
    expect(SEE_THROUGH_NAMES[6]).toBe("30%");
    expect(SEE_THROUGH_NAMES.at(-1)).toBe("100%");
    expect(SEE_THROUGH_NAMES).toHaveLength(21);
  });
});
