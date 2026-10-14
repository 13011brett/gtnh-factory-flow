/**
 * The solver core against the mod's own tests (TradeRuleTest, SelfLoopTest, the pin diagnosis of SolveModeTest),
 * the portSteps hand check, determinism (SolverPathTest) and the independent check. Corpus goldens live in
 * `__fixtures__/golden.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../lp-engine";
import { differences } from "./__fixtures__/compare";
import { digest } from "./__fixtures__/digest";
import { caseNames, loadInput } from "./__fixtures__/load";
import { SolveContext } from "./context";
import { setColumnOrder, takeLpCount } from "./lp";
import { solveCore } from "./solve-core";
import { tieWeight } from "./tie-weight";
import { levels } from "./trade";
import type {
  DrawerIn,
  DrawerRule,
  EdgeIn,
  External,
  MachineIn,
  Note,
  PoolIn,
  SolutionView,
  SolveInput,
} from "./types";
import { validatePoint } from "./validate";

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

/** A machine making one craft per second per machine (20 ticks). */
function machine(
  id: string,
  name: string,
  inputs: ReturnType<typeof port>[],
  outputs: ReturnType<typeof port>[],
  pinned = 0,
  wanted: Record<number, number> = {},
): MachineIn {
  return {
    id,
    name,
    durationTicks: 20,
    energyPerTick: 0,
    throughputFactor: 1,
    inputs,
    outputs,
    countFixed: pinned > 0,
    machineCount: Math.max(1, pinned),
    targetOutputRates: wanted,
    targetInputRates: {},
  };
}

const edge = (id: string, source: string, sourceOutput: number, target: string, targetInput: number): EdgeIn => ({
  id,
  source,
  sourceOutput,
  target,
  targetInput,
});

function input(machines: MachineIn[], edges: EdgeIn[], extra: Partial<SolveInput> = {}): SolveInput {
  return { mode: "AUTO", choice: null, machines, edges, pools: [], drawers: [], extentPins: {}, spares: {}, ...extra };
}

function solved(i: SolveInput): SolutionView {
  const answer = solveCore(i);
  if (answer.kind !== "solved") throw new Error(`failed: ${JSON.stringify(answer.failure)}`);
  return answer.solution;
}

/** What is traded at one machine's ports, in units a second. */
const traded = (trades: External[], machineId: string) =>
  trades.filter((e) => e.port.node === machineId).reduce((sum, e) => sum + e.ratePerSecond, 0);

// ---------------------------------------------------------------------------
// TradeRuleTest: farm -> mill -> oven (-> cake), each 1 for 1 at a craft a second
// ---------------------------------------------------------------------------

const FARM = "farm";
const MILL = "mill";
const OVEN = "oven";
const CAKE = "cake";

function bread(farms: number, ovenAsk: number, cakeMaker: boolean): SolutionView {
  const machines = [
    machine(FARM, "farm", [], [port(0, "wheat")], farms),
    machine(MILL, "mill", [port(0, "wheat")], [port(1, "flour")]),
    machine(OVEN, "oven", [port(1, "flour")], [port(2, "bread")], 0, ovenAsk > 0 ? { 0: ovenAsk } : {}),
  ];
  const edges = [edge("e1", FARM, 0, MILL, 0), edge("e2", MILL, 0, OVEN, 0)];
  if (cakeMaker) {
    machines.push(machine(CAKE, "cake maker", [port(1, "flour")], [port(3, "cake")]));
    edges.push(edge("e3", MILL, 0, CAKE, 0));
  }
  return solved(input(machines, edges));
}

function line(cakes: number, rule?: DrawerRule): SolutionView {
  const machines = [
    machine(FARM, "farm", [], [port(0, "wheat")], 10),
    machine(MILL, "mill", [port(0, "wheat")], [port(1, "flour")]),
    machine(OVEN, "oven", [port(1, "flour")], [port(2, "bread")]),
    machine(CAKE, "cake maker", [port(2, "bread")], [port(3, "cake")], cakes),
  ];
  const edges = [edge("e1", FARM, 0, MILL, 0), edge("e2", MILL, 0, OVEN, 0), edge("e3", OVEN, 0, CAKE, 0)];
  const drawers: DrawerIn[] = rule
    ? [{ id: "d1", label: "cake", kind: "PRODUCT", rule, rate: 5, links: [{ node: CAKE, port: 0 }] }]
    : [];
  return solved(input(machines, edges, { drawers }));
}

