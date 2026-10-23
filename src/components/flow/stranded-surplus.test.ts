import { beforeEach, describe, expect, it, vi } from "vitest";
import * as solver from "@/lib/solver";
import type { FactoryProject, ThroughputResult } from "@/lib/model/types";
import { node, project, recipe, wire } from "@/lib/solver/plan/adapter/test-kit";
import { islandCache } from "@/lib/solver/plan/adapter/engine";
import {
  attachStranded,
  carryStranded,
  findStranded,
  forgetStranded,
  withStranded,
} from "./stranded-surplus";
import cbdPlan from "./__fixtures__/stranded/cbd.json";
import loopPlan from "./__fixtures__/stranded/hydrogen-loop.json";

vi.mock("@/lib/solver", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/solver")>();
  return { ...real, calculateThroughput: vi.fn(real.calculateThroughput) };
});

/**
 * Fixtures are real plans, trimmed of art and tooltips (they solve exactly as the originals do):
 * - cbd.json: a crop farm (Up to 118) feeding a distillation tower and four Large Chemical Reactors. The tower makes
 *   Heavy and Light Fuel 300:1000, the fuel reactor takes them 4000:20000, and the heavy reactor's Heavy Fuel output
 *   is wired with no drawer, so every card solves to zero.
 * - hydrogen-loop.json: the same chain on single-block reactors with a wired hydrogen cell loop and a byproduct drawer
 *   (`d_heavy`) for the spare Heavy Fuel. It runs (the crop is CLOGGED by the tower's Up to 1).
 */
const CROP = "node-5fb2f75f-a02b-496a-9fa7-f7685a1e8a75";
const TOWER = "node-2b7d62e3-445f-4288-9514-7286d5aa1313";
const HEAVY_LCR = "node-bbba4208-fadf-4819-be90-87206c39142c";
const HEAVY_FUEL_OUT = `${HEAVY_LCR}|o|output:fluid:liquid_heavy_fuel`;

const cbd = () => structuredClone(cbdPlan) as unknown as FactoryProject;
const loop = () => structuredClone(loopPlan) as unknown as FactoryProject;

function solved(plan: FactoryProject): ThroughputResult {
  const result = solver.calculateThroughput(plan);
  attachStranded(plan, result);
  return result;
}

/** cbd.json with the drawer the notice's key adds: the plan the player ends up with. */
function cbdWithDrawer(): FactoryProject {
  const plan = cbd();
  return {
    ...plan,
    storages: [
      ...(plan.storages ?? []),
      {
        id: "spare",
        kind: "fluid",
        resourceId: "liquid_heavy_fuel",
        drainMode: "byproduct",
        position: { x: 0, y: 0 },
      },
    ],
    edges: [
      ...plan.edges,
      {
        id: "to-spare",
        source: HEAVY_LCR,
        target: "spare",
        resourceKind: "fluid",
        resourceId: "liquid_heavy_fuel",
      },
    ],
  };
}

/** The real solver behind the spy. */
const realSolve = vi.mocked(solver.calculateThroughput).getMockImplementation()!;

/** The loop with the Electrolyzer making `cells` Hydrogen Cells a craft instead of 2: a ring that gains or loses. */
function loopMaking(cells: number): FactoryProject {
  const plan = loop();
  const electro = plan.nodes.find((n) => n.id === "electro")!;
  plan.recipes = plan.recipes.map((r) =>
    r.id === electro.recipeId
      ? {
          ...r,
          outputs: r.outputs.map((o) => (o.id === "gregtech:gt.metaitem.01@30001" ? { ...o, amount: cells } : o)),
        }
      : r,
  );
  return plan;
}

