import { afterEach, describe, expect, it } from "vitest";
import { calculateThroughput } from "../../throughput";
import { mockForced, mockLeftovers, mockUnneeded, type MockPlan } from "../__fixtures__/mock-extras";
import { makeLeftoverKey, parsePortKey } from "../port-key";
import type {
  Answer,
  External,
  Leftover,
  PortRef,
  SolutionView,
  SolveInput,
} from "../types";
import type { FactoryProject } from "../../../model/types";
import { solveForTest } from "../__fixtures__/solve-entry";
import { setSolveCore } from "./engine";

afterEach(() => setSolveCore(undefined));

/** The mocks predate the extras' decision field. */
function withoutDecision<T extends { decision?: string }>(row: T): Omit<T, "decision"> {
  const copy = { ...row };
  delete copy.decision;
  return copy;
}

const NO_DRAWERS = { rates: {}, unmet: [], shortfalls: [], ports: {} };

/** The port a mock PortKey names, in the input the adapter produced. */
function refOf(input: SolveInput, portKey: string): PortRef {
  const { nodeId, side, handle } = parsePortKey(portKey)!;
  const machine = input.machines.find((m) => m.id === nodeId)!;
  const item = decodeURIComponent(handle.split(":")[2]!);
  const ports = side === "i" ? machine.inputs : machine.outputs;
  return { node: nodeId, port: ports.findIndex((p) => p.name === item), input: side === "i" };
}

/** An answer that replays a mock plan's own figures, to read them back through the adapter. */
function replay(mock: MockPlan, input: SolveInput): Answer {
  const { result } = mock;
  const extra = result.plan!;
  const machineCounts: Record<string, number> = {};
  const extents: Record<string, number> = {};
  for (const m of input.machines) {
    const count = result.nodes[m.id]!.theoreticalMachinesRequired;
    machineCounts[m.id] = count;
    extents[m.id] = (count * 20) / m.durationTicks;
  }
  const edgeFlowsPerSecond: Record<string, number> = {};
  for (const e of input.edges) {
    edgeFlowsPerSecond[e.id] = result.edges[e.id]!.transferredPerSecond;
  }
  const ext = (side: "in" | "out"): External[] =>
    extra.forced
      .filter((f) => f.side === side)
      .map((f) => ({ port: refOf(input, f.portKey), ratePerSecond: f.perSecond }));
  const spares: Leftover[] = extra.leftovers.map((l) => ({
    key: "engine-form",
    importing: l.importing,
    custom: l.custom,
    bearers: l.bearers.map((b) => ({
      anchor: refOf(input, b.portKey),
      flows: b.flows.map((f) => ({ port: refOf(input, f.portKey), ratePerSecond: f.perSecond })),
      max: b.maxPerSecond,
      share: b.share,
      solverPick: b.solverPick,
    })),
  }));
  const solution: SolutionView = {
    extentsPerSecond: extents,
    machineCounts,
    edgeFlowsPerSecond,
    gatedSources: ext("in"),
    gatedSinks: ext("out"),
    terminalInputs: [],
    terminalOutputs: [],
    unneeded: extra.unneeded,
    openGates: extra.openGates,
    externalQuantity: 0,
    totalInternalFlow: 0,
    notes: extra.notes,
    key: { gateAnchors: [] },
    drawers: { rates: {}, unmet: [], shortfalls: [], ports: {} },
    spares,
  };
  return {
    kind: "solved",
    solution,
    alternatives: { chosen: null, options: [], complete: true, notes: [] },
  };
}

function run(mock: MockPlan, hook?: (input: SolveInput) => void) {
  setSolveCore((input) => {
    hook?.(input);
    return replay(mock, input);
  });
  return calculateThroughput(mock.project, { generatedAt: "t" });
}

