/**
 * AUTO's trading (spec-solver 3.4.2; Java `TradeStage`, `Solver.levels/leastAt/heldAt`). The plan buys as far upstream
 * as it can and sells as far downstream as it can: level by level, buying first (most steps first), then selling (most
 * steps first), it trades as little as it can at each level, holding every level before.
 */
import type { SolveContext } from "./context";
import { baseModel, closeGatesOutside, runModel, type ModelLp, type SolveResult } from "./lp";
import type { Note } from "./types";
import { NUMERICS, scaleOf } from "./validate";

/** One step of the trading: the ports where the plan buys (inputs) or sells (outputs) goods `steps` along. */
export interface Level {
  buying: boolean;
  steps: number;
  /** Connected-port indices, ascending. */
  ports: number[];
}

/** What a level trades at a point, in crafts. */
export function measureLevel(ctx: SolveContext, level: Level, externals: ArrayLike<number>): number {
  let total = 0;
  for (const p of level.ports) total += externals[p]! * ctx.externalWeight(p);
  return total;
}

/** The levels in the order AUTO settles them. */
export function levels(ctx: SolveContext): Level[] {
  const byKey = new Map<number, number[]>();
  const model = ctx.model;
  for (let p = 0; p < model.connectedPorts.length; p++) {
    const buying = model.connectedPorts[p]!.input;
    // ascending key order = buying (0) before selling (1), then steps descending
    const key = (buying ? 0 : 1) * 4294967296 - model.portSteps[p]!;
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }
  return [...byKey.keys()]
    .sort((a, b) => a - b)
    .map((key) => {
      const ports = byKey.get(key)!;
      const first = ports[0]!;
      return { buying: model.connectedPorts[first]!.input, steps: model.portSteps[first]!, ports };
    });
}

/** What the trading is held to: per level settled so far, at most what it was solved to. */
export interface Trades {
  /** The only gates the plan may trade at (every gate when null). */
  open: ReadonlySet<number> | null;
  levels: Level[];
  caps: number[];
}

export function tradesWithin(open: ReadonlySet<number> | null): Trades {
  return { open, levels: [], caps: [] };
}

export function holding(trades: Trades, level: Level, cap: number): Trades {
  return { open: trades.open, levels: [...trades.levels, level], caps: [...trades.caps, cap] };
}

/**
 * Where a level is held once solved: exactly where it was reached. A billionth of how fast the plan's machines run
 * is rounding, not a trade: it closes the level outright.
 */
export function heldAt(reached: number, extents: ArrayLike<number>): number {
  const rounding = NUMERICS.heldAtRounding * Math.max(1, scaleOf(extents));
  return reached <= rounding ? 0 : reached;
}

/** The base model with the open gates and every held level applied. */
export function tradeModel(ctx: SolveContext, held: Trades): ModelLp {
  const lp = baseModel(ctx);
  if (held.open !== null) closeGatesOutside(ctx, lp, held.open);
  held.levels.forEach((level, i) => {
    const cap = held.caps[i]!;
    if (cap <= 0) {
      for (const p of level.ports) lp.closeExt(p);
      return;
    }
    lp.addRow(
      level.ports.map((p) => lp.extCol(p)),
      level.ports.map((p) => ctx.externalWeight(p)),
      -Infinity,
      cap,
    );
  });
  return lp;
}

/** The least the plan can trade at `level`, with `held`'s levels held. */
export function leastAt(ctx: SolveContext, held: Trades, level: Level): SolveResult {
  const lp = tradeModel(ctx, held);
  for (const p of level.ports) lp.setExtCost(p, ctx.externalWeight(p));
  return runModel(ctx, lp, (level.buying ? "least buying at " : "least selling at ") + level.steps + " steps");
}

export type TradeOutcome = { ok: true; held: Trades } | { ok: false; rejection: Note };

/** The plan's trading settled level by level, trading only at `open`'s gates (every gate when null). */
export function settleTrades(ctx: SolveContext, open: ReadonlySet<number> | null = null): TradeOutcome {
  let held = tradesWithin(open);
  for (const level of levels(ctx)) {
    const least = leastAt(ctx, held, level);
    if (!least.ok) return { ok: false, rejection: least.rejection };
    held = holding(held, level, heldAt(measureLevel(ctx, level, least.point.externals), least.point.extents));
  }
  return { ok: true, held };
}