describe("where AUTO trades (TradeRuleTest)", () => {
  it("short of wheat: buys wheat and runs the mill", () => {
    const s = bread(5, 10, false);
    expect(traded(s.gatedSources, MILL)).toBeCloseTo(5, 9);
    expect(traded(s.gatedSources, OVEN)).toBeCloseTo(0, 9);
    expect(s.machineCounts[MILL]).toBeCloseTo(10, 9);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.gatedSinks).toEqual([]);
  });

  it("spare wheat is milled and sold as flour", () => {
    const s = bread(15, 10, false);
    expect(traded(s.gatedSinks, MILL)).toBeCloseTo(5, 9);
    expect(traded(s.gatedSinks, FARM)).toBeCloseTo(0, 9);
    expect(s.machineCounts[MILL]).toBeCloseTo(15, 9);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.gatedSources).toEqual([]);
  });

  it("spare flour goes on to the cake maker rather than being sold", () => {
    const s = bread(15, 10, true);
    expect(s.machineCounts[MILL]).toBeCloseTo(15, 9);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.machineCounts[CAKE]).toBeCloseTo(5, 9);
    expect(s.gatedSources).toEqual([]);
    expect(s.gatedSinks).toEqual([]);
  });

  it("only the farm pinned: what it grows goes all the way to bread", () => {
    const s = bread(10, 0, false);
    expect(s.machineCounts[MILL]).toBeCloseTo(10, 9);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.gatedSources).toEqual([]);
    expect(s.gatedSinks).toEqual([]);
    expect(s.unneeded).toEqual([]);
  });

  it("a machine nothing pinned feeds or needs stays at zero and asks for a count", () => {
    const s = bread(0, 10, true);
    expect(s.machineCounts[FARM]).toBeCloseTo(10, 9);
    expect(s.machineCounts[MILL]).toBeCloseTo(10, 9);
    expect(s.machineCounts[CAKE]).toBe(0);
    expect(s.unneeded).toEqual([CAKE]);
  });

  it("only the wheat pinned: it all becomes cake", () => {
    const s = line(0);
    expect(s.machineCounts[MILL]).toBeCloseTo(10, 9);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.machineCounts[CAKE]).toBeCloseTo(10, 9);
    expect(s.gatedSources).toEqual([]);
    expect(s.gatedSinks).toEqual([]);
  });

  it("cakes held at five: the spare is sold as bread right before them", () => {
    const s = line(5);
    expect(s.machineCounts[MILL]).toBeCloseTo(10, 9);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.machineCounts[CAKE]).toBeCloseTo(5, 9);
    expect(traded(s.gatedSinks, OVEN)).toBeCloseTo(5, 9);
    expect(s.gatedSinks).toHaveLength(1);
    expect(s.gatedSources).toEqual([]);
  });

  it.each<DrawerRule>(["EXACTLY", "AT_MOST"])("a cake drawer taking five (%s): the spare is sold as bread", (rule) => {
    const s = line(0, rule);
    expect(s.machineCounts[OVEN]).toBeCloseTo(10, 9);
    expect(s.machineCounts[CAKE]).toBeCloseTo(5, 9);
    expect(traded(s.gatedSinks, OVEN)).toBeCloseTo(5, 9);
    expect(s.gatedSinks).toHaveLength(1);
    expect(s.gatedSources).toEqual([]);
  });

  it("a cake drawer asking at least five: all of it becomes cake", () => {
    const s = line(0, "AT_LEAST");
    expect(s.machineCounts[CAKE]).toBeCloseTo(10, 9);
    expect(s.gatedSinks).toEqual([]);
    expect(s.drawers.rates["d1"]).toBeCloseTo(10, 9);
  });
});