describe("answer to books, replaying the UI mocks", () => {
  for (const mock of [mockForced, mockLeftovers, mockUnneeded]) {
    it(`${mock.name}: counts, wires and extras come back as the mock has them`, () => {
      const out = run(mock);
      for (const node of mock.project.nodes) {
        expect(out.nodes[node.id]!.theoreticalMachinesRequired).toBeCloseTo(
          mock.result.nodes[node.id]!.theoreticalMachinesRequired,
          9,
        );
      }
      for (const edge of mock.project.edges) {
        expect(out.edges[edge.id]!.transferredPerSecond, edge.id).toBeCloseTo(
          mock.result.edges[edge.id]!.transferredPerSecond,
          9,
        );
      }
      const want = mock.result.plan!;
      const got = out.plan!;
      const byPort = <T extends { portKey: string }>(list: T[]) => [...list].sort((a, b) => a.portKey.localeCompare(b.portKey));
      expect(byPort(got.forced).map(withoutDecision)).toEqual(byPort(want.forced));
      expect(got.leftovers).toMatchObject(want.leftovers);
      expect(got.unneeded).toEqual(want.unneeded);
      expect([...got.unanchored].sort()).toEqual([...want.unanchored].sort());
      expect(got.notes).toEqual(want.notes);
      expect(out.totalEuT).toBeCloseTo(mock.result.totalEuT, 9);
    });
  }

  it("a running machine's flows are the nameplate at the solved scale", () => {
    const out = run(mockForced);
    // 3 macerators: 3 ore in, 6 dust out
    const mac = out.nodes["mac"]!;
    expect(mac.inputs["item:Iron Ore"]!.amountPerSecond).toBeCloseTo(3, 9);
    expect(mac.outputs["item:Crushed Iron"]!.amountPerSecond).toBeCloseTo(6, 9);
    expect(mac.status).toBe("balanced");
    expect(mac.utilization).toBe(1);
  });

  it("a machine at zero keeps its nameplate rates", () => {
    const out = run(mockUnneeded);
    const cutter = out.nodes["cutter"]!;
    expect(cutter.status).toBe("underutilized");
    expect(cutter.utilization).toBe(0);
    expect(cutter.inputs["item:Steel Plate"]!.amountPerSecond).toBe(1);
  });

  it("does not touch a drawer's own rule; marks it unreachable when the answer says it is unmet", () => {
    setSolveCore((input) => {
      const answer = replay(mockUnneeded, input);
      if (answer.kind === "solved") {
        answer.solution.drawers = { rates: {}, unmet: ["steel"], shortfalls: [], ports: {} };
      }
      return answer;
    });
    const out = calculateThroughput(mockUnneeded.project, { generatedAt: "t" });
    expect(out.storages["steel"]!.targetUnreachable).toBe(true);
    expect(out.storages["iron"]!.targetUnreachable).toBeUndefined();
    expect(out.bottlenecks.some((b) => b.id === "solve-target:steel")).toBe(true);
    expect(out.plan!.unmetDrawers).toEqual(["steel"]);
  });

  it("a failed answer: every machine at zero, wires present at zero, the failure in the extras", () => {
    setSolveCore(() => ({
      kind: "failed",
      failure: { message: "NO_PIN", args: [] },
      notes: [],
      drawers: NO_DRAWERS,
    }));
    const out = calculateThroughput(mockForced.project, { generatedAt: "t" });
    for (const node of mockForced.project.nodes) {
      expect(out.nodes[node.id]!.theoreticalMachinesRequired).toBe(0);
      expect(out.nodes[node.id]!.status).toBe("underutilized");
    }
    for (const edge of mockForced.project.edges) {
      expect(out.edges[edge.id]!.transferredPerSecond).toBe(0);
    }
    expect(out.plan!.failure?.message).toBe("NO_PIN");
    expect(out.bottlenecks.some((b) => b.id === "plan-failed")).toBe(false);
    expect(out.totalEuT).toBe(0);
  });

  it("another failure adds a bottleneck for the notice", () => {
    setSolveCore(() => ({
      kind: "failed",
      failure: { message: "BALANCE_FAILED", args: [] },
      notes: [],
      drawers: NO_DRAWERS,
    }));
    const out = calculateThroughput(mockForced.project, { generatedAt: "t" });
    expect(out.bottlenecks.some((b) => b.id === "plan-failed")).toBe(true);
  });
});

