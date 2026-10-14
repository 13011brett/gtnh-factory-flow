// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { fitZoomIndex, toBoard, toMap, tileVisible, drawMinimap } from "./minimap-draw";
import {
  DEFAULT_MINIMAP,
  MINIMAP_KEY,
  MINIMAP_SIZES,
  MINIMAP_ZOOMS,
  getMinimap,
  normalizeMinimap,
  setMinimap,
  stepMinimapZoom,
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
    expect(normalizeMinimap({ size: "gigantic", shape: 3, corner: "middle", zoom: 99, fade: 1000 })).toEqual({
      ...DEFAULT_MINIMAP,
      zoom: MINIMAP_ZOOMS.length - 1,
      fade: 80,
    });
  });

  it("keeps the mod's sizes and ten zoom steps", () => {
    expect(MINIMAP_SIZES).toEqual({ small: 130, medium: 190, large: 260, huge: 355 });
    expect(MINIMAP_ZOOMS).toHaveLength(10);
    expect(MINIMAP_ZOOMS[DEFAULT_MINIMAP.zoom]).toBe(0.09);
  });

  it("writes to the browser and steps the zoom within its ends", () => {
    setMinimap({ shape: "circle", fade: 33 });
    expect(JSON.parse(window.localStorage.getItem(MINIMAP_KEY)!)).toMatchObject({ shape: "circle", fade: 30 });
    setMinimap({ zoom: 0 });
    stepMinimapZoom(-1);
    expect(getMinimap().zoom).toBe(0);
    setMinimap({ zoom: 9 });
    stepMinimapZoom(1);
    expect(getMinimap().zoom).toBe(9);
    stepMinimapZoom(-1);
    expect(getMinimap().zoom).toBe(8);
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

  it("picks the finest zoom that shows the whole plan", () => {
    const bounds = { x0: 0, y0: 0, x1: 2000, y1: 500 };
    const i = fitZoomIndex(bounds, 190, MINIMAP_ZOOMS);
    expect(MINIMAP_ZOOMS[i]! * 2000).toBeLessThanOrEqual(190 * 0.9 + 1e-9);
    expect(i === MINIMAP_ZOOMS.length - 1 || MINIMAP_ZOOMS[i + 1]! * 2000 > 190 * 0.9).toBe(true);
    expect(fitZoomIndex(undefined, 190, MINIMAP_ZOOMS)).toBe(2);
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
