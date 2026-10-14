// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SEE_THROUGH,
  RAIL_FLOOR,
  SEE_THROUGH_KEY,
  backgroundAlpha,
  clampSeeThrough,
  railAlpha,
  readSeeThrough,
  setSeeThrough,
} from "./see-through";

describe("see-through", () => {
  beforeEach(() => window.localStorage.clear());

  it("steps by 5 and stays in 0..100", () => {
    expect(clampSeeThrough(12)).toBe(10);
    expect(clampSeeThrough(-4)).toBe(0);
    expect(clampSeeThrough(180)).toBe(100);
    expect(clampSeeThrough(Number.NaN)).toBe(DEFAULT_SEE_THROUGH);
  });

  it("reads and writes boardSeeThrough", () => {
    expect(readSeeThrough()).toBe(DEFAULT_SEE_THROUGH);
    setSeeThrough(35);
    expect(window.localStorage.getItem(SEE_THROUGH_KEY)).toBe("35");
    expect(readSeeThrough()).toBe(35);
  });

  it("paper alpha is the mod's, the rail keeps its floor", () => {
    expect(backgroundAlpha(30)).toBeCloseTo(0.7);
    expect(railAlpha(30)).toBeCloseTo(0.7);
    expect(backgroundAlpha(100)).toBe(0);
    expect(railAlpha(100)).toBe(RAIL_FLOOR);
  });
});
