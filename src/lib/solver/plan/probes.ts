/**
 * LPs that only ask a question (feasibility, a quantity) and commit nothing: the permissive probe the pin diagnosis
 * uses (Java `Solver.externalsLp`) and the fixed-support quantity the alternatives search uses (`fixedQuantity`).
 */
import type { SolveContext } from "./context";
import { baseModel, runModel, type SolveResult } from "./lp";

/**
 * Over the whole gate structure, raw-quantity objective. `open === null` is the permissive probe: every external
 * free, nothing clamped (the pin diagnosis asks whether the pins are the conflict).
 */
export function externalsLp(ctx: SolveContext, open: ReadonlySet<number> | null): SolveResult {
  const lp = baseModel(ctx);
  for (let p = 0; p < lp.nPorts; p++) {
    const gate = ctx.model.portGate[p]!;
    if (open !== null && !open.has(gate)) lp.closeExt(p);
    else lp.setExtCost(p, ctx.importTilt(gate));
  }
  return runModel(ctx, lp, "externals");
}

/** Least external quantity over a fixed support (a plain LP). */
export function fixedQuantity(ctx: SolveContext, open: ReadonlySet<number>): SolveResult {
  const lp = baseModel(ctx);
  for (let p = 0; p < lp.nPorts; p++) {
    if (!open.has(ctx.model.portGate[p]!)) lp.closeExt(p);
    else lp.setExtCost(p, ctx.externalWeight(p));
  }
  return runModel(ctx, lp, "stage 2 fixed quantity");
}