describe("stranded surplus (attachStranded)", () => {
  beforeEach(() => {
    forgetStranded();
    vi.mocked(solver.calculateThroughput).mockClear();
  });

  it("names the Heavy Fuel at the heavy reactor on CBD, with the rate the drawer really takes", () => {
    const result = solved(cbd());
    const stranded = result.plan?.stranded;
    expect(stranded?.vents).toHaveLength(1);
    const vent = stranded!.vents[0]!;
    expect(vent).toMatchObject({
      cardId: HEAVY_LCR,
      portKey: HEAVY_FUEL_OUT,
      resourceKey: "fluid:liquid_heavy_fuel",
      resourceName: "Heavy Fuel",
      fix: { kind: "drawer" },
    });
    expect(vent.perSecond).toBeCloseTo(28.581, 2);
    // Every card on the board is at zero and runs once the drawer is in.
    expect(new Set(vent.stalled)).toEqual(new Set(cbd().nodes.map((n) => n.id)));
    expect(stranded!.stalled).toHaveLength(7);
    // The Up to card carries it too, for its foot line; the answer itself is untouched.
    expect(result.plan?.upTo?.[CROP]).toMatchObject({ reason: "UNUSED", reached: 0 });
    expect(result.plan?.upTo?.[CROP]?.stranded?.portKey).toBe(HEAVY_FUEL_OUT);
    expect(result.plan?.forced).toEqual([]);
    expect(result.nodes[CROP]?.theoreticalMachinesRequired).toBe(0);
  });

  it("takes the rate from the plan with the drawer in, not from the Exactly shadow", () => {
    // With the tower Up to 3 the shadow runs 3 towers and would claim about 41 L/s; the crop can only feed 2.09.
    const plan = cbd();
    plan.nodes = plan.nodes.map((n) => (n.id === TOWER ? { ...n, solvePin: 3 } : n));
    const vent = solved(plan).plan?.stranded?.vents[0];
    expect(vent?.portKey).toBe(HEAVY_FUEL_OUT);
    expect(vent?.perSecond).toBeCloseTo(28.581, 2);
  });

  it("is quiet once the drawer is in: the crop runs full and nothing more is solved", () => {
    const calls = vi.mocked(solver.calculateThroughput);
    const plan = cbdWithDrawer();
    const result = solver.calculateThroughput(plan);
    calls.mockClear();
    attachStranded(plan, result);
    expect(calls).not.toHaveBeenCalled();
    expect(result.plan?.stranded).toBeUndefined();
    expect(result.plan?.upTo?.[CROP]).toMatchObject({ reason: "FULL" });
    expect(result.plan?.upTo?.[CROP]?.reached).toBeCloseTo(118, 6);
    expect(result.nodes[TOWER]?.theoreticalMachinesRequired).toBeCloseTo(2.086, 3);
  });

  it("is quiet on the working hydrogen loop, which runs (its crop is held by the tower's count, not stalled)", () => {
    const calls = vi.mocked(solver.calculateThroughput);
    const plan = loop();
    const result = solver.calculateThroughput(plan);
    calls.mockClear();
    attachStranded(plan, result);
    expect(calls).not.toHaveBeenCalled();
    expect(result.plan?.stranded).toBeUndefined();
    expect(result.plan?.upTo?.crop?.reason).toBe("CLOGGED");
  });

  it("names the reactor's Heavy Fuel when the loop's spare drawer is taken away", () => {
    const plan = loop();
    plan.storages = plan.storages?.filter((s) => s.id !== "d_heavy");
    plan.edges = plan.edges.filter((e) => e.id !== "w16");
    const stranded = solved(plan).plan?.stranded;
    expect(stranded?.vents).toHaveLength(1);
    expect(stranded!.vents[0]).toMatchObject({
      cardId: "crHeavy",
      resourceKey: "fluid:liquid_heavy_fuel",
      fix: { kind: "drawer" },
    });
    expect(stranded!.vents[0]!.perSecond).toBeCloseTo(13.6986, 3);
    expect(stranded!.stalled).toHaveLength(8);
  });

  it("offers a wire, not a drawer, when a card takes the spare from outside instead", () => {
    // The light reactor's Hydrogen Cell input unwired: the Electrolyzer's cells have nowhere to go, and the light
    // reactor brings its own in from outside. One wire is the fix; a drawer would buy what the plan already makes.
    const plan = loop();
    plan.edges = plan.edges.filter((e) => e.id !== "w11");
    const vent = solved(plan).plan?.stranded?.vents[0];
    expect(vent).toMatchObject({
      cardId: "electro",
      resourceKey: "item:gregtech:gt.metaitem.01@30001",
      resourceName: "Hydrogen Cell",
      fix: {
        kind: "wire",
        takerNodeId: "crLight",
        takerCardId: "crLight",
        takerPortKey: "crLight|i|input:item:gregtech%3Agt.metaitem.01%4030001",
      },
    });
    expect(vent?.perSecond).toBeCloseTo(0.022831, 5);
  });

  it("offers each of two spares that only stall the line together", () => {
    // a -> 3h + 10l + 4n + 4m; one mixer takes h:l at 1:5, another n:m at 1:2. Both h and n are spare.
    const plan = project({
      recipes: [
        recipe("make-a", [], [["a", 1]]),
        recipe("tower", [["a", 1]], [["h", 3], ["l", 10], ["n", 4], ["m", 4]]),
        recipe("mix1", [["h", 1], ["l", 5]], [["f1", 1]]),
        recipe("mix2", [["n", 1], ["m", 2]], [["f2", 1]]),
      ],
      nodes: [
        node("src", "make-a", { solvePin: 2 }),
        node("tower", "tower"),
        node("mix1", "mix1"),
        node("mix2", "mix2"),
      ],
      edges: [
        wire("w1", "src", "tower", "a"),
        wire("w2", "tower", "mix1", "h"),
        wire("w3", "tower", "mix1", "l"),
        wire("w4", "tower", "mix2", "n"),
        wire("w5", "tower", "mix2", "m"),
      ],
    });
    const result = solved(plan);
    expect(result.plan?.upTo?.src?.reached).toBe(0);
    const vents = result.plan?.stranded?.vents ?? [];
    expect(vents.map((v) => v.resourceKey).sort()).toEqual(["item:h", "item:n"]);
    expect(vents.find((v) => v.resourceKey === "item:h")?.perSecond).toBeCloseTo(2, 6);
    expect(vents.find((v) => v.resourceKey === "item:n")?.perSecond).toBeCloseTo(4, 6);
  });

  it("offers a wire and a drawer for the rest when the open input takes only part of a spare", () => {
    // a -> 3h + 10l + 6g + 2k + 2j. mix takes h:l at 1:5 (h spare); burn takes g:j at 1:1 and user g:k at 1:1, but
    // user's g input is not wired. Wiring g to user takes 4 of the 12 a second burn leaves, so a drawer takes the rest.
    const plan = project({
      recipes: [
        recipe("make-a", [], [["a", 1]]),
        recipe("tower", [["a", 1]], [["h", 3], ["l", 10], ["g", 6], ["k", 2], ["j", 2]]),
        recipe("mix", [["h", 1], ["l", 5]], [["f", 1]]),
        recipe("burn", [["g", 1], ["j", 1]], [["x", 1]]),
        recipe("use", [["g", 1], ["k", 1]], [["u", 1]]),
      ],
      nodes: [
        node("src", "make-a", { solvePin: 2 }),
        node("tower", "tower"),
        node("mix", "mix"),
        node("burn", "burn"),
        node("user", "use"),
      ],
      edges: [
        wire("w1", "src", "tower", "a"),
        wire("w2", "tower", "mix", "h"),
        wire("w3", "tower", "mix", "l"),
        wire("w4", "tower", "burn", "g"),
        wire("w5", "tower", "burn", "j"),
        wire("w6", "tower", "user", "k"),
      ],
    });
    const result = solved(plan);
    expect(result.plan?.upTo?.src?.reached).toBe(0);
    const vents = (result.plan?.stranded?.vents ?? []).map((v) => ({
      resource: v.resourceKey,
      fix: v.fix.kind,
      perSecond: v.perSecond,
    }));
    // The wire first: it is the missing link; the drawers take what no card on the board can.
    expect(vents[0]).toMatchObject({ resource: "item:g", fix: "wire" });
    expect(vents[0]!.perSecond).toBeCloseTo(4, 6);
    expect(vents.slice(1).map((v) => `${v.resource}:${v.fix}`).sort()).toEqual(["item:g:drawer", "item:h:drawer"]);
    expect(vents.find((v) => v.resource === "item:g" && v.fix === "drawer")!.perSecond).toBeCloseTo(4, 6);
    expect(vents.find((v) => v.resource === "item:h")!.perSecond).toBeCloseTo(2, 6);
  });

  it("stays silent on a line that runs, off plan-mode boards and on stale books", () => {
    // Nothing is stalled on a line that takes everything it makes: no search.
    const takes = project({
      recipes: [recipe("make", [], [["a", 1]]), recipe("use", [["a", 1]], [["b", 1]])],
      nodes: [node("m", "make", { solvePin: 2 }), node("u", "use")],
      edges: [wire("w", "m", "u", "a")],
    });
    expect(solved(takes).plan?.stranded).toBeUndefined();

    const calls = vi.mocked(solver.calculateThroughput);
    const stale = cbd();
    const result = solver.calculateThroughput(stale);
    calls.mockClear();
    attachStranded(stale, { ...result, stale: true });
    attachStranded({ ...stale, planMode: false }, result);
    expect(calls).not.toHaveBeenCalled();
    expect(result.plan?.stranded).toBeUndefined();
  });

  it("names the stalled card's own spare when nothing further on explains the line", () => {
    // A tower at Up to 2 whose two outputs both go to one mixer taking them 1:5: its own h is the spare.
    const plan = project({
      recipes: [recipe("tower", [["a", 1]], [["h", 3], ["l", 10]]), recipe("mix", [["h", 1], ["l", 5]], [["f", 1]])],
      nodes: [node("tw", "tower", { solvePin: 2 }), node("mix", "mix")],
      edges: [wire("w1", "tw", "mix", "h"), wire("w2", "tw", "mix", "l")],
    });
    const result = solved(plan);
    expect(result.plan?.stranded?.vents).toEqual([
      expect.objectContaining({ nodeId: "tw", resourceKey: "item:h", fix: { kind: "drawer" }, stalled: ["tw", "mix"] }),
    ]);
    expect(result.plan?.stranded?.vents[0]?.perSecond).toBeCloseTo(2, 6);
    expect(result.plan?.upTo?.tw?.stranded?.resourceKey).toBe("item:h");
  });

  it("never offers the stalled card's own row when that only lets it run alone", () => {
    // The loop with the spare drawer and the light reactor's wire both gone: the crop's own Oil Berry is forced in
    // the shadow too, but a drawer there runs the crop alone. The two spares further on are the fix.
    const plan = loop();
    plan.storages = plan.storages?.filter((s) => s.id !== "d_heavy");
    plan.edges = plan.edges.filter((e) => !["w16", "w11"].includes(e.id));
    const vents = solved(plan).plan?.stranded?.vents ?? [];
    expect(vents.map((v) => [v.cardId, v.resourceName, v.fix.kind])).toEqual([
      // The missing wire first; a drawer for hydrogen would buy what the plan makes.
      ["electro", "Hydrogen Cell", "wire"],
      ["crHeavy", "Heavy Fuel", "drawer"],
    ]);
    expect(vents[0]!.fix).toMatchObject({ takerCardId: "crLight" });
  });

  it("finds a spare on a shared machine's second recipe, by its own solve node", () => {
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
        node("sh", "other", { extraRecipes: [{ recipeId: "tower" }] }),
        node("mix1", "mix"),
      ],
      edges: [
        wire("w0", "srcx", "sh", "x"),
        wire("w1", "src", "sh", "a", { to: 1 }),
        wire("w2", "sh", "mix1", "h", { from: 1 }),
        wire("w3", "sh", "mix1", "l", { from: 1 }),
      ],
    });
    // The shared card runs its first recipe, so as a card it is never idle: its second recipe is what counts.
    const vents = solved(plan).plan?.stranded?.vents ?? [];
    expect(vents).toEqual([
      expect.objectContaining({ nodeId: "sh#r1", cardId: "sh", portKey: "sh#r1|o|output:item:h", stalled: ["src", "sh", "mix1"] }),
    ]);
  });

  it("names the Electrolyzer's spare cells on a ring that makes more than it uses, and stays silent on one that loses", () => {
    const gains = solved(loopMaking(2.2)).plan;
    expect(gains?.upTo?.crop).toMatchObject({ reached: 0 });
    expect(gains?.stranded?.vents).toEqual([
      expect.objectContaining({ cardId: "electro", resourceName: "Hydrogen Cell", fix: { kind: "drawer" } }),
    ]);
    expect(gains!.stranded!.vents[0]!.perSecond).toBeCloseTo(0.0033, 4);
    expect(gains!.stranded!.stalled).toHaveLength(8);

    // A ring that loses cells needs a supply, not a drawer: nothing to offer.
    expect(solved(loopMaking(1.8)).plan?.stranded).toBeUndefined();

  });

  it("finds the spare on a stalled card's own row when every machine on the line is Up to", () => {
    // The loop with its Heavy Fuel drawer gone and every machine Up to 1: the heavy reactor is itself a stalled Up to
    // card, and its own Heavy Fuel is the spare (its drawer starts the tank and the generator too).
    const allUpTo = loop();
    allUpTo.storages = allUpTo.storages?.filter((s) => s.id !== "d_heavy");
    allUpTo.edges = allUpTo.edges.filter((e) => e.id !== "w16");
    allUpTo.nodes = allUpTo.nodes.map((n) =>
      n.id === "gen" || n.id === "tank" ? n : { ...n, solvePin: n.solvePin ?? 1 },
    );
    const vents = solved(allUpTo).plan?.stranded?.vents ?? [];
    expect(vents).toEqual([
      expect.objectContaining({ cardId: "crHeavy", resourceName: "Heavy Fuel", fix: { kind: "drawer" } }),
    ]);
    expect(vents[0]!.perSecond).toBeCloseTo(13.6986, 3);
  });

  it("drops a candidate whose fix starts nothing", () => {
    const plan = cbd();
    const base = realSolve(plan);
    // The shadow as it is, then a "proof" that starts nothing: the books' own zeros.
    vi.mocked(solver.calculateThroughput).mockImplementationOnce(realSolve).mockImplementationOnce(() => base);
    attachStranded(plan, base);
    expect(base.plan?.stranded).toBeUndefined();
    expect(base.plan?.upTo?.[CROP]?.stranded).toBeUndefined();
  });

  it("offers the drawer when the wire would start nothing", () => {
    const plan = loop();
    plan.edges = plan.edges.filter((e) => e.id !== "w11");
    const base = realSolve(plan);
    // The shadow, then a wire proof that starts nothing; the drawer proof is real.
    vi.mocked(solver.calculateThroughput).mockImplementationOnce(realSolve).mockImplementationOnce(() => base);
    attachStranded(plan, base);
    expect(base.plan?.stranded?.vents).toEqual([
      expect.objectContaining({ cardId: "electro", fix: { kind: "drawer" } }),
    ]);
  });

  it("stays silent when the shadow fails, and never searches a ring's cards", () => {
    const plan = cbd();
    const base = realSolve(plan);
    vi.mocked(solver.calculateThroughput).mockImplementationOnce(() => ({
      ...base,
      plan: { ...base.plan!, failure: { message: "BALANCE_FAILED", args: [] } },
    }));
    attachStranded(plan, base);
    expect(base.plan?.stranded).toBeUndefined();

    const calls = vi.mocked(solver.calculateThroughput);
    calls.mockClear();
    const ringed = realSolve(plan);
    ringed.plan!.loops = [{ kind: "CLOG_LOCK", cards: [CROP], portKeys: [], resourceKeys: [] }];
    calls.mockClear();
    attachStranded(plan, ringed);
    expect(calls).not.toHaveBeenCalled();
    expect(ringed.plan?.stranded).toBeUndefined();
  });

  it("searches only the stalled island, keeps its finding for an edit elsewhere, and leaves the plan's island cache alone", () => {
    // CBD and the working loop on one board: two islands, only CBD stalled.
    const cbdPart = cbd();
    const loopPart = loop();
    const recipeIds = new Set(cbdPart.recipes.map((r) => r.id));
    const board: FactoryProject = {
      ...cbdPart,
      recipes: [...cbdPart.recipes, ...loopPart.recipes.filter((r) => !recipeIds.has(r.id))],
      nodes: [...cbdPart.nodes, ...loopPart.nodes],
      storages: [...(cbdPart.storages ?? []), ...(loopPart.storages ?? [])],
      edges: [...cbdPart.edges, ...loopPart.edges],
    };
    const calls = vi.mocked(solver.calculateThroughput);
    const base = realSolve(board);
    const cached = islandCache.size;
    calls.mockClear();
    attachStranded(board, base);
    // The shadow and the drawer's proof, each of the CBD island alone.
    expect(calls).toHaveBeenCalledTimes(2);
    for (const [probe] of calls.mock.calls) {
      expect(probe.nodes.map((n) => n.id).sort()).toEqual(cbdPart.nodes.map((n) => n.id).sort());
    }
    expect(islandCache.size).toBe(cached);
    const vent = base.plan?.stranded?.vents[0];
    expect(base.plan?.stranded?.vents).toHaveLength(1);
    expect(vent).toMatchObject({ cardId: HEAVY_LCR, portKey: HEAVY_FUEL_OUT });
    expect(vent?.perSecond).toBeCloseTo(28.581, 2);

    // A count changed on the other island: CBD's finding is found again with no solve.
    const edited = {
      ...board,
      nodes: board.nodes.map((n) => (n.id === "tower" ? { ...n, solvePin: 0.5 } : n)),
    };
    const again = realSolve(edited);
    calls.mockClear();
    attachStranded(edited, again);
    expect(calls).not.toHaveBeenCalled();
    expect(again.plan?.stranded?.vents[0]).toMatchObject({ cardId: HEAVY_LCR, portKey: HEAVY_FUEL_OUT });
  });
});

