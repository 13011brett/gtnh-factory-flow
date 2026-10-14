/**
 * The zero-gate fast path (spec-solver 3.4.1; Java `FastPathStage`): does the plan balance with every gate closed? If
 * so its least-flow point, canonicalised, is the whole answer.
 */
import type { SolveContext } from "./context";
import { canonicalizeClosed } from "./canonical";
import { baseModel, closeGatesOutside, runModel } from "./lp";

/** Commits the answer and sets `ctx.shortCircuit` when the plan balances with every gate closed. */
export function runFastPath(ctx: SolveContext): void {
  const lp = baseModel(ctx);
  closeGatesOutside(ctx, lp, new Set());
  for (let e = 0; e < lp.nEdges; e++) lp.setFlowCost(e, 1);
  const fast = runModel(ctx, lp, "fast path");
  if (!fast.ok) return; // does not balance gate-free; the rest of the chain runs
  ctx.commit(canonicalizeClosed(ctx, fast.point));
  ctx.shortCircuit = true;
}
