import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFactoryStore } from "@/store/factory-store";
import { makeLeftoverKey, makePortKey } from "./port-key";
import {
  movePortRateToDrawer,
  prunePlanFields,
  rehomeSectionFields,
  renumberAfterSectionRemoved,
  renumberAfterSectionsSwapped,
} from "./hygiene";
import { setSolveCore } from "./adapter/engine";
import { drawer, handle, node, project, recipe, wire } from "./adapter/test-kit";
import type { FactoryProject } from "../../model/types";

const recipes = [
  recipe("a", [["x", 1]], [["y", 1]]),
  recipe("b", [["y", 1]], [["z", 1]]),
  recipe("c", [["z", 1]], [["w", 1]]),
];

const outKey = (nodeId: string, item: string) => makePortKey(nodeId, "o", handle("output", item));

/** A three-section card: a (0), b (1), c (2). */
const shared = (portRates?: Record<string, number>): FactoryProject =>
  project({
    recipes,
    nodes: [node("card", "a", { extraRecipes: [{ recipeId: "b" }, { recipeId: "c" }], portRates })],
  });

describe("prunePlanFields", () => {
  it("returns the same project when everything still names something", () => {
    const p = shared({ [handle("output", "y")]: 1, [handle("output", "w", 2)]: 2, [handle("input", "z", 2)]: 3 });
    expect(prunePlanFields(p)).toBe(p);
    const plain = project({ recipes, nodes: [node("n", "a")] });
    expect(prunePlanFields(plain)).toBe(plain);
  });

  it("drops rates on a section the card lost, a row the recipe lacks, and bad numbers", () => {
    const p = project({
      recipes,
      nodes: [
        node("card", "a", {
          extraRecipes: [{ recipeId: "b" }],
          portRates: {
            [handle("output", "y")]: 1,
            [handle("output", "nope")]: 2,
            [handle("output", "z", 5)]: 3,
            [handle("output", "z", 1)]: 4,
            [handle("input", "x")]: 0,
          },
        }),
      ],
    });
    expect(prunePlanFields(p).nodes[0]!.portRates).toEqual({
      [handle("output", "y")]: 1,
      [handle("output", "z", 1)]: 4,
    });
  });

  it("leaves rates alone when the card's recipe is not in the plan (mid-refresh)", () => {
    const p = project({ recipes: [], nodes: [node("n", "a", { portRates: { [handle("output", "y")]: 1 } })] });
    expect(prunePlanFields(p)).toBe(p);
  });

  it("an emptied portRates is removed from the card", () => {
    const p = project({ recipes, nodes: [node("n", "a", { portRates: { [handle("output", "nope")]: 1 } })] });
    expect("portRates" in prunePlanFields(p).nodes[0]!).toBe(false);
  });

  it("drops spare bearers on cards or rows that are gone, and splits left with one place", () => {
    const keyAB = makeLeftoverKey([outKey("n", "y"), outKey("gone", "y")]);
    const keyABC = makeLeftoverKey([outKey("n", "y"), outKey("m", "y"), outKey("gone", "y")]);
    const keyRow = makeLeftoverKey([outKey("n", "y"), outKey("m", "nope")]);
    const p = project({
      recipes,
      nodes: [node("n", "a"), node("m", "a")],
      extra: {
        spareShares: {
          [keyAB]: { [outKey("n", "y")]: 0.5, [outKey("gone", "y")]: 0.5 },
          [keyABC]: { [outKey("n", "y")]: 0.2, [outKey("m", "y")]: 0.3, [outKey("gone", "y")]: 0.5 },
          [keyRow]: { [outKey("n", "y")]: 1, [outKey("m", "nope")]: 0 },
        },
      },
    });
    const out = prunePlanFields(p).spareShares!;
    expect(Object.keys(out)).toEqual([makeLeftoverKey([outKey("n", "y"), outKey("m", "y")])]);
    expect(Object.values(out)[0]).toEqual({ [outKey("n", "y")]: 0.2, [outKey("m", "y")]: 0.3 });
  });

  it("no splits left: the field goes", () => {
    const key = makeLeftoverKey([outKey("n", "y"), outKey("gone", "y")]);
    const p = project({
      recipes,
      nodes: [node("n", "a")],
      extra: { spareShares: { [key]: { [outKey("n", "y")]: 1, [outKey("gone", "y")]: 0 } } },
    });
    expect("spareShares" in prunePlanFields(p)).toBe(false);
  });
});

