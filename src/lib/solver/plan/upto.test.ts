/**
 * The Up to rule in the engine (docs/up-to.md): the guard, the push, the drawer relaxation naming the card, and the
 * read-out (`SolutionView.upTo`). Hand-built plans; every machine runs a craft a second per machine unless it says
 * otherwise. Determinism is checked by solving every plan again with the columns in reverse order.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../lp-engine";
import { differences } from "./__fixtures__/compare";
import { loadInput } from "./__fixtures__/load";
import { SolveContext } from "./context";
import { evaluateSupportWith, resolveChoice } from "./enumerate";
import { setColumnOrder, takeLpCount } from "./lp";
import { MAX_READOUT_LPS, readoutBudget } from "./readout";
import { runChain, solvePiece } from "./solve-core";
import { planExtensions, solvePlan } from "./solve-plan";
import { levels } from "./trade";
import type {
  Answer,
  DrawerRule,
  EdgeIn,
  MachineIn,
  Note,
  PoolIn,
  PortRef,
  SolutionView,
  SolveInput,
  UpToReadout,
} from "./types";

beforeAll(async () => {
  await initLpEngine();
});

const port = (resource: number, name: string, amount = 1) => ({
  amount,
  chance: 1,
  multiplier: 1,
  resource,
  name,
  free: false,
});

/** `exact` > 0 pins the count exactly (`countFixed`); an Up to count is a pool (`upTo`). */
function machine(
  id: string,
  inputs: ReturnType<typeof port>[],
  outputs: ReturnType<typeof port>[],
  exact = 0,
  durationTicks = 20,
): MachineIn {
  return {
    id,
    name: id,
    durationTicks,
    energyPerTick: 0,
    throughputFactor: 1,
    inputs,
    outputs,
    countFixed: exact > 0,
    machineCount: Math.max(1, exact),
    targetOutputRates: {},
    targetInputRates: {},
  };
}

const edge = (
  id: string,
  source: string,
  sourceOutput: number,
  target: string,
  targetInput: number,
): EdgeIn => ({
  id,
  source,
  sourceOutput,
  target,
  targetInput,
});

const upTo = (machines: string[], capacity: number): PoolIn => ({
  machines,
  capacity,
  exact: false,
  upTo: true,
});

function plan(
  machines: MachineIn[],
  edges: EdgeIn[],
  pools: PoolIn[],
  extra: Partial<SolveInput> = {},
): SolveInput {
  return {
    mode: "AUTO",
    choice: null,
    machines,
    edges,
    pools,
    drawers: [],
    extentPins: {},
    spares: {},
    ...extra,
  };
}

function solved(i: SolveInput): Extract<Answer, { kind: "solved" }> {
  const answer = solvePlan(i);
  if (answer.kind !== "solved") throw new Error(`failed: ${JSON.stringify(answer.failure)}`);
  return answer;
}

function readoutOf(s: SolutionView, node: string): UpToReadout {
  const found = s.upTo?.find((r) => r.node === node);
  if (!found) throw new Error(`no read-out for ${node}: ${JSON.stringify(s.upTo)}`);
  return found;
}

const ref = (node: string, portIndex: number, input: boolean): PortRef => ({
  node,
  port: portIndex,
  input,
});

