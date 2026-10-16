// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { fitView, toBoard, toMap, tileVisible, drawMinimap } from "./minimap-draw";
import { mapCamera } from "./minimap-engine";
import { dockPadding } from "./dock-clearance";
import {
  DEFAULT_MINIMAP,
  MINIMAP_KEY,
  MINIMAP_SIZES,
  getMinimap,
  normalizeMinimap,
  setMinimap,
} from "./minimap-settings";
import { buildScene, formatCount, wireColor } from "./minimap-scene";

describe("minimap settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setMinimap({ ...DEFAULT_MINIMAP, show: false });
    setMinimap({ ...DEFAULT_MINIMAP });
  });

  it("falls back to the defaults for anything stored badly", () => {
    expect(normalizeMinimap(undefined)).toEqual(DEFAULT_MINIMAP);
    expect(normalizeMinimap({ size: "gigantic", shape: 3, corner: "middle", zoom: 99, fit: false, fade: 1000 })).toEqual(
      DEFAULT_MINIMAP,
    );
  });

  it("opens small, with no zoom or see-through of its own", () => {
    expect(DEFAULT_MINIMAP.size).toBe("small");
    expect("zoom" in DEFAULT_MINIMAP).toBe(false);
    expect("fit" in DEFAULT_MINIMAP).toBe(false);
    expect("fade" in DEFAULT_MINIMAP).toBe(false);
  });

  it("ignores a zoom stored by an earlier version and keeps the rest", () => {
    const old = { show: true, size: "medium", shape: "circle", corner: "top-left", zoom: 5, fit: false, follow: true, fade: 30 };
    expect(normalizeMinimap(old)).toEqual({
      show: true,
      size: "medium",
      shape: "circle",
      corner: "top-left",
      follow: true,
    });
  });

  it("keeps the mod's sizes", () => {
    expect(MINIMAP_SIZES).toEqual({ small: 130, medium: 190, large: 260, huge: 355 });
  });

  it("writes to the browser", () => {
    setMinimap({ shape: "circle" });
    expect(JSON.parse(window.localStorage.getItem(MINIMAP_KEY)!)).toMatchObject({ shape: "circle" });
    expect(getMinimap().shape).toBe("circle");
  });
});

describe("minimap scene", () => {
  const node = (id: string, type: string, x: number, data: unknown) => ({ id, type, x, y: 0, w: 320, h: 200, data });

  it("builds a card tile with its tint and the pinned count", () => {
    const scene = buildScene({
      name: "Plan",
      nodes: [
        node("a", "recipeNode", 0, { projectNode: { colorTag: "orange", solvePin: 3, parallel: 2 }, recipe: { machineType: "Bender" } }),
        node("b", "recipeNode", 400, { projectNode: {}, result: { theoreticalMachinesRequired: 0 }, recipe: { machineType: "X" } }),
      ],
      edges: [],
    });
    expect(scene.tiles).toHaveLength(2);
    expect(scene.tiles[0]).toMatchObject({ kind: "card", pinned: true, count: "x6", tint: "#f9801d" });
    expect(scene.tiles[1]).toMatchObject({ zero: true, count: "x0", tint: "#8A93A6" });
    expect(scene.bounds).toEqual({ x0: 0, y0: 0, x1: 720, y1: 200 });
  });

  it("keeps text notes, drops other markup, and hides hidden nodes", () => {
    const scene = buildScene({
      name: "P",
      nodes: [
        node("n", "annotationNode", 0, { annotation: { kind: "text", colorTag: "yellow" } }),
        node("z", "annotationNode", 0, { annotation: { kind: "box" } }),
        { ...node("h", "recipeNode", 0, {}), hidden: true },
      ],
      edges: [],
    });
    expect(scene.tiles.map((t) => t.kind)).toEqual(["note"]);
  });

  it("joins routes to their edges and dims wires that carry nothing", () => {
    const scene = buildScene({
      name: "P",
      nodes: [node("a", "recipeNode", 0, { projectNode: {}, recipe: {} })],
      edges: [
        { id: "e1", data: { color: "#336699", transferred: 2 } },
        { id: "e2", data: { color: "#336699" } },
      ],
      routes: [
        { edgeId: "e1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], width: 4 },
        { edgeId: "e2", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
        { edgeId: "gone", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      ],
    });
    expect(scene.wires.map((w) => [w.id, w.flowing, w.width])).toEqual([
      ["e1", true, 4],
      ["e2", false, 3],
    ]);
  });

  it("formats counts and lifts wire colours", () => {
    expect(formatCount(0)).toBe("x0");
    expect(formatCount(2.456)).toBe("x2.46");
    expect(formatCount(1234.4)).toBe("x1234");
    expect(wireColor("#000000")).toBe("#333333");
    expect(wireColor(undefined)).toBe("#9aa1b0");
  });
});

describe("minimap drawing", () => {
  const view = { cx: 100, cy: 100, zoom: 0.5, size: 200, circle: false };

  it("maps board and map points both ways", () => {
    const m = toMap(view, 150, 120);
    expect(m).toEqual({ x: 125, y: 110 });
    expect(toBoard(view, m.x, m.y)).toEqual({ x: 150, y: 120 });
  });

  it("skips tiles outside the map", () => {
    const tile = { id: "t", kind: "card" as const, x: 5000, y: 0, w: 100, h: 100, tint: "#888888", label: "" };
    expect(tileVisible(view, tile)).toBe(false);
    expect(tileVisible(view, { ...tile, x: 100 })).toBe(true);
  });

  it("draws wires and tiles through the 2D context, wires first, and skips tiles off the map", () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "measureText") return () => ({ width: 12 });
          return () => {
            calls.push(prop);
          };
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    const scene = buildScene({
      name: "P",
      nodes: [
        { id: "a", type: "recipeNode", x: 0, y: 0, w: 380, h: 200, data: { projectNode: { solvePin: 2 }, recipe: {} } },
        { id: "b", type: "recipeNode", x: 9000, y: 0, w: 380, h: 200, data: { projectNode: {}, recipe: {} } },
      ],
      edges: [{ id: "e", data: {} }],
      routes: [{ edgeId: "e", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] }],
    });
    drawMinimap(ctx, scene, { ...view, cx: 190, cy: 100, zoom: 0.5 }, { font: "monospace", image: () => undefined });
    expect(calls.indexOf("stroke")).toBeLessThan(calls.indexOf("fillRect"));
    // One visible card: its two tile rects and its count pill's backing, nothing for the card far away.
    expect(calls.filter((c) => c === "fillRect")).toHaveLength(3);
  });
});