describe("section renumbering", () => {
  const rates = {
    [handle("output", "y")]: 1,
    [handle("output", "z", 1)]: 2,
    [handle("output", "w", 2)]: 3,
  };
  const keyOf = (a: string, b: string) => makeLeftoverKey([outKey(a, "z"), outKey(b, "w")]);

  it("removing a middle section drops its rates and moves later ones down", () => {
    const out = renumberAfterSectionRemoved(shared(rates), "card", 1);
    expect(out.nodes[0]!.portRates).toEqual({
      [handle("output", "y")]: 1,
      [handle("output", "w", 1)]: 3,
    });
  });

  it("removing section 0 makes section 1 the card's own", () => {
    const out = renumberAfterSectionRemoved(shared(rates), "card", 0);
    expect(out.nodes[0]!.portRates).toEqual({
      [handle("output", "z")]: 2,
      [handle("output", "w", 1)]: 3,
    });
  });

  it("spare bearers follow their section down, and a bearer on the removed one goes", () => {
    const p: FactoryProject = {
      ...shared(),
      spareShares: {
        [keyOf("card#r1", "card#r2")]: { [outKey("card#r1", "z")]: 0.25, [outKey("card#r2", "w")]: 0.75 },
        [makeLeftoverKey([outKey("card", "y"), outKey("card#r2", "w"), outKey("card#r1", "z")])]: {
          [outKey("card", "y")]: 0.2,
          [outKey("card#r2", "w")]: 0.3,
          [outKey("card#r1", "z")]: 0.5,
        },
      },
    };
    const out = renumberAfterSectionRemoved(p, "card", 1).spareShares!;
    // the two-bearer split loses one bearer and is gone; the three-bearer one keeps two
    expect(Object.keys(out)).toEqual([makeLeftoverKey([outKey("card", "y"), outKey("card#r1", "w")])]);
    expect(Object.values(out)[0]).toEqual({ [outKey("card", "y")]: 0.2, [outKey("card#r1", "w")]: 0.3 });
  });

  it("swapping two sections swaps their rates and bearers", () => {
    const p: FactoryProject = {
      ...shared(rates),
      spareShares: {
        [keyOf("card#r1", "card#r2")]: { [outKey("card#r1", "z")]: 0.25, [outKey("card#r2", "w")]: 0.75 },
      },
    };
    const out = renumberAfterSectionsSwapped(p, "card", 1, 2);
    expect(out.nodes[0]!.portRates).toEqual({
      [handle("output", "y")]: 1,
      [handle("output", "z", 2)]: 2,
      [handle("output", "w", 1)]: 3,
    });
    expect(Object.values(out.spareShares!)[0]).toEqual({
      [outKey("card#r2", "z")]: 0.25,
      [outKey("card#r1", "w")]: 0.75,
    });
  });

  it("combining cards moves the absorbed cards' rates and bearers under the host's section numbers", () => {
    const p = project({
      recipes,
      nodes: [
        node("host", "a", { portRates: { [handle("output", "y")]: 1 } }),
        node("other", "b", { extraRecipes: [{ recipeId: "c" }], portRates: { [handle("output", "z")]: 2, [handle("output", "w", 1)]: 3 } }),
      ],
      extra: {
        spareShares: {
          [makeLeftoverKey([outKey("host", "y"), outKey("other#r1", "w")])]: {
            [outKey("host", "y")]: 0.5,
            [outKey("other#r1", "w")]: 0.5,
          },
        },
      },
    });
    // other's sections 0 and 1 become host's 1 and 2
    const out = rehomeSectionFields(p, "host", new Map([["other", new Map([[0, 1], [1, 2]])]]));
    expect(out.nodes.find((n) => n.id === "host")!.portRates).toEqual({
      [handle("output", "y")]: 1,
      [handle("output", "z", 1)]: 2,
      [handle("output", "w", 2)]: 3,
    });
    expect(Object.values(out.spareShares!)[0]).toEqual({
      [outKey("host", "y")]: 0.5,
      [outKey("host#r2", "w")]: 0.5,
    });
  });
});

describe("the store keeps them true", () => {
  afterEach(() => setSolveCore(undefined));
  beforeEach(() => {
    setSolveCore(() => ({
      kind: "failed",
      failure: { message: "NO_PIN", args: [] },
      notes: [],
      drawers: { rates: {}, unmet: [], shortfalls: [], ports: {} },
    }));
    const p = shared({
      [handle("output", "y")]: 1,
      [handle("output", "z", 1)]: 2,
      [handle("output", "w", 2)]: 3,
    });
    useFactoryStore.getState().setProject({
      ...p,
      spareShares: {
        [makeLeftoverKey([outKey("card#r1", "z"), outKey("card#r2", "w"), outKey("card", "y")])]: {
          [outKey("card#r1", "z")]: 0.4,
          [outKey("card#r2", "w")]: 0.4,
          [outKey("card", "y")]: 0.2,
        },
      },
    });
  });

  it("removeRecipeSection renumbers port rates and spare splits", () => {
    useFactoryStore.getState().removeRecipeSection("card", 1);
    const { project: out } = useFactoryStore.getState();
    expect(out.nodes[0]!.portRates).toEqual({
      [handle("output", "y")]: 1,
      [handle("output", "w", 1)]: 3,
    });
    expect(Object.values(out.spareShares ?? {})[0]).toEqual({
      [outKey("card#r1", "w")]: 0.4,
      [outKey("card", "y")]: 0.2,
    });
  });

  it("moveRecipeSection swaps them", () => {
    useFactoryStore.getState().moveRecipeSection("card", 1, 1);
    const { project: out } = useFactoryStore.getState();
    expect(out.nodes[0]!.portRates).toEqual({
      [handle("output", "y")]: 1,
      [handle("output", "z", 2)]: 2,
      [handle("output", "w", 1)]: 3,
    });
  });

  it("deleting the card drops the splits that named it", () => {
    useFactoryStore.getState().deleteNode("card");
    expect(useFactoryStore.getState().project.spareShares).toBeUndefined();
  });
});

