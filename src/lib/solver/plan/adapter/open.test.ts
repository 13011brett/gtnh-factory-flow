import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeLoadedProject } from "@/lib/model/project-normalize";
import type { Answer, SolveInput } from "../types";
import { setSolveCore } from "./engine";
import { calculatePlanBoardThroughput, projectForPlanBoard } from "./open";

afterEach(() => setSolveCore(undefined));

/** A stand-in core: every pinned machine at its pin, nothing flows. */
function pinsOnly(input: SolveInput): Answer {
  const machineCounts: Record<string, number> = {};
  const extentsPerSecond: Record<string, number> = {};
  for (const m of input.machines) {
    machineCounts[m.id] = m.countFixed ? m.machineCount : 0;
    extentsPerSecond[m.id] = (machineCounts[m.id]! * 20) / m.durationTicks;
  }
  return {
    kind: "solved",
    solution: {
      extentsPerSecond,
      machineCounts,
      edgeFlowsPerSecond: {},
      gatedSources: [],
      gatedSinks: [],
      terminalInputs: [],
      terminalOutputs: [],
      unneeded: [],
      openGates: 0,
      externalQuantity: 0,
      totalInternalFlow: 0,
      notes: [],
      key: { gateAnchors: [] },
      drawers: { rates: {}, unmet: [], shortfalls: [] },
      spares: [],
    },
    alternatives: { chosen: null, options: [], complete: true, notes: [] },
  };
}

describe("a Build plan on the plan board", () => {
  const load = () =>
    normalizeLoadedProject(
      JSON.parse(
        readFileSync(
          new URL("../../../../components/flow/__fixtures__/titanium-line-chembath.json", import.meta.url),
          "utf8",
        ),
      ),
    );

  it("runs as its conversion and leaves the stored plan alone", () => {
    const stored = load();
    const before = JSON.stringify(stored);
    setSolveCore(pinsOnly);
    const result = calculatePlanBoardThroughput(stored, { generatedAt: "t" });
    expect(JSON.stringify(stored)).toBe(before);
    expect(stored.planMode).toBeUndefined();
    expect(result.plan).toBeDefined();
    // every card's built count became its pin: the stand-in core runs each one
    for (const node of stored.nodes) {
      if (node.enabled) {
        expect(result.nodes[node.id]!.theoreticalMachinesRequired).toBe(node.machineCount);
      }
    }
  });

  it("a plan already in plan mode is not converted again", () => {
    const converted = projectForPlanBoard(load());
    expect(converted.planMode).toBe(true);
    expect(projectForPlanBoard(converted)).toBe(converted);
  });
});
