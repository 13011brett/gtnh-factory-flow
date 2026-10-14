import type { Answer, SolveInput } from "../types";

/**
 * The solver core: one `SolveInput` in, one `Answer` out, synchronous and
 * pure. WP1 writes `solve-core.ts` (`solveCore`); until it lands nothing is
 * installed and plan mode says so. To wire it:
 *
 *   import { solveCore } from "../solve-core";
 *   let core: SolveCore | undefined = solveCore;
 *
 * Tests install their own with `setSolveCore`.
 */
export type SolveCore = (input: SolveInput) => Answer;

let core: SolveCore | undefined;

export function setSolveCore(next: SolveCore | undefined): void {
  core = next;
}

export function hasSolveCore(): boolean {
  return core !== undefined;
}

export function getSolveCore(): SolveCore {
  if (!core) {
    throw new Error("Plan mode solver: not implemented");
  }
  return core;
}
