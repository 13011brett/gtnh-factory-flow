import { beforeAll, describe, expect, it } from "vitest";
import { initLpEngine, solveLpAuto } from "./lp-engine";
import { IntegerVariablesUnsupportedError, solveLp, type LinearProgram } from "./simplex";

/** Integer columns: HiGHS only. A file of its own so the homegrown path is checked before the wasm loads. */

const row = (entries: Array<[number, number]>, rhs: number) => ({
  coefficients: new Map(entries),
  rhs,
});

const knapsack = (order: "a" | "b" = "a"): LinearProgram => {
  const rows = [row([[0, 6], [1, 4]], 24), row([[0, 1], [1, 2]], 6)];
  return {
    maximize: [5, 4],
    equalities: [],
    upperBounds: order === "a" ? rows : [...rows].reverse(),
    integers: [0, 1],
  };
};

describe("integer variables", () => {
  it("the homegrown simplex refuses them with a clear error", () => {
    expect(() => solveLp(knapsack())).toThrow(IntegerVariablesUnsupportedError);
    expect(() => solveLp(knapsack())).toThrow(/HiGHS/);
    expect(() => solveLpAuto(knapsack())).toThrow(/integer variables/);
    expect(() => solveLp({ ...knapsack(), integers: undefined, binaries: [1] })).toThrow(
      IntegerVariablesUnsupportedError,
    );
  });

  describe("with HiGHS", () => {
    beforeAll(async () => {
      expect(await initLpEngine()).toBe(true);
    });

    it("branches: the integer optimum is below the relaxation", () => {
      const relaxed = solveLpAuto({ ...knapsack(), integers: undefined });
      expect(relaxed.objective).toBeCloseTo(21, 9);
      const whole = solveLpAuto(knapsack());
      expect(whole.status).toBe("optimal");
      expect(whole.objective).toBeCloseTo(20, 9);
      expect(whole.x).toEqual([4, 0]);
    });

    it("solves binary columns", () => {
      // Pick items worth 6, 5, 4 weighing 3, 2, 2 under a weight of 4: 5 + 4 = 9.
      const solution = solveLpAuto({
        maximize: [6, 5, 4],
        equalities: [],
        upperBounds: [row([[0, 3], [1, 2], [2, 2]], 4)],
        binaries: [0, 1, 2],
      });
      expect(solution.status).toBe("optimal");
      expect(solution.x).toEqual([0, 1, 1]);
      expect(solution.objective).toBeCloseTo(9, 9);
    });

    it("mixes whole and continuous columns", () => {
      // x whole, y free: maximize x + y with 2x + y <= 7.5, y <= 1.25, x <= 3.4.
      const solution = solveLpAuto({
        maximize: [1, 1],
        equalities: [],
        upperBounds: [row([[0, 2], [1, 1]], 7.5), row([[1, 1]], 1.25), row([[0, 1]], 3.4)],
        integers: [0],
      });
      expect(solution.x[0]).toBe(3);
      expect(solution.x[1]).toBeCloseTo(1.25, 9);
    });

    it("does not rescale a whole column with a tiny coefficient", () => {
      // 5e-9 x <= 1.6e-8 means x <= 3.2. Rescaling the column (the continuous
      // path's trick) or leaving the row unscaled would let x run past 3.
      const solution = solveLpAuto({
        maximize: [1],
        equalities: [],
        upperBounds: [row([[0, 5e-9]], 1.6e-8)],
        integers: [0],
      });
      expect(solution.status).toBe("optimal");
      expect(solution.x[0]).toBe(3);
    });

    it("keeps the continuous column rescale for continuous columns", () => {
      const solution = solveLpAuto({
        maximize: [1],
        equalities: [],
        upperBounds: [row([[0, 5e-9]], 1.6e-8)],
      });
      expect(solution.x[0]).toBeCloseTo(3.2, 6);
    });

    it("reports an integer program with no whole answer as infeasible", () => {
      const solution = solveLpAuto({
        maximize: [1],
        equalities: [row([[0, 2]], 1)],
        upperBounds: [],
        integers: [0],
      });
      expect(solution.status).toBe("infeasible");
    });

    it("gives the same answer every time and in any row order", () => {
      const first = solveLpAuto(knapsack());
      for (let i = 0; i < 5; i += 1) {
        expect(solveLpAuto(knapsack())).toEqual(first);
      }
      expect(solveLpAuto(knapsack("b")).x).toEqual(first.x);
    });

    it("takes a node budget instead of a clock", () => {
      const solution = solveLpAuto(knapsack(), { maxMipNodes: 100000 });
      expect(solution.objective).toBeCloseTo(20, 9);
    });

    it("rejects a column outside the program", () => {
      expect(() => solveLpAuto({ ...knapsack(), integers: [7] })).toThrow(/Integer column 7/);
    });
  });
});