describe("a port's rate goes to the drawer wired to it", () => {
  const item = (id: string) => ({ kind: "item", id, amount: 1, displayName: id }) as never;
  afterEach(() => setSolveCore(undefined));
  beforeEach(() => {
    setSolveCore(() => ({
      kind: "failed",
      failure: { message: "NO_PIN", args: [] },
      notes: [],
      drawers: { rates: {}, unmet: [], shortfalls: [], ports: {} },
    }));
  });

  it("an output dragged into space: the new drawer holds it exactly and the port lets go", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n", "a", { portRates: { [handle("output", "y")]: 5000 } })],
      }),
    );
    useFactoryStore
      .getState()
      .addStorageForConnection(item("y"), "n", "output", { x: 300, y: 0 }, handle("output", "y"));
    const { project: out } = useFactoryStore.getState();
    expect(out.nodes[0]!.portRates).toBeUndefined();
    expect(out.storages).toHaveLength(1);
    expect(out.storages![0]).toMatchObject({ targetMode: "exact", targetPerSecond: 5000 });
  });

  it("an input dragged into space: the new source holds it, stored negative", () => {
    useFactoryStore.getState().setProject(
      project({ recipes, nodes: [node("n", "a", { portRates: { [handle("input", "x")]: 3 } })] }),
    );
    useFactoryStore
      .getState()
      .addStorageForConnection(item("x"), "n", "input", { x: -300, y: 0 }, handle("input", "x"));
    const { project: out } = useFactoryStore.getState();
    expect(out.nodes[0]!.portRates).toBeUndefined();
    expect(out.storages![0]).toMatchObject({ targetMode: "exact", targetPerSecond: -3 });
  });

  it("a section's port carries its own rate and leaves the card's others", () => {
    useFactoryStore.getState().setProject(
      shared({ [handle("output", "y")]: 1, [handle("output", "z", 1)]: 2 }),
    );
    useFactoryStore
      .getState()
      .addStorageForConnection(
        item("z"),
        "card",
        "output",
        { x: 300, y: 0 },
        handle("output", "z", 1),
      );
    const { project: out } = useFactoryStore.getState();
    expect(out.nodes[0]!.portRates).toEqual({ [handle("output", "y")]: 1 });
    expect(out.storages![0]).toMatchObject({ targetMode: "exact", targetPerSecond: 2 });
  });

  it("dropped on a drawer with its own rule: the drawer keeps it and the port lets go", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n", "a", { portRates: { [handle("output", "y")]: 5 } })],
        storages: [drawer("d", "y", { targetMode: "at-least", targetPerSecond: 2 })],
      }),
    );
    useFactoryStore
      .getState()
      .connectNodes("n", "d", {
        kind: "item",
        id: "y",
        displayName: "y",
        sourceHandle: handle("output", "y"),
      });
    const { project: out } = useFactoryStore.getState();
    expect(out.edges).toHaveLength(1);
    expect(out.nodes[0]!.portRates).toBeUndefined();
    expect(out.storages![0]).toMatchObject({ targetMode: "at-least", targetPerSecond: 2 });
  });

  it("a wire between two cards leaves both ports' rates alone", () => {
    const p = project({
      recipes,
      nodes: [node("n", "a", { portRates: { [handle("output", "y")]: 5 } }), node("m", "b")],
      edges: [wire("e", "n", "m", "y")],
    });
    expect(movePortRateToDrawer(p, p.edges[0]!)).toBe(p);
  });
});

