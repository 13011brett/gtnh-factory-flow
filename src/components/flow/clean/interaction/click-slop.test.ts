import { describe, expect, it } from "vitest";
import { CLICK_SLOP, isClickMove } from "./click-slop";

describe("click versus drag", () => {
  it("is a click within 3 px of where the press went down, a drag at 3 and beyond", () => {
    expect(CLICK_SLOP).toBe(3);
    expect(isClickMove({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(isClickMove({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(true);
    expect(isClickMove({ x: 10, y: 10 }, { x: 13, y: 10 })).toBe(false);
    expect(isClickMove({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false);
  });
});
