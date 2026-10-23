// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FactoryProject, FactoryStorage } from "@/lib/model/types";
import { boardBodyRect, computeBoardLevelView, computeOpenBoardRects } from "@/lib/model/board-windows";
import { RECIPE_NODE_WIDTH, STORAGE_NODE_HEIGHT, STORAGE_NODE_WIDTH } from "@/lib/board-grid";
import { node, project, recipe, wire } from "@/lib/solver/plan/adapter/test-kit";
import { NoticeRow } from "./NoticeBar";
import { useFactoryStore } from "@/store/factory-store";
import { buildNotices } from "./notices";
import { showCards, takeStrandedFix } from "./rail-actions";
import cbdPlan from "../../__fixtures__/stranded/cbd.json";
import loopPlan from "../../__fixtures__/stranded/hydrogen-loop.json";

/**
 * The notice's key on the real store (no worker in tests, so the books are solved, and the stranded spare found, on
 * this thread). Fixtures: see `stranded-surplus.test.ts`.
 */
const CROP = "node-5fb2f75f-a02b-496a-9fa7-f7685a1e8a75";
const HEAVY_LCR = "node-bbba4208-fadf-4819-be90-87206c39142c";

const store = () => useFactoryStore.getState();
const load = (plan: unknown) =>
  store().setProject(structuredClone(plan) as unknown as FactoryProject);
const addedDrawer = (before: FactoryProject): FactoryStorage => {
  const added = (store().project.storages ?? []).filter(
    (s) => !(before.storages ?? []).some((b) => b.id === s.id),
  );
  expect(added).toHaveLength(1);
  return added[0]!;
};
/** Where a thing stands in flow space (a board member stands relative to its frame). */
const absolute = (thing: { position: { x: number; y: number }; pocketId?: string }) => {
  const frame = thing.pocketId
    ? computeOpenBoardRects(computeBoardLevelView(store().project).openBoards).find((f) => f.id === thing.pocketId)
    : undefined;
  return { x: thing.position.x + (frame?.x ?? 0), y: thing.position.y + (frame?.y ?? 0) };
};
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const vent = () => {
  const found = store().lastResult?.plan?.stranded?.vents[0];
  if (!found) throw new Error("no stranded spare on the board");
  return found;
};

