/**
 * The zero-gate fast path (spec-solver 3.4.1; Java `FastPathStage`): does the plan balance with every gate closed? If
 * so its least-flow point, canonicalised, is the whole answer. With Up to pools (docs/up-to.md) the push runs first,
 * every gate closed, and least flow and the canonical point hold its bands.
 */
import type { SolveContext } from "./context";
import { canonicalHolding, canonicalizeClosed } from "./canonical";
import { leastFlowHolding } from "./flow-min";
import { baseModel, closeGatesOutside, runModel } from "./lp";
import { pushUpTo } from "./push";
import { tradesWithin } from "./trade";

/** Commits the answer and sets `ctx.shortCircuit` when the plan balances with every gate closed. */
export function runFastPath(ctx: SolveContext): void {
  const lp = baseModel(ctx);
  closeGatesOutside(ctx, lp, new Set());
  for (let e = 0; e < lp.nEdges; e++) lp.setFlowCost(e, 1);
  const fast = runModel(ctx, lp, "fast path");
  if (!fast.ok) return; // does not balance gate-free; the rest of the chain runs
  const closed = tradesWithin(new Set());
  if (ctx.upToPools.length === 0) {
    ctx.commit(canonicalizeClosed(ctx, fast.point));
    ctx.committedTrades = closed;
    ctx.shortCircuit = true;
    return;
  }
  const pushed = pushUpTo(ctx, closed);
  const s3 = leastFlowHolding(ctx, pushed);
  if (!s3.ok) return;
  ctx.commit(canonicalHolding(ctx, pushed, s3.point));
  ctx.committedTrades = pushed;
  ctx.shortCircuit = true;
}
