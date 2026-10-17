/**
 * LPs that only ask a question (feasibility, a quantity) and commit nothing: the permissive probe the pin diagnosis
 * uses (Java `Solver.externalsLp`) and the fixed-support quantity the alternatives search uses (`fixedQuantity`).
 */
import type { SolveContext } from "./context";
import { baseModel, runModel, runRelaxation, type SolveResult } from "./lp";

/**
 * Over the whole gate structure, raw-quantity objective. `open === null` is the permissive probe: every external
 * free, nothing clamped (the pin diagnosis asks whether the pins are the conflict).
 */
export function externalsLp(ctx: SolveContext, open: ReadonlySet<number> | null): SolveResult {
  const lp = baseModel(ctx);
  for (let p = 0; p < lp.nPorts; p++) {
    const gate = ctx.model.portGate[p]!;
    if (open !== null && !open.has(gate) && !ctx.bankPorts.has(p)) lp.closeExt(p);
    else lp.setExtCost(p, ctx.importTilt(gate));
  }
  return runModel(ctx, lp, "externals");
}

/** Least external quantity over a fixed support (a plain LP). */
export function fixedQuantity(ctx: SolveContext, open: ReadonlySet<number>): SolveResult {
  const lp = baseModel(ctx);
  for (let p = 0; p < lp.nPorts; p++) {
    // What a buffer banks is no gate and no trade (docs/up-to.md): never closed, never counted.
    if (ctx.bankPorts.has(p)) continue;
    if (!open.has(ctx.model.portGate[p]!)) lp.closeExt(p);
    else lp.setExtCost(p, ctx.externalWeight(p));
  }
  return runModel(ctx, lp, "stage 2 fixed quantity");
}

/** The plan's rows are relaxed by this much of a violation before it counts as a real shortfall (scaled rows). */
const SHORT = 1e-7;
/** A dual below this is zero: the engine's own tolerance for it. */
const ZERO_DUAL = 1e-9;

/**
 * Of the gates `candidates`, those that could still be opened in `base`'s place when `base` alone does not balance the
 * plan; all of them when it does or when that cannot be told.
 *
 * Linear programming duality, not a guess: the plan with every row allowed a priced slack always has an optimum, and
 * its value is the shortfall. Each candidate's gate is held shut by its own row (its trade at most nothing), and a
 * shut gate whose row has a zero dual in an optimal answer cannot lower the shortfall when opened (the same dual answer
 * still proves the optimum of the plan with that row gone). A shortfall that stays is a plan that does not balance, so
 * that gate cannot be the one to open. Gates whose row has a dual may help and are kept.
 */
export function gatesThatMayHelp(
  ctx: SolveContext,
  base: ReadonlySet<number>,
  candidates: readonly number[],
): number[] {
  if (candidates.length === 0) return [];
  const lp = baseModel(ctx);
  const model = ctx.model;
  const isCandidate = new Set(candidates);
  for (let p = 0; p < lp.nPorts; p++) {
    const gate = model.portGate[p]!;
    if (!base.has(gate) && !isCandidate.has(gate) && !ctx.bankPorts.has(p)) lp.closeExt(p);
  }
  // Every row may be broken, at a price: the shortfall.
  const slacks: number[] = [];
  for (const row of lp.rows) {
    if (Number.isFinite(row.hi)) {
      const c = lp.addColumn(0, Infinity, 1);
      slacks.push(c);
      row.cols.push(c);
      row.vals.push(-1);
    }
    if (Number.isFinite(row.lo)) {
      const c = lp.addColumn(0, Infinity, 1);
      slacks.push(c);
      row.cols.push(c);
      row.vals.push(1);
    }
  }
  // Each candidate port held shut by a row of its own, after the slacks so the row itself cannot be broken.
  const heldBy: Array<{ gate: number; col: number }> = [];
  for (let p = 0; p < lp.nPorts; p++) {
    const gate = model.portGate[p]!;
    if (base.has(gate) || !isCandidate.has(gate)) continue;
    lp.addRow([lp.extCol(p)], [1], -Infinity, 0);
    heldBy.push({ gate, col: lp.extCol(p) });
  }
  const run = runRelaxation(lp, "swap shortfall");
  if (run === null) return [...candidates];
  let shortfall = 0;
  for (const c of slacks) shortfall += run.x[c]!;
  if (!(shortfall > SHORT)) return [...candidates];

  // The rows of the held ports, found in the program by their single column.
  const { program, colOf } = run.lowered;
  const dualOfCol = new Map<number, number>();
  program.upperBounds.forEach((row, i) => {
    if (row.coefficients.size !== 1 || row.rhs !== 0) return;
    const [[k, v]] = [...row.coefficients];
    if (v === 1) dualOfCol.set(k, Math.abs(run.rowDuals[program.equalities.length + i] ?? 0));
  });
  const may = new Set<number>();
  for (const { gate, col } of heldBy) {
    const k = colOf[col]!;
    const dual = k < 0 ? 0 : dualOfCol.get(k);
    // A row the program lacks (it could not be told) keeps its gate.
    if (dual === undefined || dual > ZERO_DUAL) may.add(gate);
  }
  return candidates.filter((g) => may.has(g));
}
