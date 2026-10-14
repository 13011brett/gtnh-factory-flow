import { describe, expect, it } from "vitest";
import type { VRect } from "./card-virtualizer";
import { routeBox, sameEdgeList, selectVisibleEdges } from "./edge-culler";

const boxes = new Map<string, VRect>([
  ["a", { x: 0, y: 0, w: 320, h: 240 }],
  ["b", { x: 640, y: 0, w: 320, h: 240 }],
  ["c", { x: 20_000, y: 0, w: 320, h: 240 }],
  ["d", { x: 40_000, y: 0, w: 320, h: 240 }],
]);
const boxOf = (id: string) => boxes.get(id);
const edges = [
  { id: "ab", source: "a", target: "b" },
  { id: "bc", source: "b", target: "c" },
  { id: "cd", source: "c", target: "d" },
  { id: "ax", source: "a", target: "missing" },
];

describe("selectVisibleEdges", () => {
  const view: VRect = { x: 0, y: 0, w: 1920, h: 1080 };

  it("mounts the wires with an end near the screen and leaves the others", () => {
    const shown = selectVisibleEdges(edges, view, { margin: 0.35, detour: 480, boxOf });
    expect(shown.map((edge) => edge.id)).toEqual(["ab", "bc"]);
  });

  it("mounts a wire whose ends are both off screen when it crosses the screen", () => {
    const crossing = [{ id: "ac", source: "a", target: "c" }];
    const away: VRect = { x: 5000, y: 0, w: 1920, h: 1080 };
    expect(selectVisibleEdges(crossing, away, { margin: 0, detour: 100, boxOf }).map((e) => e.id)).toEqual(["ac"]);
    const above: VRect = { x: 5000, y: 3000, w: 1920, h: 1080 };
    expect(selectVisibleEdges(crossing, above, { margin: 0, detour: 100, boxOf })).toEqual([]);
  });

  it("uses the routed path when there is one", () => {
    const routed = [{ id: "ac", source: "a", target: "c" }];
    const below: VRect = { x: 8000, y: 2000, w: 1920, h: 1080 };
    // Unrouted, the box of the two cards grown by the detour does not reach y 2000.
    expect(selectVisibleEdges(routed, below, { margin: 0, detour: 100, boxOf })).toEqual([]);
    // Routed, the wire swings down there.
    const route = [
      { x: 320, y: 120 },
      { x: 320, y: 2500 },
      { x: 20_000, y: 2500 },
      { x: 20_000, y: 120 },
    ];
    expect(selectVisibleEdges(routed, below, { margin: 0, detour: 100, boxOf, routeOf: () => route }).map((e) => e.id)).toEqual(["ac"]);
  });

  it("always mounts a selected wire", () => {
    const far = [{ id: "cd", source: "c", target: "d", selected: true }];
    expect(selectVisibleEdges(far, view, { margin: 0, detour: 0, boxOf })).toHaveLength(1);
  });

  it("keeps the original order and objects", () => {
    const shown = selectVisibleEdges(edges, view, { margin: 0.35, detour: 480, boxOf });
    expect(shown[0]).toBe(edges[0]);
    expect(sameEdgeList(shown, [edges[0]!, edges[1]!])).toBe(true);
    expect(sameEdgeList(shown, [edges[1]!, edges[0]!])).toBe(false);
  });
});

describe("routeBox", () => {
  it("bounds a route and remembers it per array", () => {
    const route = [
      { x: 10, y: 20 },
      { x: 50, y: 5 },
    ];
    expect(routeBox(route)).toEqual({ x: 10, y: 5, w: 40, h: 15 });
    expect(routeBox(route)).toBe(routeBox(route));
    expect(routeBox([])).toBeUndefined();
    expect(routeBox(undefined)).toBeUndefined();
  });
});