describe("a drawer deleted off one port gives its rate back", () => {
  const item = (id: string) => ({ kind: "item", id, amount: 1, displayName: id }) as never;
  afterEach(() => setSolveCore(undefined));
  beforeEach(() => {
    setSolveCore(() => ({
      kind: "failed",
      failure: { message: "NO_PIN", args: [] },
      notes: [],
      drawers: { rates: {}, unmet: [], shortfalls: [], ports: {} },
    }));
  });
  const madeDrawer = () => useFactoryStore.getState().project.storages![0]!;

  it("dragged off and deleted: the port has its rate again", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n", "a", { portRates: { [handle("output", "y")]: 5000 } })],
      }),
    );
    useFactoryStore
      .getState()
      .addStorageForConnection(item("y"), "n", "output", { x: 300, y: 0 }, handle("output", "y"));
    useFactoryStore.getState().deleteStorage(madeDrawer().id);
    const { project: out } = useFactoryStore.getState();
    expect(out.storages).toHaveLength(0);
    expect(out.nodes[0]!.portRates).toEqual({ [handle("output", "y")]: 5000 });
  });

  it("deleted with the Delete key (as a selection) too, a source's rate as a positive one", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n", "a")],
        storages: [drawer("d", "x", { targetMode: "at-least", targetPerSecond: -4 })],
        edges: [wire("e", "d", "n", "x", {}, { fromDrawer: true })],
      }),
    );
    useFactoryStore.getState().deleteBoardSelection({ nodeIds: ["d"] });
    expect(useFactoryStore.getState().project.nodes[0]!.portRates).toEqual({
      [handle("input", "x")]: 4,
    });
  });

  it("a cap, a pinned card or a card with a rate of its own takes nothing back", () => {
    const setUp = (extra: Parameters<typeof node>[2], rule: "at-most" | "exactly") => {
      useFactoryStore.getState().setProject(
        project({
          recipes,
          nodes: [node("n", "a", extra)],
          storages: [
            drawer("d", "y", {
              targetMode: rule === "at-most" ? "at-most" : "exact",
              targetPerSecond: 3,
            }),
          ],
          edges: [wire("e", "n", "d", "y", {}, { toDrawer: true })],
        }),
      );
      useFactoryStore.getState().deleteStorage("d");
      return useFactoryStore.getState().project.nodes[0]!;
    };
    expect(setUp({}, "at-most").portRates).toBeUndefined();
    expect(setUp({ solvePin: 2 }, "exactly").portRates).toBeUndefined();
    expect(setUp({ portRates: { [handle("input", "x")]: 1 } }, "exactly").portRates).toEqual({
      [handle("input", "x")]: 1,
    });
  });
});

describe("deleting a middleman drawer with the Delete key heals as its own delete does", () => {
  afterEach(() => setSolveCore(undefined));
  beforeEach(() => {
    setSolveCore(() => ({
      kind: "failed",
      failure: { message: "NO_PIN", args: [] },
      notes: [],
      drawers: { rates: {}, unmet: [], shortfalls: [], ports: {} },
    }));
  });

  it("one maker, two users: the maker is wired to both", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n", "a"), node("m1", "b"), node("m2", "b")],
        storages: [drawer("buf", "y")],
        edges: [
          wire("in", "n", "buf", "y", {}, { toDrawer: true }),
          wire("o1", "buf", "m1", "y", {}, { fromDrawer: true }),
          wire("o2", "buf", "m2", "y", {}, { fromDrawer: true }),
        ],
      }),
    );
    useFactoryStore.getState().deleteBoardSelection({ nodeIds: ["buf"] });
    const { project: out } = useFactoryStore.getState();
    expect(out.storages).toHaveLength(0);
    expect(out.edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(["n>m1", "n>m2"]);
  });

  it("two makers and two users is a choice: the wires go", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n1", "a"), node("n2", "a"), node("m1", "b"), node("m2", "b")],
        storages: [drawer("buf", "y")],
        edges: [
          wire("i1", "n1", "buf", "y", {}, { toDrawer: true }),
          wire("i2", "n2", "buf", "y", {}, { toDrawer: true }),
          wire("o1", "buf", "m1", "y", {}, { fromDrawer: true }),
          wire("o2", "buf", "m2", "y", {}, { fromDrawer: true }),
        ],
      }),
    );
    useFactoryStore.getState().deleteBoardSelection({ nodeIds: ["buf"] });
    expect(useFactoryStore.getState().project.edges).toEqual([]);
  });

  it("deleted with one of its cards: nothing is wired to the card that went", () => {
    useFactoryStore.getState().setProject(
      project({
        recipes,
        nodes: [node("n", "a"), node("m", "b")],
        storages: [drawer("buf", "y")],
        edges: [
          wire("in", "n", "buf", "y", {}, { toDrawer: true }),
          wire("out", "buf", "m", "y", {}, { fromDrawer: true }),
        ],
      }),
    );
    useFactoryStore.getState().deleteBoardSelection({ nodeIds: ["buf", "m"] });
    const { project: out } = useFactoryStore.getState();
    expect(out.nodes.map((n) => n.id)).toEqual(["n"]);
    expect(out.edges).toEqual([]);
  });
});
