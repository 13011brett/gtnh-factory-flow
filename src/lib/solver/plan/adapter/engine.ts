import { solveCore } from "../solve-core";
import type { Answer, SolveInput } from "../types";

/**
 * The solver core: one `SolveInput` in, one `Answer` out, synchronous and
 * pure (`solve-core.ts`). Tests may stand in their own with `setSolveCore`;
 * `setSolveCore(undefined)` puts the real one back.
 */
export type SolveCore = (input: SolveInput) => Answer;

let override: SolveCore | undefined;

export function setSolveCore(next: SolveCore | undefined): void {
  override = next;
}

export function getSolveCore(): SolveCore {
  return override ?? solveCore;
}
