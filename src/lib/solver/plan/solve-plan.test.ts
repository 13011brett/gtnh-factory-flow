/**
 * WP1c: drawer relaxation, the stored choice, alternatives, spares, Unanchored, islands and the public entry
 * (`solvePlan`). The mod's tests it ports: DrawerRulesTest / SolveModeTest (the relaxation cases), AlternativesTest,
 * SparesTest, SolverIslandTest, SolverPathTest. Work is counted (LPs), never timed.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../lp-engine";
import { differences } from "./__fixtures__/compare";
import { digest } from "./__fixtures__/digest";
import { caseNames, loadInput, tile } from "./__fixtures__/load";
import { setColumnOrder, takeLpCount } from "./lp";
import { splitIslands } from "./islands";
import { solvePlan } from "./solve-plan";
import { unanchored } from "./unanchored";
import type { Answer, DrawerIn, DrawerRule, EdgeIn, MachineIn, SolutionView, SolveInput } from "./types";

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

function machine(
  id: string,
  name: string,
  inputs: ReturnType<typeof port>[],
  outputs: ReturnType<typeof port>[],
  pinned = 0,
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
    targetOutputRates: {},
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

function solvedAnswer(i: SolveInput): Extract<Answer, { kind: "solved" }> {
  const answer = solvePlan(i);
  if (answer.kind !== "solved") throw new Error(`failed: ${JSON.stringify(answer.failure)}`);
  return answer;
}

const drawer = (
  id: string,
  kind: DrawerIn["kind"],
  rule: DrawerRule,
  rate: number,
  node: string,
  portIndex: number,
  label = id,
): DrawerIn => ({ id, label, kind, rule, rate, links: [{ node, port: portIndex }] });

const messages = (s: SolutionView) => s.notes.map((n) => n.message);

// ---------------------------------------------------------------------------
// Drawer relaxation
// ---------------------------------------------------------------------------

describe("drawer relaxation (DrawerRulesTest / SolveModeTest)", () => {
  it("a pinned count past a source limit keeps the pin and flags the source", () => {
    // 6 smelters pinned, each eating 2 ore a craft: 12 ore/s against a source capped at 10
    const smelter = machine("smelter", "smelter", [port(0, "ore", 2)], [port(1, "ingot")], 6);
    const s = solvedAnswer(input([smelter], [], { drawers: [drawer("ore", "SOURCE", "AT_MOST", 10, "smelter", 0)] }))
      .solution;
    expect(s.machineCounts.smelter).toBeCloseTo(6, 9);
    expect(s.drawers.rates.ore).toBeCloseTo(12, 6);
    expect(s.drawers.unmet).toEqual(["ore"]);
    expect(s.drawers.shortfalls).toHaveLength(1);
    expect(s.drawers.shortfalls[0]!.limitingNodes).toEqual(["smelter"]);
    expect(s.drawers.shortfalls[0]!.reachable).toBeCloseTo(12, 6);
    expect(messages(s)).toContain("DRAWER_UNMET");
    expect(messages(s)).toContain("DRAWER_LIMITED_BY");
    expect(messages(s)).not.toContain("PIN_CONFLICT");
  });

  it("an exact product against an exact source keeps the product", () => {
    const smelter = machine("smelter", "smelter", [port(0, "ore")], [port(1, "ingot")]);
    const s = solvedAnswer(
      input([smelter], [], {
        drawers: [
          drawer("ore", "SOURCE", "EXACTLY", 6, "smelter", 0, "ore"),
          drawer("ingot", "PRODUCT", "EXACTLY", 3, "smelter", 0, "ingot"),
        ],
      }),
    ).solution;
    expect(s.drawers.rates.ingot).toBeCloseTo(3, 6);
    expect(s.drawers.rates.ore).toBeCloseTo(3, 6);
    expect(s.drawers.unmet).toEqual(["ore"]);
    expect(s.drawers.shortfalls[0]!.drawer).toBe("ore");
    expect(s.drawers.shortfalls[0]!.limitingDrawers).toEqual(["ingot"]);
  });

  it("a product at most zero stops the smelter and the source goes unmet", () => {
    const smelter = machine("smelter", "smelter", [port(0, "ore")], [port(1, "ingot")]);
    const s = solvedAnswer(
      input([smelter], [], {
        drawers: [
          drawer("ore", "SOURCE", "AT_LEAST", 5, "smelter", 0),
          drawer("ingot", "PRODUCT", "AT_MOST", 0, "smelter", 0),
        ],
      }),
    ).solution;
    expect(s.machineCounts.smelter).toBeCloseTo(0, 9);
    expect(s.drawers.unmet).toContain("ore");
  });

  it("only at-most rules leave AUTO idle and say so", () => {
    const smelter = machine("smelter", "smelter", [port(0, "ore")], [port(1, "ingot")]);
    const answer = solvePlan(
      input([smelter], [], { drawers: [drawer("ingot", "PRODUCT", "AT_MOST", 4, "smelter", 0)] }),
    );
    expect(answer.kind).toBe("failed");
    if (answer.kind !== "failed") return;
    expect(answer.failure.message).toBe("NO_PIN");
    expect(answer.notes.map((n) => n.message)).toContain("DRAWER_ONLY_UPPER_BOUNDS");
  });

  it("a drawer asking for flow with no links is unmet but does not break the plan", () => {
    const smelter = machine("smelter", "smelter", [port(0, "ore")], [port(1, "ingot")], 2);
    const s = solvedAnswer(
      input([smelter], [], { drawers: [{ id: "x", label: "x", kind: "PRODUCT", rule: "AT_LEAST", rate: 5, links: [] }] }),
    ).solution;
    expect(messages(s)).toContain("DRAWER_NOT_CONNECTED");
    expect(s.drawers.unmet).toContain("x");
    expect(s.machineCounts.smelter).toBeCloseTo(2, 9);
  });
});

// ---------------------------------------------------------------------------
// Alternatives, the stored choice, spares (corpus plans that carry decisions)
// ---------------------------------------------------------------------------

describe("alternatives and the stored choice (AlternativesTest)", () => {
  it("symmetric_choice: three options for one decision, the default first, 5/s each", () => {
    const a = solvedAnswer(loadInput("gtnh-flow-symmetric_choice"));
    const o = a.alternatives.options;
    expect(o).toHaveLength(3);
    expect(o.map((x) => x.rank)).toEqual(["DEFAULT", "SELLS_MORE", "SELLS_MORE"]);
    for (const x of o) expect(x.externals.reduce((s, e) => s + e.ratePerSecond, 0)).toBeCloseTo(5, 6);
    expect(new Set(o.map((x) => x.opens.node + x.opens.port)).size).toBe(3);
    expect(a.alternatives.complete).toBe(true);
  });

  it("a stored choice is honoured and survives", () => {
    const base = loadInput("gtnh-flow-excess_choice");
    const first = solvedAnswer(base);
    const other = first.alternatives.options.find((o) => o.rank !== "DEFAULT")!;
    const picked = solvedAnswer({ ...base, choice: other.key.gateAnchors });
    expect(picked.solution.key).toEqual(other.key);
    expect(picked.alternatives.chosen).toEqual(other.key);
    expect(picked.solution.notes.map((n) => n.message)).not.toContain("CHOICE_NO_LONGER_FITS");
  });

  it("a foreign choice falls back with a note", () => {
    const base = loadInput("gtnh-flow-excess_choice");
    const own = solvedAnswer(base);
    const gone = solvedAnswer({ ...base, choice: [{ node: "00000000-0000-0000-0000-00000000dead", port: 0, input: true }] });
    expect(gone.solution.notes.map((n) => n.message)).toContain("CHOICE_NO_LONGER_FITS");
    expect(gone.solution.key).toEqual(own.solution.key);
    const fewer = solvedAnswer({ ...loadInput("gtnh-flow-mk1"), choice: [] });
    expect(fewer.solution.notes.map((n) => n.message)).toContain("CHOICE_NEEDS_MORE_GATES");
  });

  it("every decision lists exactly one DEFAULT; no answer is listed twice", () => {
    for (const name of ["gtnh-flow-mk1", "gtnh-flow-excess_choice", "gtnh-flow-two_decisions", "hv-diesel"]) {
      const { options } = solvedAnswer(loadInput(name)).alternatives;
      const byDecision = new Map<string, string[]>();
      for (const o of options) {
        const k = `${o.replaces.node}:${o.replaces.port}:${o.replaces.input}`;
        byDecision.set(k, [...(byDecision.get(k) ?? []), o.rank]);
      }
      for (const ranks of byDecision.values()) expect(ranks.filter((r) => r === "DEFAULT")).toHaveLength(1);
      const keys = options.map((o) => JSON.stringify([o.replaces, o.key]));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("no options for plans without decisions", () => {
    for (const name of ["gtnh-flow-light_fuel", "gtnh-flow-nanocircuits", "gtnh-flow-light_fuel_hydrogen_loop"]) {
      expect(solvedAnswer(loadInput(name)).alternatives.options).toEqual([]);
    }
  });
});

describe("spares (SparesTest)", () => {
  it("symmetric_choice: one leftover, three bearers, the solver picks one; a stored 50/50 splits the sinks", () => {
    const base = loadInput("gtnh-flow-symmetric_choice");
    const own = solvedAnswer(base);
    expect(own.solution.spares).toHaveLength(1);
    const left = own.solution.spares[0]!;
    expect(left.bearers).toHaveLength(3);
    expect(left.bearers.filter((b) => b.solverPick)).toHaveLength(1);
    expect(left.custom).toBe(false);
    for (const b of left.bearers) expect(b.max).toBeCloseTo(5, 6);
    expect(left.bearers.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 12);

    const keyOf = (b: { anchor: { node: string; input: boolean; port: number } }) =>
      `${b.anchor.node}${b.anchor.input ? ":i:" : ":o:"}${b.anchor.port}`;
    const [x, y] = left.bearers.slice(0, 2).map(keyOf) as [string, string];
    const split = solvedAnswer({ ...base, spares: { [left.key]: { [x]: 0.5, [y]: 0.5 } } });
    const l2 = split.solution.spares[0]!;
    expect(l2.custom).toBe(true);
    expect(l2.bearers.map((b) => Math.round(b.share * 1e6) / 1e6)).toEqual([0.5, 0.5, 0]);
    const at = (b: (typeof l2.bearers)[number]) => b.flows.reduce((s, f) => s + f.ratePerSecond, 0);
    expect(at(l2.bearers[0]!)).toBeCloseTo(2.5, 6);
    expect(at(l2.bearers[1]!)).toBeCloseTo(2.5, 6);
    expect(at(l2.bearers[2]!)).toBeCloseTo(0, 9);
    // clearing the split returns the solver's own answer
    const cleared = solvedAnswer({ ...base, spares: {} });
    expect(differences(digest(own), digest(cleared))).toEqual([]);
  });

  it("shares are fractions of the leftover, whatever the units (excess_choice: 530 / 10.6 at 50/50)", () => {
    const base = loadInput("gtnh-flow-excess_choice");
    const own = solvedAnswer(base);
    const left = own.solution.spares[0]!;
    expect(left.bearers).toHaveLength(2);
    const keys = left.bearers.map((b) => `${b.anchor.node}${b.anchor.input ? ":i:" : ":o:"}${b.anchor.port}`);
    const split = solvedAnswer({ ...base, spares: { [left.key]: { [keys[0]!]: 1, [keys[1]!]: 1 } } });
    const l2 = split.solution.spares[0]!;
    expect(l2.custom).toBe(true);
    for (const b of l2.bearers) {
      const got = b.flows.reduce((s, f) => s + f.ratePerSecond, 0);
      expect(got).toBeCloseTo(b.max / 2, 5);
    }
  });
});

// ---------------------------------------------------------------------------
// Unanchored and the idle island
// ---------------------------------------------------------------------------

describe("Unanchored", () => {
  const node = (id: string, countFixed = false, out: Record<number, number> = {}) => ({
    id,
    countFixed,
    targetOutputRates: out,
  });
  it("a part of the plan nothing sets is unanchored, wires and drawers join it", () => {
    const u = unanchored({
      nodes: [node("a"), node("b"), node("c", true), node("d")],
      edges: [
        { source: "a", target: "b" },
        { source: "c", target: "d" },
      ],
      drawers: [
        { id: "dr", rule: "ANY", rate: 0, links: [{ node: "a" }] },
        { id: "free", rule: "AT_LEAST", rate: 5, links: [{ node: "b" }] },
      ],
      groups: [],
    });
    // the AT_LEAST drawer on b anchors a-b-dr; c pins c-d
    expect([...u]).toEqual([]);
    const only = unanchored({
      nodes: [node("a"), node("b"), node("c", true), node("e", false, { 0: 2 }), node("f")],
      edges: [{ source: "a", target: "b" }],
      drawers: [{ id: "dr", rule: "AT_MOST", rate: 5, links: [{ node: "b" }] }],
      groups: [{ nodeIds: ["f", "e"], pinned: false, capacity: 3 }],
    });
    expect([...only].sort()).toEqual(["a", "b", "dr"]);
  });

  it("a pinned shared machine anchors every recipe on it; a capped one does not", () => {
    const base = { nodes: [{ id: "x", countFixed: false }, { id: "y", countFixed: false }], edges: [], drawers: [] };
    expect([...unanchored({ ...base, groups: [{ nodeIds: ["x", "y"], pinned: true, capacity: 2 }] })]).toEqual([]);
    expect([...unanchored({ ...base, groups: [{ nodeIds: ["x", "y"], pinned: false, capacity: 2 }] })].sort()).toEqual([
      "x",
      "y",
    ]);
  });
});

describe("unneeded and idle islands", () => {
  it("a machine nothing pinned feeds or needs is unneeded; an unpinned island stays idle beside a solved one", () => {
    const solvedSide = [
      machine("farm", "farm", [], [port(0, "wheat")], 3),
      machine("mill", "mill", [port(0, "wheat")], [port(1, "flour")]),
    ];
    const idle = [
      machine("lone", "lone", [port(5, "sand")], [port(6, "glass")]),
      machine("lone2", "lone2", [port(6, "glass")], [port(7, "pane")]),
    ];
    const a = solvedAnswer(
      input([...solvedSide, ...idle], [edge("e1", "farm", 0, "mill", 0), edge("e2", "lone", 0, "lone2", 0)]),
    );
    expect(a.solution.machineCounts.mill).toBeCloseTo(3, 9);
    expect(a.solution.unneeded.sort()).toEqual(["lone", "lone2"]);
    expect(a.solution.machineCounts.lone).toBe(0);
  });

  it("islands whose pins cannot hold leave the others solved and say why", () => {
    const good = [
      machine("farm", "farm", [], [port(0, "wheat")], 3),
      machine("mill", "mill", [port(0, "wheat")], [port(1, "flour")]),
    ];
    const bad = [machine("bad", "bad", [port(9, "x")], [port(8, "y")], 1)];
    const answer = solvePlan(
      input([...good, ...bad], [edge("e1", "farm", 0, "mill", 0)], {
        drawers: [drawer("neg", "PRODUCT", "EXACTLY", 5, "bad", 0)],
        extentPins: { bad: -1 },
      }),
    );
    expect(answer.kind).toBe("solved");
    if (answer.kind !== "solved") return;
    expect(answer.solution.machineCounts.mill).toBeCloseTo(3, 9);
    expect(messages(answer.solution)).toContain("BALANCE_FAILED");
  });

  it("an edge from a machine the plan lacks is dropped rather than crashing the split", () => {
    const i = input(
      [machine("a", "a", [], [port(0, "w")], 1), machine("b", "b", [port(0, "w")], [port(1, "f")], 0)],
      [edge("ghost", "nobody", 0, "b", 0), edge("e1", "a", 0, "b", 0)],
    );
    const a = solvedAnswer(i);
    expect(a.solution.edgeFlowsPerSecond).not.toHaveProperty("ghost");
    expect(a.solution.machineCounts.b).toBeCloseTo(1, 9);
  });
});

// ---------------------------------------------------------------------------
// Islands: tiled copies answer as each alone (SolverIslandTest)
// ---------------------------------------------------------------------------

describe("each island answers as if alone (SolverIslandTest)", () => {
  const tiledEqualsAlone = (name: string, copies: number) => {
    const alone = loadInput(name);
    const big = tile(alone, copies);
    expect(splitIslands(big).length).toBeGreaterThanOrEqual(copies);
    const one = solvedAnswer(alone);
    const many = solvedAnswer(big);
    const n = alone.machines.length;
    const ne = alone.edges.length;
    for (let c = 0; c < copies; c++) {
      alone.machines.forEach((m, i) => {
        const want = one.solution.machineCounts[m.id]!;
        const got = many.solution.machineCounts[big.machines[c * n + i]!.id]!;
        expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(want)));
      });
      alone.edges.forEach((e, i) => {
        const want = one.solution.edgeFlowsPerSecond[e.id]!;
        const got = many.solution.edgeFlowsPerSecond[big.edges[c * ne + i]!.id]!;
        expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(want)));
      });
    }
    expect(many.solution.openGates).toBe(copies * one.solution.openGates);
    expect(many.solution.spares.length).toBe(copies * one.solution.spares.length);
    expect(many.alternatives.options.length).toBe(copies * one.alternatives.options.length);
  };

  it.each(["hv-diesel", "mega-iv-nitrobenzene-power-plant"])("%s x4", (name) => tiledEqualsAlone(name, 4), 300_000);
  it("platline x4", () => tiledEqualsAlone("platline", 4), 300_000);
  it.skipIf(!process.env.CORPUS_BENCH)("platline x10", () => tiledEqualsAlone("platline", 10), 600_000);
});

// ---------------------------------------------------------------------------
// Determinism and counted budgets
// ---------------------------------------------------------------------------

const CASES = caseNames().filter((n) => !n.startsWith("platline-x") && n !== "platline" && n !== "full-platline");

describe("determinism (SolverPathTest)", () => {
  it(
    "every corpus case answers the same twice and with every model's columns reversed",
    () => {
      for (const name of CASES) {
        const i = loadInput(name);
        const a = digest(solvedAnswer(i));
        const b = digest(solvedAnswer(i));
        expect(differences(a, b), `${name} twice`).toEqual([]);
        setColumnOrder("reverse");
        try {
          const r = digest(solvedAnswer(i));
          expect(differences(a, r).slice(0, 5), `${name} reversed`).toEqual([]);
        } finally {
          setColumnOrder("forward");
        }
      }
    },
    600_000,
  );
});

describe("budgets are counts", () => {
  it("the LP count per solve is fixed by the plan: the same on every run", () => {
    const counts: Record<string, number[]> = {};
    for (const name of ["gtnh-flow-mk1", "gtnh-flow-two_decisions", "hv-diesel", "alumina-line-shared-reactor"]) {
      counts[name] = [];
      for (let run = 0; run < 2; run++) {
        takeLpCount();
        solvedAnswer(loadInput(name));
        counts[name]!.push(takeLpCount());
      }
      expect(counts[name]![0], name).toBe(counts[name]![1]);
    }
    // the swap cap (1024 evaluations) bounds a decision search whatever the plan
    for (const c of Object.values(counts)) expect(c[0]!).toBeLessThan(1024 * 40);
  });
});