describe("minimap camera", () => {
  const bounds = { x0: 0, y0: 0, x1: 2000, y1: 1000 };
  const base = { fit: true, zoom: 0.09, side: 130, circle: false, bounds, anchor: undefined, frozen: undefined, selected: undefined };

  it("fits the whole plan, centred, and holds still however the board pans or zooms", () => {
    const a = mapCamera({ ...base, viewRect: { x: 0, y: 0, w: 800, h: 600 } });
    const b = mapCamera({ ...base, viewRect: { x: 5000, y: -3000, w: 200, h: 150 } });
    expect(a).toEqual(b);
    expect(a.cx).toBe(1000);
    expect(a.cy).toBe(500);
    expect(a.zoom).toBeCloseTo((130 - 12) / 2000);
    // Every corner of the plan lands inside the map.
    const view = { cx: a.cx, cy: a.cy, zoom: a.zoom, size: 130, circle: false };
    for (const [x, y] of [[0, 0], [2000, 1000]]) {
      const m = toMap(view, x, y);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(130);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(130);
    }
  });

  it("fits a round map inside its circle and never zooms past the finest step", () => {
    expect(fitView(bounds, 130, true)!.zoom).toBeCloseTo((130 / Math.SQRT2 - 12) / 2000);
    expect(fitView({ x0: 0, y0: 0, x1: 10, y1: 10 }, 130, false)!.zoom).toBe(1);
    expect(fitView(undefined, 130, false)).toBeUndefined();
  });

  it("zoomed by hand, holds its centre while the view stays on the map and recentres when it leaves", () => {
    const hand = { ...base, fit: false, zoom: 0.25 };
    const first = mapCamera({ ...hand, viewRect: { x: 900, y: 400, w: 200, h: 200 } });
    expect([first.cx, first.cy]).toEqual([1000, 500]);
    const near = mapCamera({ ...hand, anchor: first.anchor, viewRect: { x: 1000, y: 500, w: 200, h: 200 } });
    expect([near.cx, near.cy]).toEqual([1000, 500]);
    const far = mapCamera({ ...hand, anchor: near.anchor, viewRect: { x: 4000, y: 500, w: 200, h: 200 } });
    expect([far.cx, far.cy]).toEqual([4100, 600]);
  });
});

describe("search field beside the map", () => {
  it("stays centred while it clears the map, and steps aside just enough when it would not", () => {
    // A 1920 window, field 360 wide (780..1140), map in the bottom right at 1450..1605: clear already.
    expect(dockPadding({ windowWidth: 1920, fieldWidth: 360, map: { left: 1450, right: 1605 }, corner: "bottom-right" })).toEqual({ left: 0, right: 0 });
    // A 1100 window: the centred field (370..730) would meet a map at 700.
    const pad = dockPadding({ windowWidth: 1100, fieldWidth: 360, map: { left: 700, right: 855 }, corner: "bottom-right" });
    const right = (1100 - pad.right) / 2 + 180;
    expect(right).toBeLessThanOrEqual(700 - 10 + 0.5);
    expect(right).toBeGreaterThan(700 - 12);
    const padL = dockPadding({ windowWidth: 1100, fieldWidth: 360, map: { left: 300, right: 455 }, corner: "bottom-left" });
    expect((1100 + padL.left) / 2 - 180).toBeGreaterThanOrEqual(455 + 10 - 0.5);
    expect(dockPadding({ windowWidth: 1100, fieldWidth: 360, map: { left: 700, right: 855 }, corner: "top-right" })).toEqual({ left: 0, right: 0 });
  });
});