describe("the SolveInput the adapter builds", () => {
  let captured: SolveInput;
  const input = (mock: MockPlan) => {
    run(mock, (i) => (captured = i));
    return captured;
  };

  it("keeps machines, edges and drawers in id order", () => {
    const i = input(mockForced);
    expect(i.machines.map((m) => m.id)).toEqual(["coal", "furn", "mac", "wash"]);
    expect(i.edges.map((e) => e.id)).toEqual(["w-coal", "w-dust", "w-slag"]);
    expect(i.drawers.map((d) => d.id)).toEqual(["ingots", "ore", "wood"]);
  });

  it("reproduces every nameplate flow from craft rate and per-craft amounts", () => {
    const i = input(mockForced);
    for (const m of i.machines) {
      // one machine at the built count of 1: extent = 20 / duration
      const extent = (1 * 20) / m.durationTicks;
      const report = mockForced.result.nodes[m.id]!;
      const scale = report.theoreticalMachinesRequired > 0 ? report.theoreticalMachinesRequired : 1;
      m.inputs.forEach((p) => {
        const flow = Object.values(report.inputs).find((f) => f.displayName === p.name)!;
        expect(extent * p.amount * p.chance * p.multiplier * m.throughputFactor).toBeCloseTo(
          flow.amountPerSecond / scale,
          9,
        );
      });
    }
  });

  it("pins: a card's pin fixes its count; port rates and unpinned cards do not", () => {
    const i = input(mockForced);
    const by = Object.fromEntries(i.machines.map((m) => [m.id, m]));
    expect([by.mac!.countFixed, by.mac!.machineCount]).toEqual([true, 3]);
    expect([by.coal!.countFixed, by.coal!.machineCount]).toEqual([true, 0.5]);
    expect(by.furn!.countFixed).toBe(false);
  });

  it("a fluid tank's stored pin does not fix its count: the card has none to show or clear", () => {
    const coal = mockForced.project.nodes.find((n) => n.id === "coal")!;
    const tankMock: MockPlan = {
      ...mockForced,
      project: {
        ...mockForced.project,
        recipes: mockForced.project.recipes.map((r) =>
          r.id === coal.recipeId ? { ...r, machineType: "Tank", source: { recipeMap: "Tank" } } : r,
        ),
      },
    };
    const by = Object.fromEntries(input(tankMock).machines.map((m) => [m.id, m]));
    expect(coal.solvePin).toBe(0.5);
    expect(by.coal!.countFixed).toBe(false);
    expect([by.mac!.countFixed, by.mac!.machineCount]).toEqual([true, 3]);
  });

  it("drawers: kind, effective rule, rate and the port each links to", () => {
    const i = input(mockForced);
    const ingots = i.drawers.find((d) => d.id === "ingots")!;
    expect(ingots).toMatchObject({ kind: "PRODUCT", rule: "AT_LEAST", rate: 2 });
    expect(ingots.links).toEqual([{ node: "furn", port: 0 }]);
    const ore = i.drawers.find((d) => d.id === "ore")!;
    expect(ore).toMatchObject({ kind: "SOURCE", rule: "ANY" });
    expect(ore.links).toEqual([{ node: "mac", port: 0 }]);
    // An "at most" source keeps its number; a drawer with none is ANY.
    const j = input(mockUnneeded);
    expect(j.drawers.find((d) => d.id === "iron")).toMatchObject({ kind: "SOURCE", rule: "AT_MOST", rate: 12 });
    expect(j.drawers.find((d) => d.id === "rods")).toMatchObject({ kind: "PRODUCT", rule: "ANY" });
  });

  it("an unwired port is left out of the edges (a free terminal), not pinned to zero", () => {
    const i = input(mockForced);
    const wash = i.machines.find((m) => m.id === "wash")!;
    expect(wash.outputs).toHaveLength(1); // Clay, wired nowhere
    expect(i.edges.some((e) => e.source === "wash")).toBe(false);
  });

  it("stored spare splits are translated to the engine's bearer keys", () => {
    const i = input(mockLeftovers);
    const keys = Object.keys(i.spares);
    // bearer keys sort as strings: "alloy2:" < "alloy:"
    expect(keys).toEqual(["alloy2:i:0|alloy:i:0"]);
    expect(i.spares[keys[0]!]).toEqual({ "alloy:i:0": 0.25, "alloy2:i:0": 0.75 });
  });

  it("a stored bearer that no longer exists does not match a live port", () => {
    const mock: MockPlan = {
      ...mockLeftovers,
      project: {
        ...mockLeftovers.project,
        spareShares: {
          [makeLeftoverKey(["gone|i|input:item:x", "alloy|i|input:item:Copper%20Dust"])]: {
            "gone|i|input:item:x": 0.5,
            "alloy|i|input:item:Copper%20Dust": 0.5,
          },
        },
      } as FactoryProject,
    };
    const i = input(mock);
    const [key] = Object.keys(i.spares);
    expect(key).not.toContain("gone");
    expect(key).toContain("alloy:i:0");
    expect(key.split("|")).toHaveLength(2);
  });
});

describe.skipIf(solveForTest === null)("with the real solver core", () => {
  it("the forced-flows mock comes out as the mock has it", async () => {
    setSolveCore((input) => solveForTest!(input) as Answer);
    const out = calculateThroughput(mockForced.project, { generatedAt: "t" });
    for (const node of mockForced.project.nodes) {
      expect(out.nodes[node.id]!.theoreticalMachinesRequired, node.id).toBeCloseTo(
        mockForced.result.nodes[node.id]!.theoreticalMachinesRequired,
        9,
      );
    }
    for (const edge of mockForced.project.edges) {
      expect(out.edges[edge.id]!.transferredPerSecond, edge.id).toBeCloseTo(
        mockForced.result.edges[edge.id]!.transferredPerSecond,
        9,
      );
    }
    const byPort = <T extends { portKey: string }>(list: T[]) =>
      [...list].sort((a, b) => a.portKey.localeCompare(b.portKey));
    expect(byPort(out.plan!.forced).map(withoutDecision)).toEqual(
      byPort(mockForced.result.plan!.forced),
    );
  });
});
