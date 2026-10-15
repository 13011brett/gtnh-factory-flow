import { describe, expect, it } from "vitest";
import { BLINK_MS, blinkOffAt } from "./prompt-phase";

describe("prompt clock", () => {
  it("is gold for the first half of each blink and grey for the second, on the document's time", () => {
    expect(blinkOffAt(0)).toBe(false);
    expect(blinkOffAt(BLINK_MS / 2 - 1)).toBe(false);
    expect(blinkOffAt(BLINK_MS / 2)).toBe(true);
    expect(blinkOffAt(BLINK_MS - 1)).toBe(true);
    expect(blinkOffAt(BLINK_MS * 7 + 10)).toBe(false);
  });
});