describe("taking a stranded spare's fix", () => {
  beforeEach(() => {
    useFactoryStore.setState({ isReadOnly: false });
  });

  it("adds one byproduct drawer on the row, clear of the cards, as one undo step, and the line runs", () => {
    load(cbdPlan);
    const before = store().project;
    expect(store().undoHistory).toHaveLength(0);

    expect(takeStrandedFix(vent())).toBe(true);
    const after = store().project;
    expect(store().undoHistory).toHaveLength(1);
    const added = (after.storages ?? []).filter(
      (s) => !(before.storages ?? []).some((b) => b.id === s.id),
    );
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      kind: "fluid",
      resourceId: "liquid_heavy_fuel",
      drainMode: "byproduct",
    });
    const wires = after.edges.filter((e) => e.target === added[0]!.id);
    expect(wires).toHaveLength(1);
    expect(wires[0]).toMatchObject({ source: HEAVY_LCR, resourceId: "liquid_heavy_fuel" });
    // Clear floor: the drawer's whole body overlaps no card (cards counted as tall as the placement counts them).
    const body = { ...added[0]!.position, width: STORAGE_NODE_WIDTH, height: STORAGE_NODE_HEIGHT };
    for (const card of after.nodes) {
      expect(overlaps(body, { ...card.position, width: RECIPE_NODE_WIDTH, height: 280 }), card.id).toBe(false);
    }

    // The books: the crop runs full, the spare goes to the drawer, and the notice is gone.
    const result = store().lastResult!;
    expect(result.plan?.upTo?.[CROP]?.reached).toBeCloseTo(118, 6);
    expect(result.plan?.stranded).toBeUndefined();
    expect(buildNotices(after, result)).toEqual([]);

    store().undo();
    expect(store().project.storages).toEqual(before.storages);
    expect(store().project.edges).toEqual(before.edges);
    expect(store().lastResult?.plan?.stranded?.vents).toHaveLength(1);
  });

  it("never adds a second drawer: a press with the drawer already there, or on stale books, does nothing", () => {
    load(cbdPlan);
    const spare = vent();
    expect(takeStrandedFix(spare)).toBe(true);
    const once = store().project;
    expect(takeStrandedFix(spare)).toBe(false);
    expect(store().project).toBe(once);
    expect(store().undoHistory).toHaveLength(1);

    load(cbdPlan);
    const fresh = vent();
    useFactoryStore.setState({ lastResult: { ...store().lastResult!, stale: true } });
    const held = store().project;
    expect(takeStrandedFix(fresh)).toBe(false);
    expect(store().project).toBe(held);
  });

  it("does nothing on a read-only board", () => {
    load(cbdPlan);
    const spare = vent();
    useFactoryStore.setState({ isReadOnly: true });
    const held = store().project;
    expect(takeStrandedFix(spare)).toBe(false);
    expect(store().project).toBe(held);
  });

  it("lays the one wire to the card that took it from outside, and a second press never takes it away", () => {
    const plan = structuredClone(loopPlan) as unknown as FactoryProject;
    plan.edges = plan.edges.filter((e) => e.id !== "w11");
    load(plan);
    const spare = vent();
    expect(spare.fix.kind).toBe("wire");
    const edgesBefore = store().project.edges.length;

    expect(takeStrandedFix(spare)).toBe(true);
    const wired = store().project;
    expect(wired.edges).toHaveLength(edgesBefore + 1);
    expect(wired.storages).toEqual(plan.storages);
    const laid = wired.edges.filter(
      (e) => e.source === "electro" && e.target === "crLight" && e.resourceId === "gregtech:gt.metaitem.01@30001",
    );
    expect(laid).toHaveLength(1);
    expect(store().undoHistory).toHaveLength(1);
    expect(store().lastResult?.plan?.upTo?.crop?.reached).toBeGreaterThan(1);
    expect(store().lastResult?.plan?.stranded).toBeUndefined();

    expect(takeStrandedFix(spare)).toBe(false);
    expect(store().project.edges).toHaveLength(edgesBefore + 1);
    expect(store().undoHistory).toHaveLength(1);
  });

  it("lands the drawer on clear floor inside the open board its card is on, and joins it", () => {
    // Every CBD card inside one open board: the drawer must stand wholly on that board's floor, on no card.
    const plan = structuredClone(cbdPlan) as unknown as FactoryProject;
    const origin = { x: -600, y: -540 };
    plan.pockets = [
      { id: "b1", name: "Fuel", position: origin, expanded: true, size: { width: 2020, height: 1120 } },
    ];
    plan.nodes = plan.nodes.map((n) => ({
      ...n,
      pocketId: "b1",
      position: { x: n.position.x - origin.x, y: n.position.y - origin.y },
    }));
    plan.storages = (plan.storages ?? []).map((s) => ({
      ...s,
      pocketId: "b1",
      position: { x: s.position.x - origin.x, y: s.position.y - origin.y },
    }));
    load(plan);
    const before = store().project;
    expect(takeStrandedFix(vent())).toBe(true);
    const drawer = addedDrawer(before);
    expect(drawer.pocketId).toBe("b1");
    const at = { ...absolute(drawer), width: STORAGE_NODE_WIDTH, height: STORAGE_NODE_HEIGHT };
    const frame = computeOpenBoardRects(computeBoardLevelView(store().project).openBoards).find((f) => f.id === "b1")!;
    const body = boardBodyRect(frame);
    expect(at.x).toBeGreaterThanOrEqual(body.x);
    expect(at.y).toBeGreaterThanOrEqual(body.y);
    expect(at.x + at.width).toBeLessThanOrEqual(body.x + body.width);
    expect(at.y + at.height).toBeLessThanOrEqual(body.y + body.height);
    for (const card of store().project.nodes) {
      expect(overlaps(at, { ...absolute(card), width: RECIPE_NODE_WIDTH, height: 280 }), card.id).toBe(false);
    }
    expect(store().lastResult?.plan?.upTo?.[CROP]?.reached).toBeCloseTo(118, 6);
  });

  it("puts the drawer beside a board with no room left, on the root", () => {
    // The heavy reactor alone in a board just its size.
    const plan = structuredClone(cbdPlan) as unknown as FactoryProject;
    const lcr = plan.nodes.find((n) => n.id === HEAVY_LCR)!;
    plan.pockets = [
      {
        id: "tight",
        name: "Heavy",
        position: { x: lcr.position.x, y: lcr.position.y - 40 },
        expanded: true,
        size: { width: 380, height: 340 },
      },
    ];
    plan.nodes = plan.nodes.map((n) =>
      n.id === HEAVY_LCR ? { ...n, pocketId: "tight", position: { x: 0, y: 40 } } : n,
    );
    load(plan);
    const before = store().project;
    expect(takeStrandedFix(vent())).toBe(true);
    const drawer = addedDrawer(before);
    expect(drawer.pocketId).toBeUndefined();
    expect(drawer.position.x).toBeGreaterThanOrEqual(lcr.position.x + 380);
  });

  it("puts the drawer beside a minimized board, never at the hidden card's own place", () => {
    const plan = structuredClone(cbdPlan) as unknown as FactoryProject;
    plan.pockets = [{ id: "m1", name: "Heavy", position: { x: 2000, y: 2000 }, expanded: false }];
    plan.nodes = plan.nodes.map((n) =>
      n.id === HEAVY_LCR ? { ...n, pocketId: "m1", position: { x: 60, y: 60 } } : n,
    );
    load(plan);
    const before = store().project;
    expect(takeStrandedFix(vent())).toBe(true);
    const drawer = addedDrawer(before);
    expect(drawer.pocketId).toBeUndefined();
    expect(Math.abs(drawer.position.x - 2420)).toBeLessThanOrEqual(200);
    expect(Math.abs(drawer.position.y - 2000)).toBeLessThanOrEqual(200);
  });

  it("drains a shared machine's second recipe through its own handle", () => {
    // src (Up to 2) feeds section 1 of a shared card (a -> 3h + 10l), whose h and l go to a mixer taking 1:5;
    // section 0 runs on its own feed. The spare h is on `sh#r1`.
    const plan = project({
      recipes: [
        recipe("make-a", [], [["a", 1]]),
        recipe("make-x", [], [["x", 1]]),
        recipe("other", [["x", 1]], [["y", 1]]),
        recipe("tower", [["a", 1]], [["h", 3], ["l", 10]]),
        recipe("mix", [["h", 1], ["l", 5]], [["f", 1]]),
      ],
      nodes: [
        node("src", "make-a", { solvePin: 2 }),
        node("srcx", "make-x", { solvePin: 0.5 }),
        node("sh", "other", { extraRecipes: [{ recipeId: "tower" }], position: { x: 400, y: 0 } }),
        node("mix1", "mix", { position: { x: 800, y: 0 } }),
      ],
      edges: [
        wire("w0", "srcx", "sh", "x"),
        wire("w1", "src", "sh", "a", { to: 1 }),
        wire("w2", "sh", "mix1", "h", { from: 1 }),
        wire("w3", "sh", "mix1", "l", { from: 1 }),
      ],
    });
    load(plan);
    const spare = vent();
    expect(spare).toMatchObject({ nodeId: "sh#r1", portKey: "sh#r1|o|output:item:h", fix: { kind: "drawer" } });
    expect(spare.perSecond).toBeCloseTo(2, 6);
    const before = store().project;
    expect(takeStrandedFix(spare)).toBe(true);
    const drawer = addedDrawer(before);
    const edge = store().project.edges.find((e) => e.target === drawer.id);
    expect(edge).toMatchObject({ source: "sh", sourceHandle: "r1:output:item:h" });
    expect(store().undoHistory).toHaveLength(1);
    expect(store().lastResult?.plan?.upTo?.src?.reached).toBeCloseTo(2, 6);
    expect(store().lastResult?.plan?.stranded).toBeUndefined();
    expect(takeStrandedFix(spare)).toBe(false);
  });

  it("takes the fix from the notice row's own key, with no stand-in", () => {
    load(cbdPlan);
    const before = store().project;
    const notice = buildNotices(before, store().lastResult)[0]!;
    expect(notice.fix?.label).toBe("Add a drawer");
    render(<NoticeRow notice={notice} onShow={() => undefined} />);
    fireEvent.click(screen.getByText("Add a drawer"));
    expect(addedDrawer(before)).toMatchObject({ resourceId: "liquid_heavy_fuel", drainMode: "byproduct" });
    expect(store().undoHistory).toHaveLength(1);
  });
});

