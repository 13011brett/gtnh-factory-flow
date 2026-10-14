/**
 * Runs the solver over the whole corpus and compares each answer to its golden (spec 6.2).
 * Skipped, with a message, until `solve-entry.ts` exports a real `solveForTest`.
 */
import { describe, expect, it } from "vitest";

import { differences } from "./compare";
import { digest } from "./digest";
import { caseNames, loadGolden, loadInput } from "./load";
import { solveForTest } from "./solve-entry";

if (solveForTest === null) {
  describe.skip("golden corpus (SKIPPED: no solver wired yet; set solveForTest in __fixtures__/solve-entry.ts)", () => {
    it("compares every corpus answer to its golden at 1e-6", () => {});
  });
} else {
  const solve = solveForTest;
  describe("golden corpus", () => {
    for (const name of caseNames()) {
      // platline-x10 is a bench case in the mod; it is slow, so it runs only when asked for.
      const run = name === "platline-x10" && !process.env.CORPUS_BENCH ? it.skip : it;
      run(
        name,
        async () => {
          const answer = await solve(loadInput(name));
          const golden = loadGolden(name);
          const got = digest(answer);
          // the platline-x10 golden was recorded without the `unneeded` key (see README)
          if (!("unneeded" in golden.solution)) delete got.solution.unneeded;
          const diffs = differences(golden, got);
          expect(diffs, diffs.slice(0, 20).join("\n")).toEqual([]);
        },
        120_000,
      );
    }
  });
}
