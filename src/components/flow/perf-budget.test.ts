import { describe, expect, it } from "vitest";
import {
  PULSE_FULL_CARDS,
  PULSE_FULL_MARKED,
  PULSE_RING_MARKED,
  countPulseMarks,
  pulseTier,
} from "./animation-phase";
import { FIRST_SLICE, nextSliceCount, sliceOrder } from "./sliced-mount";

describe("pulse tiers", () => {
  it("lets a small board breathe fully", () => {
    expect(pulseTier(0, 10)).toBe("full");
    expect(pulseTier(PULSE_FULL_MARKED, PULSE_FULL_CARDS)).toBe("full");
  });

  it("drops to rings, then to still, as marked cards pile up", () => {
    expect(pulseTier(PULSE_FULL_MARKED + 1, 50)).toBe("ring");
    expect(pulseTier(PULSE_RING_MARKED, 500)).toBe("ring");
    expect(pulseTier(PULSE_RING_MARKED + 1, 500)).toBe("still");
  });

  it("a big board of clean cards is not fully lit (a hovered resource glows many)", () => {
    expect(pulseTier(0, PULSE_FULL_CARDS + 1)).toBe("ring");
  });

  it("climbs back only with slack, so a board at a limit does not flicker", () => {
    const limit = PULSE_RING_MARKED;
    expect(pulseTier(limit + 1, 500, "ring")).toBe("still");
    // Just under the limit is not enough to leave "still"...
    expect(pulseTier(limit - 1, 500, "still")).toBe("still");
    // ...well under it is.
    expect(pulseTier(Math.floor(limit * 0.8), 500, "still")).toBe("ring");
    expect(pulseTier(Math.floor(PULSE_FULL_MARKED * 0.8), 50, "ring")).toBe("full");
    expect(pulseTier(PULSE_FULL_MARKED - 1, 50, "ring")).toBe("ring");
  });
});

describe("countPulseMarks", () => {
  const card = (verdict?: string) => ({
    firstElementChild: { getAttribute: (name: string) => (name === "data-verdict" ? (verdict ?? null) : null) },
  });
  const boardOf = (cards: ReturnType<typeof card>[]) =>
    ({ querySelector: () => ({ children: cards }) }) as unknown as Element;

  it("counts cards and the ones whose verdict carries a breathing mark", () => {
    const board = boardOf([card("unwired"), card("running"), card("dead-loop"), card(), card("clogged")]);
    expect(countPulseMarks(board)).toEqual({ cards: 5, marked: 3 });
  });

  it("reads zero from a board with no nodes layer", () => {
    expect(countPulseMarks({ querySelector: () => null } as unknown as Element)).toEqual({
      cards: 0,
      marked: 0,
    });
  });
});

describe("sliceOrder", () => {
  const node = (id: string, x: number, y: number, parentId?: string) => ({
    id,
    position: { x, y },
    parentId,
  });

  it("mounts the cards nearest the camera first", () => {
    const order = sliceOrder([node("far", 5000, 0), node("near", 90, 0), node("mid", 700, 0)], { x: 0, y: 0 });
    expect(order).toEqual(["near", "mid", "far"]);
  });

  it("is the same for the same plan", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => node(`n${i}`, (i % 5) * 100, Math.floor(i / 5) * 100));
    expect(sliceOrder(nodes, { x: 200, y: 200 })).toEqual(sliceOrder([...nodes].reverse(), { x: 200, y: 200 }));
  });

  it("puts a frame before the cards inside it, and measures members from the frame", () => {
    const order = sliceOrder(
      [node("frame", 4000, 0), node("inside", 10, 10, "frame"), node("loose", 100, 0)],
      { x: 0, y: 0 },
    );
    expect(order.indexOf("frame")).toBeLessThan(order.indexOf("inside"));
    // "inside" is 4010 from the camera, not 10: the loose card is first.
    expect(order[0]).toBe("loose");
  });

  it("lists every card once", () => {
    const nodes = [node("a", 0, 0), node("b", 1, 1, "a"), node("c", 2, 2, "b")];
    expect([...sliceOrder(nodes, { x: 0, y: 0 })].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("nextSliceCount", () => {
  it("grows by a factor, so a big plan takes a handful of passes", () => {
    let count = FIRST_SLICE;
    const steps = [count];
    while (count < 1000) {
      count = nextSliceCount(count, 1000);
      steps.push(count);
    }
    expect(steps).toEqual([40, 160, 640, 1000]);
  });

  it("never passes the total, and starts at the first slice", () => {
    expect(nextSliceCount(0, 1000)).toBe(FIRST_SLICE);
    expect(nextSliceCount(900, 950)).toBe(950);
  });
});
