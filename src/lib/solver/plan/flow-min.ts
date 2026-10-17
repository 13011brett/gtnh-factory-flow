/**
 * Internal flow (spec-solver 3.4.3; Java `FlowMinStage`): with the trading held, the least total internal flow, then
 * the one canonical point among that optimum.
 */
import type { SolveContext, StageOutcome } from "./context";
import { canonicalHolding } from "./canonical";
import { runModel, type SolveResult } from "./lp";
import { tradeModel, type Trades } from "./trade";
import type { Note } from "./types";

/** The least internal flow with the plan's trading held. */
export function leastFlowHolding(ctx: SolveContext, held: Trades): SolveResult {
  const lp = tradeModel(ctx, held);
  for (let e = 0; e < lp.nEdges; e++) lp.setFlowCost(e, 1);
  return runModel(ctx, lp, "stage 3 flow");
}

export type FlowOutcome = { ok: true; point: StageOutcome } | { ok: false; rejection: Note };

/** Commits the canonical point, the gates it opens and the trading (with any push bands) it was settled under. */
export function runFlowMin(ctx: SolveContext, held: Trades): FlowOutcome {
  const s3 = leastFlowHolding(ctx, held);
  if (!s3.ok) return { ok: false, rejection: s3.rejection };
  const best = canonicalHolding(ctx, held, s3.point);
  ctx.commit(best);
  ctx.openGates = ctx.carryingGates(best.externals);
  ctx.committedTrades = held;
  return { ok: true, point: best };
}