// ---------------------------------------------------------------------------
// portSteps
// ---------------------------------------------------------------------------

describe("portSteps (spec 3.1.6)", () => {
  it("farm, mill, oven: wheat input 1, flour input 2, wheat output 2, flour output 1", () => {
    const ctx = new SolveContext(
      input(
        [
          machine(FARM, "farm", [], [port(0, "wheat")], 1),
          machine(MILL, "mill", [port(0, "wheat")], [port(1, "flour")]),
          machine(OVEN, "oven", [port(1, "flour")], [port(2, "bread")]),
        ],
        [edge("e1", FARM, 0, MILL, 0), edge("e2", MILL, 0, OVEN, 0)],
      ),
    );
    const steps = (m: number, p: number, isInput: boolean) => {
      const idx = ctx.model.connectedPorts.findIndex((q) => q.machine === m && q.portIndex === p && q.input === isInput);
      return ctx.model.portSteps[idx];
    };
    expect(steps(1, 0, true)).toBe(1); // wheat into the mill
    expect(steps(2, 0, true)).toBe(2); // flour into the oven
    expect(steps(0, 0, false)).toBe(2); // wheat out of the farm
    expect(steps(1, 0, false)).toBe(1); // flour out of the mill
    // buying levels first (most steps first), then selling levels (most steps first)
    expect(levels(ctx).map((l) => `${l.buying ? "buy" : "sell"}${l.steps}`)).toEqual(["buy2", "buy1", "sell2", "sell1"]);
  });

  it("a loop counts as one step", () => {
    // a -> b -> a, plus b -> sink: the whole loop is one place
    const ctx = new SolveContext(
      input(
        [
          machine("a", "a", [port(1, "y")], [port(0, "x")], 1),
          machine("b", "b", [port(0, "x")], [port(1, "y"), port(2, "z")]),
        ],
        [edge("e1", "a", 0, "b", 0), edge("e2", "b", 0, "a", 0)],
      ),
    );
    for (const s of ctx.model.portSteps) expect(s).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SelfLoopTest, pin diagnosis, drawers
// ---------------------------------------------------------------------------

describe("self loops (SelfLoopTest)", () => {
  it("a lossy self loop imports what it cannot return", () => {
    // 100 glass/s is 100 one-second crafts, which eat 1000 sand/s and give 500 back.
    const kiln = machine("kiln", "kiln", [port(0, "sand", 10)], [port(0, "sand", 5), port(1, "glass")], 0, { 1: 100 });
    const s = solved(input([kiln], [edge("loop", "kiln", 0, "kiln", 0)]));
    expect(s.machineCounts["kiln"]).toBeCloseTo(100, 6);
    expect(s.edgeFlowsPerSecond["loop"]).toBeCloseTo(500, 6);
    expect(s.gatedSources).toHaveLength(1);
    expect(s.gatedSources[0]!.port.port).toBe(0);
    expect(s.gatedSources[0]!.ratePerSecond).toBeCloseTo(500, 6);
    expect(s.gatedSinks).toHaveLength(0);
    expect(s.terminalOutputs).toHaveLength(1);
    expect(s.terminalOutputs[0]!.ratePerSecond).toBeCloseTo(100, 6);
  });

  it("a self-sustaining loop voids what it does not need", () => {
    const farm = machine("farm", "farm", [port(0, "seed")], [port(0, "seed", 2), port(1, "crop")], 0, { 1: 10 });
    const s = solved(input([farm], [edge("loop", "farm", 0, "farm", 0)]));
    expect(s.machineCounts["farm"]).toBeCloseTo(10, 6);
    expect(s.edgeFlowsPerSecond["loop"]).toBeCloseTo(10, 6);
    expect(s.gatedSources).toHaveLength(0);
    expect(s.gatedSinks).toHaveLength(1);
    expect(s.gatedSinks[0]!.ratePerSecond).toBeCloseTo(10, 6);
  });
});

describe("shared machines (pools)", () => {
  const gearLine = (pool: PoolIn, latheCount = 0): SolveInput => {
    const lathe = machine("lathe", "lathe", [port(0, "ore")], [port(1, "gear", 2)], latheCount);
    const assembler = machine("assembler", "assembler", [port(1, "gear")], [port(2, "kit")]);
    const drawers: DrawerIn[] = [
      { id: "src", label: "ore", kind: "SOURCE", rule: "ANY", rate: 0, links: [{ node: "lathe", port: 0 }] },
      { id: "out", label: "kit", kind: "PRODUCT", rule: "ANY", rate: 0, links: [{ node: "assembler", port: 0 }] },
    ];
    return input([lathe, assembler], [edge("gear", "lathe", 0, "assembler", 0)], { pools: [pool], drawers });
  };

  it("a pinned shared machine runs exactly that many across its recipes", () => {
    const s = solved(gearLine({ machines: ["lathe", "assembler"], capacity: 4, exact: true }));
    expect(s.machineCounts["lathe"]! + s.machineCounts["assembler"]!).toBeCloseTo(4, 9);
    expect(s.machineCounts["lathe"]).toBeCloseTo(4 / 3, 9);
    expect(s.machineCounts["assembler"]).toBeCloseTo(8 / 3, 9);
  });

  it("a pinned recipe on a pinned shared machine holds both: the spare gears leave", () => {
    const s = solved(gearLine({ machines: ["lathe", "assembler"], capacity: 4, exact: true }, 3));
    expect(s.machineCounts["lathe"]).toBeCloseTo(3, 9);
    expect(s.machineCounts["assembler"]).toBeCloseTo(1, 9);
    expect(s.gatedSinks).toHaveLength(1);
    expect(s.gatedSinks[0]!.port.node).toBe("lathe");
    expect(s.gatedSinks[0]!.ratePerSecond).toBeCloseTo(5, 9);
  });
});

describe("failures and diagnoses", () => {
  const groupedLine = (pinLathe: boolean): SolveInput => {
    const assembler = machine("assembler", "assembler", [port(1, "gear")], [port(2, "kit")], 0, { 0: 3 });
    const lathe = machine("lathe", "lathe", [port(0, "ore")], [port(1, "gear", 2)], pinLathe ? 2 : 0);
    const pools: PoolIn[] = [{ machines: ["assembler", "lathe"], capacity: 4, exact: false }];
    return input([assembler, lathe], [edge("gear", "lathe", 0, "assembler", 0)], { pools });
  };

  const find = (n: Note, message: string): Note | null => {
    if (n.message === message) return n;
    for (const a of n.args) {
      for (const x of Array.isArray(a) ? a : [a]) {
        if (typeof x === "object" && x !== null) {
          const hit = find(x as Note, message);
          if (hit) return hit;
        }
      }
    }
    return null;
  };

  it("pins that cannot both hold name the pin to drop", () => {
    const answer = solveCore(groupedLine(true));
    expect(answer.kind).toBe("failed");
    if (answer.kind !== "failed") return;
    const conflict = find(answer.failure, "PIN_CONFLICT");
    expect(conflict).not.toBeNull();
    const dropped = (conflict!.args[0] as Note[]).map((n) => [n.message, n.args[0], (n.args[1] as Note).message]);
    expect(dropped).toEqual([["PIN_DROPPED", "lathe", "PIN_COUNT"]]);

    const freed = solved(groupedLine(false));
    expect(freed.machineCounts["assembler"]).toBeCloseTo(3, 6);
    expect(freed.machineCounts["lathe"]).toBeCloseTo(1, 6);
    expect(freed.gatedSources).toHaveLength(1);
    expect(freed.gatedSources[0]!.ratePerSecond).toBeCloseTo(1, 6);
  });

  it("an unpinned plan is wiring, not a problem to solve", () => {
    const answer = solveCore(
      input([machine(FARM, "farm", [], [port(0, "w")]), machine(MILL, "mill", [port(0, "w")], [])], [edge("e", FARM, 0, MILL, 0)]),
    );
    expect(answer).toMatchObject({ kind: "failed", failure: { message: "NO_PIN" } });
  });

  it("a plan with no machine fails EMPTY_GRAPH", () => {
    expect(solveCore(input([], []))).toMatchObject({ kind: "failed", failure: { message: "EMPTY_GRAPH" } });
  });

  it("a negative extent pin is infeasible, not a budget problem", () => {
    const answer = solveCore(
      input([machine(FARM, "farm", [], [port(0, "w")], 1), machine(MILL, "mill", [port(0, "w")], [])], [edge("e", FARM, 0, MILL, 0)], {
        extentPins: { [FARM]: -1 },
      }),
    );
    expect(answer.kind).toBe("failed");
    expect(JSON.stringify(answer)).toContain("SOLVER_UNSATISFIABLE");
    expect(JSON.stringify(answer)).not.toContain("SOLVER_BUDGET");
  });

  it("a target past the machine count reads as a stale index and is dropped", () => {
    const m = machine("m", "m", [], [port(0, "x")], 1, { 99: 5 });
    const s = solved(input([m], []));
    expect(s.machineCounts["m"]).toBeCloseTo(1, 9);
  });
});

// ---------------------------------------------------------------------------
// The independent check, the tie weights, determinism
// ---------------------------------------------------------------------------

describe("validate", () => {
  const ctx = () =>
    new SolveContext(
      input(
        [machine(FARM, "farm", [], [port(0, "w")], 1), machine(MILL, "mill", [port(0, "w")], [port(1, "f")])],
        [edge("e", FARM, 0, MILL, 0)],
      ),
    );

  it("accepts a conserving point", () => {
    const c = ctx();
    expect(validatePoint(c.model, [1, 1], [1], [0, 0])).toBeNull();
  });

  it("rejects a point that does not conserve, and negative values", () => {
    const c = ctx();
    expect(validatePoint(c.model, [1, 1], [0.5], [0, 0])).toMatch(/residual/);
    expect(validatePoint(c.model, [1, 1], [1], [0, 0.5])).toMatch(/residual/);
    expect(validatePoint(c.model, [-1, 1], [1], [0, 0])).toMatch(/negative extent/);
    expect(validatePoint(c.model, [1, 1], [-1], [0, 0])).toMatch(/negative edge flow/);
    expect(validatePoint(c.model, [1, 1], [1], [0, -1])).toMatch(/negative external/);
  });
});

describe("tieWeight (checked against Java's SplitMix64 on a JDK)", () => {
  it("matches the Java values", () => {
    expect(tieWeight(0)).toBe(1.8833108082136425);
    expect(tieWeight(1)).toBe(1.43152799704851);
    expect(tieWeight(2)).toBe(1.0264337715925977);
    expect(tieWeight(3)).toBe(1.9708819781538285);
    expect(tieWeight(13)).toBe(1.5551675161334324);
    for (let i = 0; i < 200; i++) {
      expect(tieWeight(i)).toBeGreaterThanOrEqual(1);
      expect(tieWeight(i)).toBeLessThan(2);
    }
  });
});

describe("determinism (SolverPathTest)", () => {
  // Small and mid plans; the big ones are covered by the golden suite.
  const cases = caseNames().filter(
    (n) => !["platline-x4", "platline-x10", "gtnh-flow-nanocircuits", "gtnh-flow-palladium_line"].includes(n),
  );
  it.each(cases)("%s answers the same solved again and built in reverse column order", (name) => {
    const i = loadInput(name);
    const first = digest(solveCore(i));
    const again = digest(solveCore(i));
    setColumnOrder("reverse");
    let reversed;
    try {
      reversed = digest(solveCore(i));
    } finally {
      setColumnOrder("forward");
    }
    delete first.solution.spares;
    for (const other of [again, reversed]) {
      delete other.solution.spares;
      expect(differences(first.solution, other.solution, 5)).toEqual([]);
    }
  });

  it("counts its work, not time: the same plan runs the same number of LPs", () => {
    const i = loadInput("mv");
    takeLpCount();
    solveCore(i);
    const a = takeLpCount();
    solveCore(i);
    expect(takeLpCount()).toBe(a);
    expect(a).toBeGreaterThan(0);
  });
});

