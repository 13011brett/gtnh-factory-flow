import { describe, expect, it } from "vitest";
import type { FactoryAnnotation } from "@/lib/model/types";
import { DRAWING, K, arrowEnds, arrowHead, drawingLook, scalePoints, surfaceFill, withAlpha } from "./drawing-look";

const base = { id: "a", position: { x: 0, y: 0 }, size: { width: 100, height: 100 } };

describe("drawing look", () => {
  it("is the classic default: solid border and a faint tint in the colour tag", () => {
    const look = drawingLook({ ...base, kind: "box", colorTag: "azure" } as FactoryAnnotation);
    expect(look.border).toBe("solid");
    expect(look.borderColor).toBe("#3b82f6");
    expect(surfaceFill(look)).toBe("#3b82f614");
  });

  it("reads legacy fills: a mark name is a tint wearing it, paper is solid", () => {
    const hatch = drawingLook({ ...base, kind: "zone", style: { fill: "hatch" } } as FactoryAnnotation);
    expect(hatch.surface).toBe("tint");
    expect(hatch.marks).toBe("hatch");
    const paper = drawingLook({ ...base, kind: "box", style: { fill: "paper" } } as FactoryAnnotation);
    expect(surfaceFill(paper)).toBe("#fed83d47");
    expect(surfaceFill(drawingLook({ ...base, kind: "box", style: { fill: "none" } } as FactoryAnnotation))).toBeUndefined();
  });

  it("border and fill colours fall back to the tag", () => {
    const look = drawingLook({
      ...base,
      kind: "box",
      colorTag: "lime",
      style: { borderColor: "red" },
    } as FactoryAnnotation);
    expect(look.borderColor).toBe("#b02e26");
    expect(look.fillColor).toBe("#80c71f");
  });

  it("an image with no colour wears the card frame grey", () => {
    expect(drawingLook({ ...base, kind: "image" } as FactoryAnnotation).borderColor).toBe(DRAWING.frameGrey);
  });

  it("sizes are the mod's times the card scale", () => {
    expect(DRAWING.line).toBeCloseTo(2 * K);
    expect(withAlpha("#ffffff", 20)).toBe("#ffffff14");
  });

  it("an arrow goes tail to head across its box and the head points along it", () => {
    expect(arrowEnds(undefined, 80, 40)).toEqual({ from: { x: 0, y: 0 }, to: { x: 80, y: 40 } });
    expect(arrowEnds("up-left", 80, 40)).toEqual({ from: { x: 80, y: 40 }, to: { x: 0, y: 0 } });
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(head[0]).toEqual({ x: 100, y: 0 });
    expect(head[1].x).toBeCloseTo(100 - DRAWING.headLength);
    expect(head[1].y).toBeCloseTo(DRAWING.headWidth / 2);
  });

  it("a zone's points scale with its box", () => {
    expect(scalePoints([{ x: 10, y: 20 }], { width: 100, height: 100 }, { width: 200, height: 50 })).toEqual([
      { x: 20, y: 10 },
    ]);
  });
});
