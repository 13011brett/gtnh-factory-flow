/** `SolveInput.weightless`: the hidden tank of a loose cell wire is no machine step (the player drew one wire). */
import { describe, expect, it } from "vitest";

import { buildModel } from "./model";
import { splitIslands } from "./islands";
import type { MachineIn, PortIn, SolveInput } from "./types";

const port = (resource: number, name: string): PortIn => ({ amount: 1, chance: 1, multiplier: 1, resource, name, free: false });
const machine = (id: string, inputs: PortIn[], outputs: PortIn[]): MachineIn => ({
  id,
  name: id,
  durationTicks: 20,
  energyPerTick: 0,
  throughputFactor: 1,
  inputs,
  outputs,
  countFixed: id === "a",
  machineCount: 1,
  targetOutputRates: {},
  targetInputRates: {},
});

/** a -> tank -> b, or a -> b with no tank. */
function chain(withTank: boolean, weightless?: string[]): SolveInput {
  const machines = [machine("a", [], [port(0, "x")]), machine("b", [port(0, "x")], [port(1, "y")])];
  const edges = [{ id: "ab", source: "a", sourceOutput: 0, target: "b", targetInput: 0 }];
  if (withTank) {
    machines.splice(1, 0, machine("tank", [port(0, "x")], [port(0, "x")]));
    edges.splice(0, 1,
      { id: "at", source: "a", sourceOutput: 0, target: "tank", targetInput: 0 },
      { id: "tb", source: "tank", sourceOutput: 0, target: "b", targetInput: 0 },
    );
  }
  return {
    mode: "AUTO",
    machines,
    edges,
    pools: [],
    drawers: [],
    extentPins: {},
    spares: {},
    ...(weightless ? { weightless } : {}),
  };
}

/** The steps of every connected port, by "machine:i|o:port". */
function steps(input: SolveInput): Record<string, number> {
  const model = buildModel(input);
  const out: Record<string, number> = {};
  model.connectedPorts.forEach((p, i) => {
    out[`${model.machines[p.machine]!.spec.id}:${p.input ? "i" : "o"}:${p.portIndex}`] = model.portSteps[i]!;
  });
  return out;
}

describe("weightless machines in portSteps", () => {
  it("a loose-cell tank counts as a step unless it is weightless", () => {
    const direct = steps(chain(false));
    expect(direct["b:i:0"]).toBe(1);
    expect(direct["a:o:0"]).toBe(1);
    const heavy = steps(chain(true));
    expect(heavy["b:i:0"]).toBe(2); // a, then the tank
    expect(heavy["a:o:0"]).toBe(2); // the tank, then b
  });

  it("weightless, the tank is invisible: the chain is a plain wire's steps", () => {
    const light = steps(chain(true, ["tank"]));
    expect(light["a:o:0"]).toBe(1);
    expect(light["b:i:0"]).toBe(1);
    expect(light["tank:i:0"]).toBe(1);
    expect(light["tank:o:0"]).toBe(1);
  });

  it("an id the plan lacks is ignored, and each island keeps its own", () => {
    const input = chain(true, ["tank", "ghost"]);
    expect(steps(input)["b:i:0"]).toBe(1);
    const second = chain(true, ["tank"]);
    const both: SolveInput = {
      ...input,
      machines: [...input.machines, ...second.machines.map((m) => ({ ...m, id: `${m.id}2` }))],
      edges: [...input.edges, ...second.edges.map((e) => ({ ...e, id: `${e.id}2`, source: `${e.source}2`, target: `${e.target}2` }))],
      weightless: ["tank", "tank2"],
    };
    const islands = splitIslands(both);
    expect(islands.map((i) => i.weightless)).toEqual([["tank"], ["tank2"]]);
  });
});
