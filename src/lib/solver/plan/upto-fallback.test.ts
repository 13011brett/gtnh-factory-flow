/**
 * The plan solver on the homegrown simplex: this file never loads HiGHS (vitest runs each file in its own modules), as
 * a page does before the engine has loaded. Its points are not exact vertices: an island whose Up to cards all sat idle
 * came back as noise (largest value about 1e-20, negatives near 1e-25), and the negativity check, relative to that
 * noise's own scale, rejected it under every setting (the simplex ignores them). The plan failed (an old Build plan,
 * 89a96110), or, beside another island, that island failed quietly and its Up to cards had no read-out (4893e692: 45 Up
 * to cards, one read-out). `__fixtures__/up-to/idle-noise.json` is the first plan cut down to what still did it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { activeLpEngine } from "../lp-engine";
import { SolveContext } from "./context";
import { solvePlan } from "./solve-plan";
import type { MachineIn, SolveInput } from "./types";
import { validatePoint } from "./validate";

beforeAll(() => {
  expect(activeLpEngine()).toBe("simplex");
});

const idleNoise = (): SolveInput =>
  JSON.parse(
    readFileSync(path.join(__dirname, "__fixtures__", "up-to", "idle-noise.json"), "utf8"),
  ) as SolveInput;

const port = (resource: number, name: string) => ({
  amount: 1,
  chance: 1,
  multiplier: 1,
  resource,
  name,
  free: false,
});

const lone = (id: string): MachineIn => ({
  id,
  name: id,
  durationTicks: 20,
  energyPerTick: 0,
  throughputFactor: 1,
  inputs: [port(1, "ore")],
  outputs: [port(2, "gear")],
  countFixed: false,
  machineCount: 1,
  targetOutputRates: {},
  targetInputRates: {},
});

describe("a point that is all but zero is noise, not a negative", () => {
  // a (ore -> x) -> b (x -> y), one wire.
  const model = () =>
    new SolveContext({
      mode: "AUTO",
      choice: null,
      machines: [
        { ...lone("a"), outputs: [port(3, "x")] },
        { ...lone("b"), inputs: [port(3, "x")] },
      ],
      edges: [{ id: "e", source: "a", sourceOutput: 0, target: "b", targetInput: 0 }],
      pools: [{ machines: ["a"], capacity: 1, exact: false, upTo: true }],
      drawers: [],
      extentPins: {},
      spares: {},
    });

  it("the check passes it, and still rejects a real negative at any scale", () => {
    const ctx = model();
    expect(validatePoint(ctx.model, [1e-20, -2.0679515313825692e-25], [1e-20], [0, 0])).toBeNull();
    expect(validatePoint(ctx.model, [1, -1e-3], [1], [0, 0])).toMatch(/negative extent/);
    expect(validatePoint(ctx.model, [1e6, -1e-4], [1e6], [0, 0])).toMatch(/negative extent/);
  });

  it("commit sets it to exactly zero", () => {
    const ctx = model();
    ctx.commit(ctx.outcome([1e-20, -2.0679515313825692e-25], [1e-20], [0, 0]));
    expect(ctx.point!.extents).toEqual([0, 0]);
    expect(ctx.point!.flows).toEqual([0]);
  });
});

describe("an idle Up to island on the simplex", () => {
  it("solves, idle, with its read-out and no negative count", () => {
    const answer = solvePlan(idleNoise());
    expect(answer.kind).toBe("solved");
    if (answer.kind !== "solved") return;
    expect(answer.solution.upTo).toHaveLength(1);
    for (const count of Object.values(answer.solution.machineCounts))
      expect(count).toBeGreaterThanOrEqual(0);
  });

  it("beside another island: no island fails quietly, every Up to card has its read-out", () => {
    const plan = idleNoise();
    const answer = solvePlan({
      ...plan,
      machines: [...plan.machines, lone("zz-lone")],
      pools: [...plan.pools, { machines: ["zz-lone"], capacity: 2, exact: false, upTo: true }],
    });
    expect(answer.kind).toBe("solved");
    if (answer.kind !== "solved") return;
    expect(answer.solution.notes.map((n) => n.message)).not.toContain("BALANCE_FAILED");
    expect(answer.solution.upTo!.map((r) => r.node)).toEqual([
      plan.pools[0]!.machines[0],
      "zz-lone",
    ]);
    expect(answer.solution.upTo![1]).toMatchObject({ reason: "FULL", reached: 2 });
  });
});