describe("a stalled card's bar going to the culprit (showCards)", () => {
  it("frames both cards while that reads, else the first close up, and leaves out cards no longer on the board", () => {
    const frame = vi.fn();
    const was = store().frameBoardNodes;
    load(cbdPlan);
    useFactoryStore.setState({ frameBoardNodes: frame });
    try {
      const near = store().project.nodes.slice(0, 2).map((n) => n.id);
      expect(showCards(near)).toBe(true);
      expect(frame).toHaveBeenLastCalledWith(near, { padding: 0.2 });
      // Two cards far apart: framing both would be too small to read.
      useFactoryStore.setState({
        project: {
          ...store().project,
          nodes: store().project.nodes.map((n) => (n.id === near[1] ? { ...n, position: { x: 90000, y: 0 } } : n)),
        },
      });
      expect(showCards(near)).toBe(true);
      expect(frame).toHaveBeenLastCalledWith([near[0]], { maxZoom: 1 });
      // Books older than the last edit may name a card that is gone.
      expect(showCards(["gone", near[0]!])).toBe(true);
      expect(frame).toHaveBeenLastCalledWith([near[0]], { padding: 0.2 });
      frame.mockClear();
      expect(showCards(["gone"])).toBe(false);
      expect(frame).not.toHaveBeenCalled();
    } finally {
      useFactoryStore.setState({ frameBoardNodes: was });
    }
  });
});
