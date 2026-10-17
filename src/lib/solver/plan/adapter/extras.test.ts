import { afterEach, describe, expect, it } from "vitest";
import { calculateThroughput } from "../../throughput";
import { makeLeftoverKey } from "../port-key";
import type { PlanLeftover } from "../types";
import { setSolveCore } from "./engine";
import { node, project, recipe, wire } from "./test-kit";

afterEach(() => setSolveCore(undefined));

/** q (pinned, 1 W/s) -> p (unpinned, W -> X) -> c (pinned, wants 2 X/s): one X/s is short, bought at either of two places. */
function shortChain(extra: Parameters<typeof project>[0]["extra"] = {}) {
  return project({
    recipes: [recipe("rq", [], [["W", 1]]), recipe("rp", [["W", 1]], [["X", 1]]), recipe("rc", [["X", 1]], [["Y", 1]])],
    nodes: [node("q", "rq", { solvePin: 1, solvePinExact: true }), node("p", "rp"), node("c", "rc", { solvePin: 2, solvePinExact: true })],
    edges: [wire("w1", "q", "p", "W"), wire("w2", "p", "c", "X")],
    extra,
  });
}

const solve = (p = shortChain()) => calculateThroughput(p, { generatedAt: "t" }).plan!;
const only = (plan: ReturnType<typeof solve>): PlanLeftover => {
  expect(plan.leftovers).toHaveLength(1);
  return plan.leftovers[0]!;
};

describe("alternatives and spare options in the extras", () => {
  it("a leftover lists every place with its rank, whole flows, the default split and the decision", () => {
    const leftover = only(solve());
    expect(leftover.importing).toBe(true);
    expect(leftover.custom).toBe(false);
    expect(leftover.bearers.length).toBe(2);
    const keys = leftover.bearers.map((b) => b.portKey);
    expect(leftover.key).toBe(makeLeftoverKey(keys));
    const pick = leftover.bearers.filter((b) => b.solverPick);
    expect(pick).toHaveLength(1);
    expect(leftover.decision).toBe(pick[0]!.portKey);
    expect(pick[0]!.rank).toBe("DEFAULT");
    expect(leftover.bearers.find((b) => !b.solverPick)!.rank).not.toBe("DEFAULT");
    expect(leftover.defaultSplit).toEqual({ [pick[0]!.portKey]: 1, [leftover.bearers.find((b) => !b.solverPick)!.portKey]: 0 });
    expect(leftover.split).toEqual(leftover.defaultSplit);
    for (const b of leftover.bearers) {
      expect(b.nodeId).toBeDefined();
      expect(b.side).toBe("in");
      expect(b.whole!.length).toBeGreaterThan(0);
      expect(b.support!.length).toBeGreaterThan(0);
      expect(b.maxPerSecond).toBeCloseTo(1, 9);
    }
  });

  it("a forced row names its decision; the plan names the chosen gates", () => {
    const plan = solve();
    const leftover = only(plan);
    expect(plan.forced.length).toBeGreaterThan(0);
    for (const row of plan.forced) {
      expect(row.decision).toBe(leftover.decision);
    }
    expect(plan.chosen).toEqual(leftover.bearers.find((b) => b.solverPick)!.support);
    expect(plan.alternativesComplete).toBe(true);
    expect(plan.choiceNotes).toEqual([]);
  });

  it("a stored split round trips: the leftover's own key and PortKeys in, custom shares out", () => {
    const first = only(solve());
    const [a, b] = first.bearers.map((x) => x.portKey);
    const stored = { [first.key]: { [a!]: 0.25, [b!]: 0.75 } };
    const plan = solve(shortChain({ spareShares: stored }));
    const leftover = only(plan);
    expect(leftover.key).toBe(first.key);
    expect(leftover.custom).toBe(true);
    expect(leftover.split![a!]).toBeCloseTo(0.25, 9);
    expect(leftover.split![b!]).toBeCloseTo(0.75, 9);
    expect(leftover.defaultSplit).toEqual(first.defaultSplit);
    // The same key feeds back unchanged: the stored split is what the next solve reads.
    expect(only(solve(shortChain({ spareShares: { [leftover.key]: leftover.split! } }))).split![a!]).toBeCloseTo(0.25, 9);
  });

  it("100% on the other place is a stored choice of it", () => {
    const first = only(solve());
    const other = first.bearers.find((x) => !x.solverPick)!;
    const plan = solve(shortChain({ spareShares: { [first.key]: { [other.portKey]: 1 } } }));
    const leftover = only(plan);
    expect(leftover.custom).toBe(true);
    expect(leftover.split![other.portKey]).toBeCloseTo(1, 9);
    expect(plan.forced.some((f) => f.portKey === other.portKey)).toBe(true);
  });
});