function findNote(n: Note, message: string): Note | null {
  if (n.message === message) return n;
  for (const a of n.args) {
    for (const x of Array.isArray(a) ? a : [a]) {
      if (typeof x === "object" && x !== null) {
        const hit = findNote(x as Note, message);
        if (hit) return hit;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The plans
// ---------------------------------------------------------------------------

/** a (Up to `first`, ore -> x) -> b (Up to `second`, x -> y); ore and y are free ends. */
const chain = (first: number, second: number): SolveInput =>
  plan(
    [machine("a", [port(9, "ore")], [port(1, "x")]), machine("b", [port(1, "x")], [port(2, "y")])],
    [edge("e1", "a", 0, "b", 0)],
    [upTo(["a"], first), upTo(["b"], second)],
  );

/** a (Up to 2) -> b (Up to 2) -> c (Up to 1). */
const chain3 = (): SolveInput =>
  plan(
    [
      machine("a", [port(9, "ore")], [port(1, "x")]),
      machine("b", [port(1, "x")], [port(2, "y")]),
      machine("c", [port(2, "y")], [port(3, "z")]),
    ],
    [edge("e1", "a", 0, "b", 0), edge("e2", "b", 0, "c", 0)],
    [upTo(["a"], 2), upTo(["b"], 2), upTo(["c"], 1)],
  );

/** m (Up to 2) draws its ore from a source giving at most 1/s; n (Up to 2) sends its gears to a product taking at most 1/s. */
const cappedDrawers = (): SolveInput =>
  plan(
    [
      machine("m", [port(9, "ore")], [port(1, "x")]),
      machine("n", [port(8, "dust")], [port(2, "gear")]),
    ],
    [],
    [upTo(["m"], 2), upTo(["n"], 2)],
    {
      drawers: [
        {
          id: "ore",
          label: "ore",
          kind: "SOURCE",
          rule: "AT_MOST",
          rate: 1,
          links: [{ node: "m", port: 0 }],
        },
        {
          id: "gear",
          label: "gear",
          kind: "PRODUCT",
          rule: "AT_MOST",
          rate: 1,
          links: [{ node: "n", port: 0 }],
        },
      ],
    },
  );

/**
 * Two pyrolyse ovens (32 s, 20 tar a craft: 0.625 tar/s each) feed a distillation tower (1 s, 1.875 tar a craft) that
 * could take half as much again as they make.
 */
const benzene = (): SolveInput =>
  plan(
    [
      machine("oven", [port(9, "logs", 16)], [port(1, "wood tar", 20)], 0, 640),
      machine("tower", [port(1, "wood tar", 1.875)], [port(2, "benzene")]),
    ],
    [edge("tar", "oven", 0, "tower", 0)],
    [upTo(["oven"], 2), upTo(["tower"], 1)],
  );

/** An Exactly producer of 1 x/s feeding two Up to 1 consumers; c2 takes `c2Takes` x a craft. */
const sharedProducer = (c2Takes: number): SolveInput =>
  plan(
    [
      machine("c1", [port(1, "x")], [port(2, "y")]),
      machine("c2", [port(1, "x", c2Takes)], [port(3, "z")]),
      machine("e", [], [port(1, "x")], 1),
    ],
    [edge("e1", "e", 0, "c1", 0), edge("e2", "e", 0, "c2", 0)],
    [upTo(["c1"], 1), upTo(["c2"], 1)],
  );

/** p (Up to 2, ore -> x) -> c (any count, x -> y), with a product drawer asking at least 5 y/s. */
const unreachableDrawer = (): SolveInput =>
  plan(
    [machine("c", [port(1, "x")], [port(2, "y")]), machine("p", [port(9, "ore")], [port(1, "x")])],
    [edge("e1", "p", 0, "c", 0)],
    [upTo(["p"], 2)],
    {
      drawers: [
        {
          id: "d",
          label: "y",
          kind: "PRODUCT",
          rule: "AT_LEAST",
          rate: 5,
          links: [{ node: "c", port: 0 }],
        },
      ],
    },
  );

/** p (Up to 2) -> c (Exactly 3). */
const exactConsumer = (): SolveInput =>
  plan(
    [
      machine("c", [port(1, "x")], [port(2, "y")], 3),
      machine("p", [port(9, "ore")], [port(1, "x")]),
    ],
    [edge("e1", "p", 0, "c", 0)],
    [upTo(["p"], 2)],
  );

/** e (Exactly 3) -> u (Up to 2). */
const exactProducer = (): SolveInput =>
  plan(
    [
      machine("e", [port(9, "ore")], [port(1, "x")], 3),
      machine("u", [port(1, "x")], [port(2, "y")]),
    ],
    [edge("e1", "e", 0, "u", 0)],
    [upTo(["u"], 2)],
  );

/** p (Up to 2) -> q (any count). */
const onlyUpTo = (): SolveInput =>
  plan(
    [machine("p", [port(9, "ore")], [port(1, "x")]), machine("q", [port(1, "x")], [port(2, "y")])],
    [edge("e1", "p", 0, "q", 0)],
    [upTo(["p"], 2)],
  );

const unwired = (): SolveInput =>
  plan([machine("m", [port(9, "ore")], [port(1, "gear")])], [], [upTo(["m"], 3)]);

/** c (Exactly 1) takes all it needs from e (Exactly 1); m (Up to 2) makes x for c too. */
const nothingTakes = (): SolveInput =>
  plan(
    [
      machine("c", [port(1, "x")], [port(2, "y")], 1),
      machine("e", [], [port(1, "x")], 1),
      machine("m", [port(9, "ore")], [port(1, "x")]),
    ],
    [edge("e1", "m", 0, "c", 0), edge("e2", "e", 0, "c", 0)],
    [upTo(["m"], 2)],
  );

/** A shared machine: a lathe (ore -> 2 gears) and an assembler (gear -> kit) sharing up to 4 machines. */
const sharedPool = (): SolveInput =>
  plan(
    [
      machine("assembler", [port(1, "gear")], [port(2, "kit")]),
      machine("lathe", [port(0, "ore")], [port(1, "gear", 2)]),
    ],
    [edge("gear", "lathe", 0, "assembler", 0)],
    [upTo(["lathe", "assembler"], 4)],
  );

/**
 * e (Exactly 1) makes 2 x/s; a (any count) turns x into y; b (Exactly 1) takes 1 y/s. The spare leaves at a's output
 * (the default) or at e's (the alternative). u (Up to 3, free ends) shares e's seed drawer, so it is on the same island.
 */
const withAlternatives = (choice: PortRef[] | null = null): SolveInput =>
  plan(
    [
      machine("a", [port(1, "x")], [port(2, "y")]),
      machine("b", [port(2, "y")], [port(3, "z")], 1),
      machine("e", [port(8, "seed")], [port(1, "x", 2)], 1),
      machine("u", [port(8, "seed")], [port(4, "w")]),
    ],
    [edge("e1", "e", 0, "a", 0), edge("e2", "a", 0, "b", 0)],
    [upTo(["u"], 3)],
    {
      choice,
      drawers: [
        {
          id: "seed",
          label: "seed",
          kind: "SOURCE",
          rule: "ANY",
          rate: 0,
          links: [
            { node: "e", port: 0 },
            { node: "u", port: 0 },
          ],
        },
      ],
    },
  );

/** chain(2, 1) and chain(1, 3) side by side, ids interleaved. */
const twoIslands = (): SolveInput =>
  plan(
    [
      machine("a1", [port(9, "ore")], [port(1, "x")]),
      machine("a2", [port(9, "ore")], [port(1, "x")]),
      machine("b1", [port(1, "x")], [port(2, "y")]),
      machine("b2", [port(1, "x")], [port(2, "y")]),
    ],
    [edge("e1", "a1", 0, "b1", 0), edge("e2", "a2", 0, "b2", 0)],
    [upTo(["a1"], 2), upTo(["a2"], 1), upTo(["b1"], 1), upTo(["b2"], 3)],
  );

/**
 * Old Build's loop top-up, converted: m (Up to 2, x -> y) and r (Up to 3, y -> half an x) in a loop on the x wire, with
 * a source drawer (`rule`, `rate`) on m's x input and a byproduct drawer on r's x output, both on wired ports.
 */
const toppedLoop = (rule: DrawerRule = "ANY", rate = 0): SolveInput =>
  plan(
    [
      machine("m", [port(1, "x")], [port(2, "y")]),
      machine("r", [port(2, "y")], [port(1, "x", 0.5)]),
    ],
    [edge("y", "m", 0, "r", 0), edge("x", "r", 0, "m", 0)],
    [upTo(["m"], 2), upTo(["r"], 3)],
    {
      drawers: [
        { id: "top-up", label: "x", kind: "SOURCE", rule, rate, links: [{ node: "m", port: 0 }] },
        {
          id: "spare",
          label: "x",
          kind: "BYPRODUCT",
          rule: "ANY",
          rate: 0,
          links: [{ node: "r", port: 0 }],
        },
      ],
    },
  );

/**
 * The topped loop on an island that must also trade, so the fast path cannot settle it and the trades do: e (Exactly 1)
 * makes 1 z/s for k (Exactly 1, half a z a craft), the spare half sold at e. A seed drawer of any rate on e's and r's
 * unwired inputs puts them on one island.
 */
const toppedLoopTrading = (): SolveInput => {
  const loop = toppedLoop();
  return {
    ...loop,
    machines: [
      machine("e", [port(8, "seed")], [port(5, "z")], 1),
      machine("k", [port(5, "z", 0.5)], [], 1),
      loop.machines[0]!,
      { ...loop.machines[1]!, inputs: [...loop.machines[1]!.inputs, port(8, "seed")] },
    ],
    edges: [...loop.edges, edge("z", "e", 0, "k", 0)],
    drawers: [
      ...loop.drawers,
      {
        id: "seed",
        label: "seed",
        kind: "SOURCE",
        rule: "ANY",
        rate: 0,
        links: [
          { node: "e", port: 0 },
          { node: "r", port: 1 },
        ],
      },
    ],
  };
};

/** p (Up to 2, ore -> x) -> `taker` (x -> y), with a byproduct drawer on p's wired x output. */
const banked = (taker: "any" | "upTo"): SolveInput =>
  plan(
    [machine("p", [port(9, "ore")], [port(1, "x")]), machine("q", [port(1, "x")], [port(2, "y")])],
    [edge("e1", "p", 0, "q", 0)],
    taker === "upTo" ? [upTo(["p"], 2), upTo(["q"], 1)] : [upTo(["p"], 2)],
    {
      drawers: [
        {
          id: "spare",
          label: "x",
          kind: "BYPRODUCT",
          rule: "ANY",
          rate: 0,
          links: [{ node: "p", port: 0 }],
        },
      ],
    },
  );

/** m (Up to 2, ore -> x) puts its x into a buffer (`rule`, `rate`) that t (x -> y; Up to 1 or any count) draws from. */
const buffered = (taker: "upTo" | "any", rule: DrawerRule = "ANY", rate = 0): SolveInput =>
  plan(
    [machine("m", [port(9, "ore")], [port(1, "x")]), machine("t", [port(1, "x")], [port(2, "y")])],
    [],
    taker === "upTo" ? [upTo(["m"], 2), upTo(["t"], 1)] : [upTo(["m"], 2)],
    {
      drawers: [
        {
          id: "buf",
          label: "x",
          kind: "BUFFER",
          rule,
          rate,
          links: [{ node: "m", port: 0 }],
          takers: [{ node: "t", port: 0 }],
        },
      ],
    },
  );

/**
 * s (Up to `feeder`, ore -> x) feeds m (Up to 2, x -> y), whose y goes to a product drawer taking at most 1/s. With
 * `feeder` 1, m is held at half by both ends at once; with 1.5 its output is the tighter.
 */
const twoSided = (feeder: number): SolveInput =>
  plan(
    [machine("m", [port(1, "x")], [port(2, "y")]), machine("s", [port(9, "ore")], [port(1, "x")])],
    [edge("x", "s", 0, "m", 0)],
    [upTo(["m"], 2), upTo(["s"], feeder)],
    {
      drawers: [
        {
          id: "out",
          label: "y",
          kind: "PRODUCT",
          rule: "AT_MOST",
          rate: 1,
          links: [{ node: "m", port: 0 }],
        },
      ],
    },
  );

/** p1 and p2 (Up to 1, 1 x/s each) feed c (Up to 1, 3 x a craft): c could take half as much again as both make. */
const twoProducers = (): SolveInput =>
  plan(
    [
      machine("c", [port(1, "x", 3)], [port(2, "y")]),
      machine("p1", [port(9, "ore")], [port(1, "x")]),
      machine("p2", [port(9, "ore")], [port(1, "x")]),
    ],
    [edge("x1", "p1", 0, "c", 0), edge("x2", "p2", 0, "c", 0)],
    [upTo(["c"], 1), upTo(["p1"], 1), upTo(["p2"], 1)],
  );

/** m (Up to 2) takes x and w, 1 a craft each, from e1 and e2 (Exactly 1, 1/s each): both inputs short at once. */
const twoShortInputs = (): SolveInput =>
  plan(
    [
      machine("e1", [], [port(1, "x")], 1),
      machine("e2", [], [port(2, "w")], 1),
      machine("m", [port(1, "x"), port(2, "w")], [port(3, "y")]),
    ],
    [edge("x", "e1", 0, "m", 0), edge("w", "e2", 0, "m", 1)],
    [upTo(["m"], 2)],
  );

/** n (Up to 2) makes y and v, 1 a craft each, for c1 and c2 (Exactly 1, 1/s each): both outputs full at once. */
const twoFullOutputs = (): SolveInput =>
  plan(
    [
      machine("c1", [port(2, "y")], [], 1),
      machine("c2", [port(3, "v")], [], 1),
      machine("n", [port(9, "ore")], [port(2, "y"), port(3, "v")]),
    ],
    [edge("y", "n", 0, "c1", 0), edge("v", "n", 1, "c2", 0)],
    [upTo(["n"], 2)],
  );

const FIXTURES: Record<string, () => SolveInput> = {
  "chain, second slower": () => chain(2, 1),
  "chain, first slower": () => chain(2, 3),
  "chain of three": chain3,
  "capped drawers": cappedDrawers,
  benzene,
  "shared producer": () => sharedProducer(1),
  "stage A": () => sharedProducer(2),
  "unreachable drawer": unreachableDrawer,
  "exact consumer": exactConsumer,
  "exact producer": exactProducer,
  "only Up to": onlyUpTo,
  unwired,
  "nothing takes": nothingTakes,
  "shared pool": sharedPool,
  alternatives: () => withAlternatives(),
  "two islands": twoIslands,
  "topped loop": () => toppedLoop(),
  "topped loop, capped": () => toppedLoop("AT_MOST", 0.5),
  "topped loop, trading": toppedLoopTrading,
  "banked, any taker": () => banked("any"),
  "banked, Up to taker": () => banked("upTo"),
  "buffer, Up to taker": () => buffered("upTo"),
  "buffer, any taker": () => buffered("any"),
  "buffer with a rule": () => buffered("upTo", "AT_MOST", 0.5),
  "two-sided, tied": () => twoSided(1),
  "two-sided, output tighter": () => twoSided(1.5),
  "two producers": twoProducers,
  "two short inputs": twoShortInputs,
  "two full outputs": twoFullOutputs,
};

// ---------------------------------------------------------------------------
// The push and the reasons
// ---------------------------------------------------------------------------

describe("Up to: the push and the read-out", () => {
  it("a chain whose second step is slower: the first CLOGGED at its pace, the second FULL", () => {
    const s = solved(chain(2, 1)).solution;
    expect(s.machineCounts["a"]).toBeCloseTo(1, 9);
    expect(s.machineCounts["b"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "a")).toEqual({
      node: "a",
      machines: ["a"],
      capacity: 2,
      reached: expect.closeTo(1, 9),
      reason: "CLOGGED",
      port: ref("a", 0, false),
    });
    expect(readoutOf(s, "b")).toMatchObject({ reason: "FULL", reached: expect.closeTo(1, 9) });
    expect(s.gatedSources).toEqual([]);
    expect(s.gatedSinks).toEqual([]);
  });

  it("the mirrored chain: the second STARVED with the first upstream, the first a BOTTLENECK wanting 3", () => {
    const s = solved(chain(2, 3)).solution;
    expect(readoutOf(s, "a")).toMatchObject({
      reason: "BOTTLENECK",
      reached: expect.closeTo(2, 9),
      wants: expect.closeTo(3, 9),
    });
    expect(readoutOf(s, "b")).toEqual({
      node: "b",
      machines: ["b"],
      capacity: 3,
      reached: expect.closeTo(2, 9),
      reason: "STARVED",
      port: ref("b", 0, true),
      upstream: ["a"],
    });
  });

  it("benzene: the ovens are the bottleneck and want 3; the tower is starved by them at two thirds", () => {
    const s = solved(benzene()).solution;
    expect(s.machineCounts["oven"]).toBeCloseTo(2, 9);
    expect(s.machineCounts["tower"]).toBeCloseTo(2 / 3, 9);
    expect(readoutOf(s, "oven")).toMatchObject({
      reason: "BOTTLENECK",
      wants: expect.closeTo(3, 9),
    });
    expect(readoutOf(s, "tower")).toMatchObject({
      reason: "STARVED",
      port: ref("tower", 0, true),
      upstream: ["oven"],
    });
  });

  it("two Up to consumers an Exactly producer cannot both feed: equal levels, both STARVED", () => {
    const s = solved(sharedProducer(1)).solution;
    expect(s.machineCounts["c1"]).toBeCloseTo(0.5, 9);
    expect(s.machineCounts["c2"]).toBeCloseTo(0.5, 9);
    for (const c of ["c1", "c2"]) {
      const r = readoutOf(s, c);
      expect(r).toMatchObject({ reason: "STARVED", port: ref(c, 0, true) });
      // The producer is pinned Exactly: no Up to card upstream to act on.
      expect(r.upstream).toBeUndefined();
    }
    expect(s.gatedSinks).toEqual([]);
  });

  it("stage A runs first: the consumer that does more with the same supply runs full (plain max-min: both at a third)", () => {
    const s = solved(sharedProducer(2)).solution;
    expect(s.machineCounts["c1"]).toBeCloseTo(1, 9);
    expect(s.machineCounts["c2"]).toBeCloseTo(0, 9);
    expect(readoutOf(s, "c1").reason).toBe("FULL");
    expect(readoutOf(s, "c2")).toMatchObject({
      reason: "STARVED",
      port: ref("c2", 0, true),
      reached: expect.closeTo(0, 9),
    });
    expect(s.unneeded).toEqual([]);
  });

  it("a drawer rate the Up to producer cannot reach falls short, names the card, and opens no forced input", () => {
    const s = solved(unreachableDrawer()).solution;
    expect(s.machineCounts["p"]).toBeCloseTo(2, 6);
    expect(s.machineCounts["c"]).toBeCloseTo(2, 6);
    expect(s.gatedSources).toEqual([]);
    expect(s.gatedSinks).toEqual([]);
    expect(s.drawers.unmet).toEqual(["d"]);
    expect(s.drawers.shortfalls).toEqual([
      {
        drawer: "d",
        rule: "AT_LEAST",
        target: 5,
        reachable: expect.closeTo(2, 6),
        limitingNodes: ["p"],
        limitingDrawers: [],
        limitingGroups: 0,
      },
    ]);
    const limited = s.notes
      .filter((n) => n.message === "DRAWER_LIMITED_BY")
      .map((n) => n.args[1] as Note);
    expect(limited).toEqual([
      { message: "LIMIT_PIN", args: ["p", { message: "PIN_UP_TO", args: [] }] },
    ]);
    // What it would take to meet the drawer.
    expect(readoutOf(s, "p")).toMatchObject({ reason: "BOTTLENECK", wants: expect.closeTo(5, 6) });
  });

  it("an Exactly consumer downstream of an Up to producer: the gap is a forced input, and the producer wants it", () => {
    const s = solved(exactConsumer()).solution;
    expect(s.machineCounts["p"]).toBeCloseTo(2, 9);
    expect(s.gatedSources).toEqual([
      { port: ref("c", 0, true), ratePerSecond: expect.closeTo(1, 9) },
    ]);
    expect(readoutOf(s, "p")).toMatchObject({
      reason: "BOTTLENECK",
      reached: expect.closeTo(2, 9),
      wants: expect.closeTo(3, 9),
    });
  });

  it("an Exactly producer upstream of an Up to consumer: its surplus is a forced output, the consumer FULL", () => {
    const s = solved(exactProducer()).solution;
    expect(s.machineCounts["u"]).toBeCloseTo(2, 9);
    expect(s.gatedSinks).toEqual([
      { port: ref("e", 0, false), ratePerSecond: expect.closeTo(1, 9) },
    ]);
    expect(readoutOf(s, "u").reason).toBe("FULL");
  });

  it("only Up to counts: the plan is anchored (no NO_PIN) and nothing in it is unneeded", () => {
    expect(new SolveContext(onlyUpTo()).anchored).toBe(true);
    const s = solved(onlyUpTo()).solution;
    expect(s.machineCounts["p"]).toBeCloseTo(2, 9);
    expect(s.machineCounts["q"]).toBeCloseTo(2, 9);
    expect(s.unneeded).toEqual([]);
    expect(readoutOf(s, "p").reason).toBe("FULL");
  });

  it("an Up to machine with no wires runs at its count: FULL", () => {
    const s = solved(unwired()).solution;
    expect(s.upTo).toEqual([
      { node: "m", machines: ["m"], capacity: 3, reached: expect.closeTo(3, 9), reason: "FULL" },
    ]);
  });

  it("a machine nothing takes from: UNUSED at zero, and never in unneeded", () => {
    const s = solved(nothingTakes()).solution;
    expect(s.machineCounts["m"]).toBe(0);
    expect(s.unneeded).toEqual([]);
    expect(readoutOf(s, "m")).toMatchObject({
      reason: "UNUSED",
      reached: 0,
      port: ref("m", 0, false),
    });
  });

  it("a shared Up to machine runs at its capacity across its recipes", () => {
    const s = solved(sharedPool()).solution;
    expect(s.machineCounts["lathe"]).toBeCloseTo(4 / 3, 9);
    expect(s.machineCounts["assembler"]).toBeCloseTo(8 / 3, 9);
    expect(s.upTo).toEqual([
      {
        node: "lathe",
        machines: ["lathe", "assembler"],
        capacity: 4,
        reached: expect.closeTo(4, 9),
        reason: "FULL",
      },
    ]);
  });

  it("a three-step chain held by its last step: both feeders CLOGGED, not pinned from both sides", () => {
    const s = solved(chain3()).solution;
    for (const id of ["a", "b"]) {
      expect(s.machineCounts[id]).toBeCloseTo(1, 9);
      expect(readoutOf(s, id)).toMatchObject({ reason: "CLOGGED", port: ref(id, 0, false) });
    }
    expect(readoutOf(s, "c").reason).toBe("FULL");
  });

  it("capped drawers on unwired ports: lifting a source's cap shows STARVED, a product's cap CLOGGED", () => {
    const s = solved(cappedDrawers()).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(1, 9);
    expect(s.machineCounts["n"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "m")).toMatchObject({ reason: "STARVED", port: ref("m", 0, true) });
    expect(readoutOf(s, "n")).toMatchObject({ reason: "CLOGGED", port: ref("n", 0, false) });
  });

  it("a plan without Up to pools has no read-out", () => {
    const i = chain(2, 1);
    const s = solved({
      ...i,
      pools: i.pools.map((p) => ({ ...p, exact: true, upTo: false })),
    }).solution;
    expect("upTo" in s).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Alternatives, islands, the pin diagnosis, the budget
// ---------------------------------------------------------------------------

describe("Up to: a drawer on a wired port is the player's own end", () => {
  it("a source drawer of any rate tops up a loop: the machine runs at its count, drawing the least that does it", () => {
    const s = solved(toppedLoop()).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(2, 9);
    expect(s.machineCounts["r"]).toBeCloseTo(2, 9);
    // r's half an x a craft goes back into m before anything is drawn (recycle before importing), none to the spare.
    expect(s.drawers.rates["top-up"]).toBeCloseTo(1, 9);
    expect(s.drawers.rates["spare"]).toBeCloseTo(0, 9);
    expect(s.edgeFlowsPerSecond["x"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "m")).toMatchObject({ reason: "BOTTLENECK", wants: expect.closeTo(3, 9) });
    expect(readoutOf(s, "r")).toMatchObject({
      reason: "STARVED",
      port: ref("r", 0, true),
      upstream: ["m"],
    });
  });

  it("the same where the trades settle it: they hold only forced flow, never the drawer's supply", () => {
    const s = solved(toppedLoopTrading()).solution;
    expect(s.gatedSinks).toEqual([
      { port: ref("e", 0, false), ratePerSecond: expect.closeTo(0.5, 9) },
    ]);
    expect(s.machineCounts["m"]).toBeCloseTo(2, 9);
    expect(s.machineCounts["r"]).toBeCloseTo(2, 9);
    expect(s.drawers.rates["top-up"]).toBeCloseTo(1, 9);
    expect(s.drawers.rates["spare"]).toBeCloseTo(0, 9);
  });

  it("a capped source drawer: the machine reaches what it allows, and is STARVED at the drawer's port", () => {
    const s = solved(toppedLoop("AT_MOST", 0.5)).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(1, 9);
    expect(s.machineCounts["r"]).toBeCloseTo(1, 9);
    expect(s.drawers.rates["top-up"]).toBeCloseTo(0.5, 9);
    expect(s.drawers.rates["spare"]).toBeCloseTo(0, 9);
    expect(readoutOf(s, "m")).toMatchObject({ reason: "STARVED", port: ref("m", 0, true) });
  });

  it("a byproduct drawer is permission to run: what a taker can use goes to it first (ship before banking)", () => {
    const any = solved(banked("any")).solution;
    expect(any.machineCounts["p"]).toBeCloseTo(2, 9);
    expect(any.machineCounts["q"]).toBeCloseTo(2, 9);
    expect(any.drawers.rates["spare"]).toBeCloseTo(0, 9);
    const full = solved(banked("upTo")).solution;
    expect(full.machineCounts["p"]).toBeCloseTo(2, 9);
    expect(full.machineCounts["q"]).toBeCloseTo(1, 9);
    expect(full.drawers.rates["spare"]).toBeCloseTo(1, 9);
    expect(readoutOf(full, "p").reason).toBe("FULL");
    expect(readoutOf(full, "q").reason).toBe("FULL");
  });

  it("the trade levels (and the alternatives' ranks) leave a drawer's ports out only with Up to pools", () => {
    const traded = (i: SolveInput) => {
      const ctx = new SolveContext(i);
      return { drawn: [...ctx.drawnPorts], ports: levels(ctx).flatMap((l) => l.ports) };
    };
    const up = traded(toppedLoop());
    expect(up.drawn).toHaveLength(2);
    for (const p of up.drawn) expect(up.ports).not.toContain(p);
    const exact = toppedLoop();
    const plain = traded({
      ...exact,
      pools: exact.pools.map((p) => ({ ...p, exact: true, upTo: false })),
    });
    for (const p of plain.drawn) expect(plain.ports).toContain(p);
  });
});

describe("Up to: a buffer of any rule banks what its takers do not take", () => {
  it("a slower Up to taker: the maker runs full, the taker full, the buffer banks the rest, nothing forced", () => {
    const s = solved(buffered("upTo")).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(2, 9);
    expect(s.machineCounts["t"]).toBeCloseTo(1, 9);
    expect(s.drawers.banked).toEqual({ buf: expect.closeTo(1, 9) });
    expect(s.drawers.rates["buf"]).toBeCloseTo(1, 9);
    expect(s.drawers.ports["buf"]).toEqual([
      { port: ref("m", 0, false), ratePerSecond: expect.closeTo(1, 9) },
      { port: ref("t", 0, true), ratePerSecond: expect.closeTo(1, 9) },
    ]);
    expect(s.gatedSinks).toEqual([]);
    expect(s.gatedSources).toEqual([]);
    expect(s.openGates).toBe(0);
    expect(readoutOf(s, "m").reason).toBe("FULL");
    expect(readoutOf(s, "t").reason).toBe("FULL");
  });

  it("a taker of any count takes all of it first (ship before banking): nothing banked", () => {
    const s = solved(buffered("any")).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(2, 9);
    expect(s.machineCounts["t"]).toBeCloseTo(2, 9);
    expect(s.drawers.banked).toEqual({ buf: 0 });
    expect(s.gatedSinks).toEqual([]);
  });

  it("a buffer with a rule keeps it over what passes through, and banks nothing", () => {
    const s = solved(buffered("upTo", "AT_MOST", 0.5)).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(0.5, 9);
    expect(s.machineCounts["t"]).toBeCloseTo(0.5, 9);
    expect(s.drawers.banked).toBeUndefined();
    expect(s.gatedSinks).toEqual([]);
    expect(readoutOf(s, "m").reason).toBe("CLOGGED");
  });

  it("without Up to pools a buffer is wiring only: no bank", () => {
    const i = buffered("upTo");
    const ctx = new SolveContext({
      ...i,
      pools: i.pools.map((p) => ({ ...p, exact: true, upTo: false })),
    });
    expect(ctx.bankPorts.size).toBe(0);
  });
});

describe("Up to: the reasons weigh the inputs against the outputs, as old Build does", () => {
  it("held at both ends at once: the input story first, STARVED; its feeder at full is a BOTTLENECK for it", () => {
    const s = solved(twoSided(1)).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "m")).toMatchObject({
      reason: "STARVED",
      port: ref("m", 0, true),
      upstream: ["s"],
    });
    // Nothing downstream of s could use more of it (m's output is capped too), but m is short of what s makes: s
    // wants what m would draw at its count.
    expect(readoutOf(s, "s")).toMatchObject({ reason: "BOTTLENECK", wants: expect.closeTo(2, 9) });
  });

  it("the output strictly tighter: CLOGGED at the capped output, and its feeder CLOGGED behind it", () => {
    const s = solved(twoSided(1.5)).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(1, 9);
    expect(s.machineCounts["s"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "m")).toMatchObject({ reason: "CLOGGED", port: ref("m", 0, false) });
    expect(readoutOf(s, "s")).toMatchObject({ reason: "CLOGGED", port: ref("s", 0, false) });
  });

  it("two producers short of one consumer: both are BOTTLENECKs, the consumer STARVED with both upstream", () => {
    const s = solved(twoProducers()).solution;
    expect(s.machineCounts["c"]).toBeCloseTo(2 / 3, 9);
    expect(readoutOf(s, "c")).toMatchObject({
      reason: "STARVED",
      port: ref("c", 0, true),
      upstream: ["p1", "p2"],
    });
    for (const p of ["p1", "p2"]) {
      expect(readoutOf(s, p)).toMatchObject({ reason: "BOTTLENECK", wants: expect.closeTo(2, 9) });
    }
  });
});

describe("Up to: several ports short at once", () => {
  it("two inputs short together, neither alone: STARVED at the first, the other tied", () => {
    const s = solved(twoShortInputs()).solution;
    expect(s.machineCounts["m"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "m")).toMatchObject({
      reason: "STARVED",
      port: ref("m", 0, true),
      tied: [ref("m", 1, true)],
    });
  });

  it("two outputs full together, neither alone: CLOGGED at the first, the other tied", () => {
    const s = solved(twoFullOutputs()).solution;
    expect(s.machineCounts["n"]).toBeCloseTo(1, 9);
    expect(readoutOf(s, "n")).toMatchObject({
      reason: "CLOGGED",
      port: ref("n", 0, false),
      tied: [ref("n", 1, false)],
    });
  });
});

describe("Up to: wherever a support is settled", () => {
  it("the alternatives and the stored choice push: the Up to card stays at its count on every support", () => {
    const first = solved(withAlternatives());
    expect(first.solution.machineCounts["u"]).toBeCloseTo(3, 9);
    const other = first.alternatives.options.find((o) => o.rank !== "DEFAULT");
    expect(other).toBeDefined();
    expect(other!.opens).toEqual(ref("e", 0, false));

    // evaluateSupport pushes: without it least flow would leave u idle.
    const piece = solvePiece(withAlternatives(), planExtensions);
    const target = resolveChoice(piece.ctx, other!.key.gateAnchors)!;
    const settled = evaluateSupportWith(piece.ctx, target)!;
    const u = piece.ctx.model.machineIndex.get("u")!;
    expect(piece.ctx.countOf(u, settled.point.extents[u]!)).toBeCloseTo(3, 9);
    expect(settled.trades.floors).toHaveLength(1);

    // The stored choice commits that support, pushed, and the read-out reads it.
    const chosen = solved(withAlternatives(other!.key.gateAnchors)).solution;
    expect(chosen.key).toEqual(other!.key);
    expect(chosen.machineCounts["a"]).toBeCloseTo(1, 9);
    expect(chosen.machineCounts["u"]).toBeCloseTo(3, 9);
    expect(readoutOf(chosen, "u").reason).toBe("FULL");
  });

  it("two islands: each island's read-out is its own, merged by node", () => {
    const s = solved(twoIslands()).solution;
    expect(s.upTo!.map((r) => r.node)).toEqual(["a1", "a2", "b1", "b2"]);
    const one = solved(chain(2, 1)).solution;
    const two = solved(chain(1, 3)).solution;
    const renamed = (r: UpToReadout, suffix: string): UpToReadout =>
      JSON.parse(JSON.stringify(r).replace(/"([ab])"/g, `"$1${suffix}"`)) as UpToReadout;
    expect(differences(readoutOf(s, "a1"), renamed(readoutOf(one, "a"), "1"))).toEqual([]);
    expect(differences(readoutOf(s, "b1"), renamed(readoutOf(one, "b"), "1"))).toEqual([]);
    expect(differences(readoutOf(s, "a2"), renamed(readoutOf(two, "a"), "2"))).toEqual([]);
    expect(differences(readoutOf(s, "b2"), renamed(readoutOf(two, "b"), "2"))).toEqual([]);
    expect(readoutOf(s, "a2")).toMatchObject({ reason: "BOTTLENECK", wants: expect.closeTo(3, 9) });
  });

  it("a drawer shortfall is never a pin conflict: the pin diagnosis runs without the guard", () => {
    // e (Exactly 1) and p (Up to 2) feed c; a drawer asks 5 of c's output; f (Exactly 1) is a second pin on the island.
    const i = plan(
      [
        machine("c", [port(1, "x")], [port(2, "y")]),
        machine("e", [port(8, "seed")], [port(1, "x")], 1),
        machine("f", [port(8, "seed")], [port(5, "v")], 1),
        machine("p", [port(9, "ore")], [port(1, "x")]),
      ],
      [edge("e1", "e", 0, "c", 0), edge("e2", "p", 0, "c", 0)],
      [upTo(["p"], 2)],
      {
        drawers: [
          {
            id: "d",
            label: "y",
            kind: "PRODUCT",
            rule: "AT_LEAST",
            rate: 5,
            links: [{ node: "c", port: 0 }],
          },
          {
            id: "seed",
            label: "seed",
            kind: "SOURCE",
            rule: "ANY",
            rate: 0,
            links: [
              { node: "e", port: 0 },
              { node: "f", port: 0 },
            ],
          },
        ],
      },
    );
    const stalled = runChain(new SolveContext(i));
    expect(stalled.kind).toBe("stalled");
    if (stalled.kind === "stalled") expect(findNote(stalled.reason, "PIN_CONFLICT")).toBeNull();
    const s = solved(i).solution;
    expect(s.machineCounts["c"]).toBeCloseTo(3, 6);
    expect(s.gatedSources).toEqual([]);
    expect(s.drawers.shortfalls[0]!.limitingNodes).toEqual(["e", "p"]);
  });

  it("the read-out's work is counted: past its budget a reason is null, in pool order", () => {
    // Ten consumers (Up to 1) each take one of twelve goods a craft from twelve Exactly producers making five a second:
    // each consumer runs at half, short of all twelve together, and its reason takes thirteen models (inputs fed, then
    // each input alone), more than its allowance: the budget (96) runs out on the eighth.
    const goods = Array.from({ length: 12 }, (_, k) => k + 1);
    const ids = Array.from({ length: 10 }, (_, k) => `c${String(k).padStart(2, "0")}`);
    const i = plan(
      [
        ...ids.map((id) =>
          machine(
            id,
            goods.map((g) => port(g, `g${g}`)),
            [port(99, "y")],
          ),
        ),
        ...goods.map((g) => machine(`p${String(g).padStart(2, "0")}`, [], [port(g, `g${g}`)], 5)),
      ],
      ids.flatMap((id) =>
        goods.map((g) => edge(`w${id}-${g}`, `p${String(g).padStart(2, "0")}`, 0, id, g - 1)),
      ),
      ids.map((id) => upTo([id], 1)),
    );
    expect(readoutBudget(ids.length)).toBe(MAX_READOUT_LPS);
    const s = solved(i).solution;
    const reasons = ids.map((id) => readoutOf(s, id).reason);
    expect(reasons).toEqual([...Array<string>(7).fill("STARVED"), null, null, null]);
    for (const id of ids) expect(s.machineCounts[id]).toBeCloseTo(0.5, 9);
  });
});

// ---------------------------------------------------------------------------
// Determinism and work
// ---------------------------------------------------------------------------

/** A corpus plan with every exact count turned into an Up to count. */
function everyCountUpTo(i: SolveInput): SolveInput {
  const pools = [...i.pools];
  const machines = i.machines.map((m) => {
    if (!m.countFixed || !(m.machineCount > 0)) return m;
    pools.push(upTo([m.id], m.machineCount));
    return { ...m, countFixed: false };
  });
  return { ...i, machines, pools };
}

const CORPUS_UP_TO = [
  "oxygen-silicon-loop",
  "titanium-line-tour",
  "glass",
  "buffer-drawers",
  "gtnh-flow-two_decisions",
];

describe("Up to: determinism and work", () => {
  const cases: Array<[string, () => SolveInput]> = [
    ...Object.entries(FIXTURES),
    ...CORPUS_UP_TO.map((name): [string, () => SolveInput] => [
      `${name}, every count Up to`,
      () => everyCountUpTo(loadInput(name)),
    ]),
  ];

  it.each(cases)(
    "%s answers the same solved again and built in reverse column order",
    (_name, make) => {
      const i = make();
      const first = solvePlan(i);
      const again = solvePlan(i);
      setColumnOrder("reverse");
      let reversed: Answer;
      try {
        reversed = solvePlan(i);
      } finally {
        setColumnOrder("forward");
      }
      expect(first.kind).toBe("solved");
      for (const other of [again, reversed]) expect(differences(first, other, 5)).toEqual([]);
    },
  );

  it("counts its work: the same plan runs the same number of LPs, and few of them", () => {
    const counts: Record<string, number> = {};
    for (const [name, make] of Object.entries(FIXTURES)) {
      const i = make();
      takeLpCount();
      solvePlan(i);
      const n = takeLpCount();
      solvePlan(i);
      expect(takeLpCount(), name).toBe(n);
      counts[name] = n;
    }
    // A drawer that carries flow opens a gate, so the alternatives search tries swaps, and each support it settles is
    // pushed again (about ten models): the topped loops' swaps are most of their counts.
    for (const [name, n] of Object.entries(counts)) expect(n, name).toBeLessThanOrEqual(64);
  });
});
