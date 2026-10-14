/**
 * The canonical tie-break (spec-solver 3.4.3, 3.4.4): among the points of least total flow (within `qtyEps`) with the
 * trading held, exactly one is cheapest under the scrambled per-index weights. This is the determinism story.
 */
import type { SolveContext, StageOutcome } from "./context";
import { baseModel, closeGatesOutside, runModel, type ModelLp } from "./lp";
import { tieWeight } from "./tie-weight";
import { tradeModel, type Trades } from "./trade";
import { NUMERICS } from "./validate";

/** Total flow at most the least-flow point's (plus its rounding room); each wire priced by its tie weight. */
function flowCapRow(lp: ModelLp, s3: StageOutcome): void {
  const cols: number[] = [];
  const vals: number[] = [];
  for (let e = 0; e < lp.nEdges; e++) {
    cols.push(lp.flowCol(e));
    vals.push(1);
    lp.setFlowCost(e, tieWeight(e));
  }
  lp.addRow(
    cols,
    vals,
    -Infinity,
    s3.internalFlow * (1 + NUMERICS.qtyEps) + NUMERICS.qtyEps * Math.max(1, s3.internalFlow),
  );
}

/** The canonical point with the trading held; the least-flow point `s3` stands when the LP is rejected. */
export function canonicalHolding(ctx: SolveContext, held: Trades, s3: StageOutcome): StageOutcome {
  const lp = tradeModel(ctx, held);
  for (let p = 0; p < lp.nPorts; p++) lp.setExtCost(p, NUMERICS.edgeFirst * tieWeight(p) * ctx.externalWeight(p));
  flowCapRow(lp, s3);
  const result = runModel(ctx, lp, "canonicalise");
  return result.ok ? result.point : s3;
}

/** The fast path's canonical point: every gate closed. */
export function canonicalizeClosed(ctx: SolveContext, s3: StageOutcome): StageOutcome {
  const lp = baseModel(ctx);
  closeGatesOutside(ctx, lp, new Set());
  flowCapRow(lp, s3);
  const result = runModel(ctx, lp, "canonicalise");
  return result.ok ? result.point : s3;
}
