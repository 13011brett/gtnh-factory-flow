/**
 * The ONE seam between the corpus harness and the solver. `golden.test.ts` calls `solveForTest(input)` and nothing
 * else. Signature: synchronous or async, one `SolveInput` in, one `Answer` out (spec 2.1).
 *
 * WP1a/b wired the core: one island, no alternatives, spares or drawer relaxation. WP1c replaces `solveCore` with the
 * full entry (islands, alternatives, spares) and `COVERAGE` with "full".
 */
import { solvePlan } from "../solve-plan";
import type { Answer, SolveInput } from "./types-local";

export type SolveForTest = (input: SolveInput) => Answer | Promise<Answer>;

/**
 * What the wired solver covers, for `golden.test.ts`: which parts of a golden are compared.
 * - "solution": the whole `solution` digest except `spares`.
 * - "full": the whole digest (alternatives and spares too).
 */
export const COVERAGE: "solution" | "full" = "full";

export const solveForTest: SolveForTest | null = (input) => solvePlan(input);
