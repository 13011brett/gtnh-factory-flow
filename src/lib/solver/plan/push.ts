/**
 * The push (docs/up-to.md, "The push"): every Up to card as high as it goes, fairly, once the trading is held. A
 * pool's level `u` is its machine time over its capacity, in 0..1.
 *
 * - Stage A, everything runs: the most the levels can add up to, S (old Build's first stage: a fed machine with
 *   somewhere to put its output never idles).
 * - Stage B, fairness: progressive max-min over the levels with their sum held at S (old Build's round-robin split).
 *   Each round lifts the least level z of the pools not yet frozen. A pool is frozen at z only when a probe proves it
 *   cannot go higher (its own level maximised with every unfrozen pool at least z); a pool some feasible point of the
 *   round already shows above z is a certificate that it can, and is not probed.
 * - Hold: each level is held in a narrow band (`Trades.floors`: from the level to `bandAbove` over it) through least
 *   flow, the canonical point and every later model of the support.
 *
 * The levels are a property of the plan, not of the solve path: stage A's optimum is unique, so is the max-min vector
 * over a convex set, and every freeze is decided by a value (a probe's optimum), never by which vertex an engine
 * returns. A probe holds the unfrozen pools at z itself, not z less a tolerance: room there would add up over many
 * pools and let a stuck pool look as if it rose. Work is counted, never timed.
 */
import type { SolveContext } from "./context";
import { levelTerms, priceLevel, runModel, type ModelLp } from "./lp";
import { tradeModel, type Band, type Trades } from "./trade";
import { NUMERICS } from "./validate";

/** A pool's level at a point: its machine time over its capacity. */
export function levelOf(ctx: SolveContext, pool: number, extents: ArrayLike<number>): number {
  return ctx.poolTime(pool, extents) / ctx.model.pools[pool]!.capacity;
}

/** The Up to pools the models built now keep (the relaxation's and the read-out's probes drop some). */
export function keptUpTo(ctx: SolveContext): number[] {
  return ctx.upToPools.filter((p) => !ctx.droppedPools.has(p));
}

/** `level >= at` for one pool. */
function atLeast(ctx: SolveContext, lp: ModelLp, pool: number, at: number): void {
  const { cols, vals } = levelTerms(ctx, lp, pool);
  lp.addRow(cols, vals, at, Infinity);
}

/** A pool held from its level to a little over it, within 0..1. */
export function bandAt(pool: number, level: number): Band {
  return { pool, lo: Math.max(0, level), hi: Math.min(1, level + NUMERICS.bandAbove) };
}

/** Stage B's region: the held trading, stage A's sum (less its room), and the frozen pools at their levels. */
function fairRegion(
  ctx: SolveContext,
  held: Trades,
  pools: readonly number[],
  sum: number,
  frozen: ReadonlyMap<number, number>,
): ModelLp {
  const lp = tradeModel(ctx, held);
  const cols: number[] = [];
  const vals: number[] = [];
  for (const p of pools) {
    const terms = levelTerms(ctx, lp, p);
    cols.push(...terms.cols);
    vals.push(...terms.vals);
  }
  lp.addRow(cols, vals, sum - NUMERICS.pushTol * Math.max(1, sum), Infinity);
  for (const [p, level] of frozen) atLeast(ctx, lp, p, level);
  return lp;
}

/**
 * `held` with every Up to pool's level held in its band. Returns `held` itself when the context has no Up to pool the
 * models keep. A model that finds nothing (numerics) stops the push where it is: pools not yet frozen get no band.
 */
export function pushUpTo(ctx: SolveContext, held: Trades): Trades {
  const pools = keptUpTo(ctx);
  if (pools.length === 0) return held;
  const tol = NUMERICS.pushTol;

  // Stage A: everything runs.
  const all = tradeModel(ctx, held);
  for (const p of pools) priceLevel(ctx, all, p, -1);
  const most = runModel(ctx, all, "push: everything runs");
  if (!most.ok) return held;
  let sum = 0;
  for (const p of pools) sum += levelOf(ctx, p, most.point.extents);

  // One pool: stage A was its own maximum.
  const levels = new Map<number, number>();
  if (pools.length === 1) levels.set(pools[0]!, Math.min(1, Math.max(0, sum)));

  // Stage B: fairness, round by round.
  let active = pools.filter((p) => !levels.has(p));
  while (active.length > 0) {
    const round = fairRegion(ctx, held, pools, sum, levels);
    const z = round.addColumn(0, 1, -1);
    for (const p of active) {
      const { cols, vals } = levelTerms(ctx, round, p);
      round.addRow([...cols, z], [...vals, -1], 0, Infinity);
    }
    const lifted = runModel(ctx, round, "push: fairness");
    if (!lifted.ok) break;
    const least = lifted.x[z]!;
    // Every one at its capacity (z sits on its own bound, 1, unless a pool is a hair short of it).
    if (least >= 1 - tol || active.length === 1) {
      // With one pool left, the round maximised that pool's level itself.
      for (const p of active) levels.set(p, least);
      break;
    }
    const candidates = active.filter((p) => levelOf(ctx, p, lifted.point.extents) <= least + tol);
    const rises = new Set<number>();
    const stuck: number[] = [];
    for (const p of candidates) {
      if (rises.has(p)) continue;
      const probe = fairRegion(ctx, held, pools, sum, levels);
      for (const q of active) atLeast(ctx, probe, q, least);
      priceLevel(ctx, probe, p, -1);
      const highest = runModel(ctx, probe, "push: can it rise");
      if (!highest.ok) {
        stuck.push(p);
        continue;
      }
      if (levelOf(ctx, p, highest.point.extents) <= least + tol) stuck.push(p);
      // Every point of the probe is a point of the round's region: a candidate above the level there can rise.
      for (const q of candidates)
        if (q !== p && levelOf(ctx, q, highest.point.extents) > least + tol) rises.add(q);
    }
    // A round that proves nothing stuck (numerics) freezes its candidates, so the push always ends.
    const freeze = stuck.length > 0 ? stuck : candidates.length > 0 ? candidates : active;
    for (const p of freeze) levels.set(p, least);
    active = active.filter((p) => !levels.has(p));
  }

  const bands: Band[] = [];
  for (const p of pools) {
    const level = levels.get(p);
    if (level !== undefined) bands.push(bandAt(p, level));
  }
  return { ...held, floors: [...held.floors, ...bands] };
}