describe("stranded surplus between two books", () => {
  beforeEach(() => forgetStranded());

  it("puts a finding on new books without touching the answer, and takes it off again", () => {
    const plan = cbd();
    const base = solver.calculateThroughput(plan);
    const patch = findStranded(plan, base)!;
    const shown = withStranded(base, patch);
    expect(shown).not.toBe(base);
    expect(shown.nodes).toBe(base.nodes);
    expect(shown.plan?.stranded).toEqual(patch.stranded);
    expect(shown.plan?.upTo?.[CROP]?.stranded).toEqual(patch.upTo[CROP]);
    expect(base.plan?.stranded).toBeUndefined();
    const cleared = withStranded(shown, undefined);
    expect(cleared.plan?.stranded).toBeUndefined();
    expect(cleared.plan?.upTo?.[CROP]?.stranded).toBeUndefined();
    expect(cleared.plan?.upTo?.[CROP]?.reason).toBe("UNUSED");
  });

  it("carries the last finding onto books still being searched while its cards stay stalled, and drops it once they run", () => {
    const plan = cbd();
    const before = solver.calculateThroughput(plan);
    attachStranded(plan, before);
    // The same line, a count edited, its search not back yet.
    const edited = { ...plan, nodes: plan.nodes.map((n) => (n.id === TOWER ? { ...n, solvePin: 3 } : n)) };
    const next = solver.calculateThroughput(edited);
    const carried = carryStranded(before, { ...next, plan: { ...next.plan!, strandedPending: true } });
    expect(carried.plan?.strandedPending).toBe(true);
    expect(carried.plan?.stranded?.vents.map((v) => v.portKey)).toEqual([HEAVY_FUEL_OUT]);
    expect(carried.plan?.upTo?.[CROP]?.stranded?.portKey).toBe(HEAVY_FUEL_OUT);

    // The drawer went in: the crop runs, so nothing is carried.
    const fixed = solver.calculateThroughput(cbdWithDrawer());
    expect(carryStranded(before, fixed)).toBe(fixed);
    // Nothing to carry from books with no finding, or from none.
    expect(carryStranded(fixed, next)).toBe(next);
    expect(carryStranded(undefined, next)).toBe(next);
  });
});
