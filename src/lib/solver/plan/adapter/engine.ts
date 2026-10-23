import { IslandCache, type PieceCache } from "../cache";
import { planExtensions, solvePlan } from "../solve-plan";
import type { Answer, SolveInput } from "../types";

/**
 * The plan solver: one `SolveInput` in, one `Answer` out, synchronous and pure (`solve-plan.ts`: islands, drawer
 * relaxation, alternatives, spares). Tests may stand in their own with `setSolveCore`; `setSolveCore(undefined)` puts
 * the real one back.
 */
export type SolveCore = (input: SolveInput) => Answer;

let override: SolveCore | undefined;

/**
 * Islands solved lately, by value (spec-solver 4.4): an edit re-solves only the islands it touched, and undo finds the
 * older answer. One per thread (the worker has its own); it never changes an answer, only what is solved again.
 */
export const islandCache: PieceCache = new IslandCache(64);

let activeCache: PieceCache = islandCache;

const cached: SolveCore = (input) => solvePlan(input, planExtensions, activeCache);

/**
 * Runs `solve` with its islands kept in `cache` instead of the plan's own. For solves that are not the plan (the
 * board's what-if probes): their islands then never push the plan's out of its cache. Answers are the same either way.
 */
export function withIslandCache<T>(cache: PieceCache, solve: () => T): T {
  const was = activeCache;
  activeCache = cache;
  try {
    return solve();
  } finally {
    activeCache = was;
  }
}

export function setSolveCore(next: SolveCore | undefined): void {
  override = next;
}

export function getSolveCore(): SolveCore {
  return override ?? cached;
}
