/**
 * Runs the solver over the whole corpus and compares each answer to its golden (spec 6.2).
 * Skipped, with a message, while `solve-entry.ts` exports no `solveForTest`. While `COVERAGE` is "solution" only the
 * `solution` digest (minus the spares) is compared: alternatives and spares belong to WP1c.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../../lp-engine";
import { differences } from "./compare";
import { digest } from "./digest";
import { caseNames, loadGolden, loadInput } from "./load";
import { COVERAGE, solveForTest } from "./solve-entry";

if (solveForTest === null) {
  describe.skip("golden corpus (SKIPPED: no solver wired yet; set solveForTest in __fixtures__/solve-entry.ts)", () => {
    it("compares every corpus answer to its golden at 1e-6", () => {});
  });
} else {
  const solve = solveForTest;
  describe("golden corpus", () => {
    beforeAll(async () => {
      await initLpEngine();
    });
    for (const name of caseNames()) {
      // platline-x10 is a bench case in the mod; it is slow, so it runs only when asked for.
      const run = (name === "platline-x10" && !process.env.CORPUS_BENCH) ? it.skip : it;
      run(
        name,
        async () => {
          const answer = await solve(loadInput(name));
          const golden = loadGolden(name);
          const got = digest(answer);
          // the platline-x10 golden was recorded without the `unneeded` key (see README)
          if (!("unneeded" in golden.solution)) delete got.solution.unneeded;
          if (COVERAGE === "solution") {
            delete got.solution.spares;
            delete (golden.solution as Record<string, unknown>).spares;
            got.alternatives = {};
            golden.alternatives = {};
          }
          const diffs = differences(golden, got);
          expect(diffs, diffs.slice(0, 20).join("\n")).toEqual([]);
        },
        120_000,
      );
    }
  });
}
