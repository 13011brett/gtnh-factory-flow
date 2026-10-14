/**
 * The ONE seam between the corpus harness and the solver. `golden.test.ts` calls `solveForTest(input)` and nothing
 * else. Until the solver exists this is `null` and the golden suite is skipped. When the solver lands, replace the
 * `null` with the real entry, for example:
 *
 *   export { solvePlan as solveForTest } from "../index";
 *
 * Signature: synchronous or async, one `SolveInput` in, one `Answer` out (spec 2.1).
 */
import type { Answer, SolveInput } from "./types-local";

export type SolveForTest = (input: SolveInput) => Answer | Promise<Answer>;

export const solveForTest: SolveForTest | null = null;
