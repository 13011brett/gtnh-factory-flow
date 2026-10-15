import { describe, expect, it } from "vitest";
import { orderWith, shiftsFor, slotAt, stepped, type TabBox } from "./tab-reorder";

const boxes: TabBox[] = [
  { id: "a", left: 0, width: 50 },
  { id: "b", left: 52, width: 70 },
  { id: "c", left: 124, width: 60 },
];

describe("tab reordering", () => {
  it("finds the slot under the dragged tab's centre", () => {
    expect(slotAt(boxes, "a", 10)).toBe(0);
    expect(slotAt(boxes, "a", 100)).toBe(1);
    expect(slotAt(boxes, "a", 400)).toBe(2);
    expect(slotAt(boxes, "c", -30)).toBe(0);
  });
  it("puts the dragged id back at a slot among the rest", () => {
    expect(orderWith(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(orderWith(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(orderWith(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
  });
  it("shifts each tab from its natural place to its place in the new order", () => {
    expect(shiftsFor(boxes, ["b", "c", "a"], 2)).toEqual({ b: -52, c: -52, a: 134 });
  });
  it("steps a tab one place and stops at the ends", () => {
    expect(stepped(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(stepped(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(stepped(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
