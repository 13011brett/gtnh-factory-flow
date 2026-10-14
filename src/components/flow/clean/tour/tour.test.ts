// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseLines, parseSpans, plainText } from "./markup";
import { overlap, placeNote } from "./placement";
import { STEPS } from "./script";

describe("tour markup", () => {
  it("makes words between asterisks gold and {b:} {o:} the resource inks", () => {
    expect(parseSpans("A *gold* word, {b:Blue} and {o:Orange}.")).toEqual([
      { text: "A ", ink: "plain" },
      { text: "gold", ink: "gold" },
      { text: " word, ", ink: "plain" },
      { text: "Blue", ink: "blue" },
      { text: " and ", ink: "plain" },
      { text: "Orange", ink: "orange" },
      { text: ".", ink: "plain" },
    ]);
  });

  it("lifts a leading mouse or key glyph out of each line", () => {
    const lines = parseLines("{M} *Middle mouse* to pan.\n{K} *W A S D* to move.\nTry it.");
    expect(lines.map((l) => l.glyph)).toEqual(["M", "K", undefined]);
    expect(plainText("{M} *Middle mouse* to pan.\nTry it.")).toBe("Middle mouse to pan.\nTry it.");
  });
});

describe("note placement", () => {
  const viewport = { w: 1000, h: 700 };
  const size = { w: 330, h: 120 };

  it("goes below the thing when there is room, the tip under its middle", () => {
    const p = placeNote({ target: { x: 400, y: 100, w: 200, h: 100 }, size, viewport });
    expect(p.side).toBe("below");
    expect(p.y).toBeGreaterThanOrEqual(200);
    expect(p.x + p.tip).toBeCloseTo(500, 0);
  });

  it("goes above when there is no room below", () => {
    const p = placeNote({ target: { x: 400, y: 560, w: 200, h: 100 }, size, viewport });
    expect(p.side).toBe("above");
    expect(p.y + size.h).toBeLessThanOrEqual(560);
  });

  it("stays on the screen and off what it was told to avoid", () => {
    const target = { x: 20, y: 20, w: 100, h: 60 };
    const avoid = [{ x: 0, y: 90, w: 130, h: 200 }];
    const p = placeNote({ target, size, viewport, avoid });
    expect(p.x).toBeGreaterThanOrEqual(10);
    const rect = { x: p.x, y: p.y, w: size.w, h: size.h };
    expect(overlap(rect, avoid[0]!)).toBe(0);
    expect(p.side).toBe("right");
  });

  it("says its piece in the middle with nothing to point at", () => {
    const p = placeNote({ target: null, size, viewport });
    expect(p.side).toBe("centre");
    expect(p.x).toBe((1000 - 330) / 2);
  });
});

describe("the script", () => {
  it("has unique step ids and a note for each, in plain short words", () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STEPS.length).toBeGreaterThanOrEqual(30);
    for (const step of STEPS) {
      expect(step.note.text.length).toBeGreaterThan(10);
      expect(step.actions.length).toBeGreaterThan(0);
      // The owner's voice: no website or Factory Flow names in a note.
      expect(step.note.text).not.toMatch(/gtnhplanner\.com|factory flow/i);
    }
  });

  it("leaves out what needs the game", () => {
    const all = STEPS.map((s) => s.note.text).join("\n");
    expect(all).not.toMatch(/\bNEI\b|in the world|pin list|crosshair/i);
  });
});
