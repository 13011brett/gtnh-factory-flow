/**
 * The Up to rings on the board (docs/up-to.md, "Loops"): `SolutionView.upToLoops` mapped to `PlanSolveExtras.loops`,
 * cards for nodes, rows for ports and their resources.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../../lp-engine";
import { calculateThroughput } from "../../throughput";
import { node, project, recipe, wire } from "./test-kit";

beforeAll(async () => {
  await initLpEngine();
});

/** a (x -> y) and b (y -> half an x) in a ring, both Up to 1, nothing feeding it. */
const ring = (fed: boolean) =>
  project({
    recipes: [
      recipe("ra", [["x", 1]], [["y", 1]]),
      recipe("rb", [["y", 1]], [["x", 0.5]]),
      recipe("rs", [], [["x", 1]]),
    ],
    nodes: [
      node("a", "ra", { solvePin: 1 }),
      node("b", "rb", { solvePin: 1 }),
      ...(fed ? [node("s", "rs", { solvePin: 1 })] : []),
    ],
    edges: [
      wire("y", "a", "b", "y"),
      wire("x", "b", "a", "x"),
      ...(fed ? [wire("x2", "s", "a", "x")] : []),
    ],
  });

describe("Up to rings on the board", () => {
  it("a recycling ring nothing feeds is a DEAD_LOOP of its cards, its rows and their resources", () => {
    const plan = calculateThroughput(ring(false), { generatedAt: "t" }).plan!;
    expect(plan.upTo?.["a"]?.reason).toBe("STARVED");
    expect(plan.upTo?.["b"]?.reason).toBe("STARVED");
    expect(plan.loops).toEqual([
      {
        kind: "DEAD_LOOP",
        cards: ["a", "b"],
        portKeys: ["a|i|input:item:x", "b|i|input:item:y"],
        resourceKeys: ["item:x", "item:y"],
      },
    ]);
  });

  it("fed from outside it is no loop: no `loops`", () => {
    const plan = calculateThroughput(ring(true), { generatedAt: "t" }).plan!;
    expect(plan.loops).toBeUndefined();
  });
});
