// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { neiGridFit } from "./ResourceIndexPane";

describe("the items grid fills its column", () => {
  it.each([180, 251.7, 256, 300, 320, 411])("%s px: even margins, never a gutter close to a slot", (width) => {
    const { columns, slot } = neiGridFit(width);
    expect(slot).toBeGreaterThanOrEqual(30);
    // The slots fill the room inside the 6 px margins exactly, so left and right match.
    expect(columns * slot).toBeCloseTo(width - 12);
    // Another column would not fit at the smallest slot.
    expect((columns + 1) * 30).toBeGreaterThan(width - 12);
  });

  it("puts 8 slots in the default column where 7 left a near-empty gutter", () => {
    expect(neiGridFit(256).columns).toBe(8);
  });
});
