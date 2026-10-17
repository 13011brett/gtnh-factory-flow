/**
 * The zero-gate fast path (spec-solver 3.4.1; Java `FastPathStage`): does the plan balance with every gate closed? If
 * so its least-flow point, canonicalised, is the whole answer. With Up to pools (docs/up-to.md) "closed" means every
 * forced crossing: a drawer's own ports stay open (the player's supply or sink), the push runs, then the drawer stages,
 * and least flow and the canonical point hold all of it.
 */
import type { SolveContext } from "./context";
import { canonicalHolding, canonicalizeClosed } from "./canonical";
import { leastFlowHolding } from "./flow-min";
import { baseModel, closeGatesOutside, runModel } from "./lp";
import { pushUpTo } from "./push";
import { holding, settleDrawers, tradeModel, tradesWithin, type Trades } from "./trade";

/** Commits the answer and sets `ctx.shortCircuit` when the plan balances with every gate closed. */
export function runFastPath(ctx: SolveContext): void {
  if (ctx.upToPools.length > 0) {
    runUpToFastPath(ctx);
    return;
  }
  const lp = baseModel(ctx);
  closeGatesOutside(ctx, lp, new Set());
  for (let e = 0; e < lp.nEdges; e++) lp.setFlowCost(e, 1);
  const fast = runModel(ctx, lp, "fast path");
  if (!fast.ok) return; // does not balance gate-free; the rest of the chain runs
  ctx.commit(canonicalizeClosed(ctx, fast.point));
  ctx.committedTrades = tradesWithin(new Set());
  ctx.shortCircuit = true;
}

/** Every port no drawer is linked to, held at nothing. */
function forcedClosed(ctx: SolveContext): Trades {
  const ports: number[] = [];
  for (let p = 0; p < ctx.model.connectedPorts.length; p++)
    if (!ctx.drawnPorts.has(p)) ports.push(p);
  const open = tradesWithin(null);
  return ports.length === 0 ? open : holding(open, { buying: true, steps: 0, ports }, 0);
}

function runUpToFastPath(ctx: SolveContext): void {
  const closed = forcedClosed(ctx);
  const lp = tradeModel(ctx, closed);
  for (let e = 0; e < lp.nEdges; e++) lp.setFlowCost(e, 1);
  if (!runModel(ctx, lp, "fast path").ok) return;
  const pushed = pushUpTo(ctx, closed);
  const drawn = settleDrawers(ctx, pushed);
  const s3 = leastFlowHolding(ctx, drawn);
  if (!s3.ok) return;
  const best = canonicalHolding(ctx, drawn, s3.point);
  ctx.commit(best);
  ctx.openGates = ctx.carryingGates(best.externals);
  ctx.committedTrades = pushed;
  ctx.shortCircuit = true;
}
