/**
 * The Up to read-out (docs/up-to.md, "The read-out"; `SolutionView.upTo`): why each Up to card runs where it does at
 * the committed point. Every answer is a probe's optimum compared with the point, under the trading the point was
 * settled under (`ctx.committedTrades`); one counted budget per island (MAX_READOUT_LPS models, work never time), past
 * which a pool's reason is null.
 *
 * - At its capacity: would the rest of the plan use more of it? With its cap and every push band gone, the Up to pools
 *   it feeds (wire by wire, downstream) and the unmet drawers it feeds can do better than now: BOTTLENECK, wanting the
 *   least machine time that does it; else FULL. Only what it feeds counts: a pool upstream that it holds back is that
 *   pool's CLOGGED, not this one's BOTTLENECK (old Build's rule: a bottleneck has someone waiting on its output). An
 *   Exactly card on one of its output networks that a forced input still feeds wants more too: that input over its
 *   per-machine rate.
 * - Below it, with every other pool held at least at its level (free to rise, never to give way): a free supply at an
 *   input that raises it is STARVED, else a free sink at an output that does is CLOGGED (UNUSED at zero), else
 *   LIMITED. Inputs (then outputs) are tried all together first, and one by one only when that raises it. Others are
 *   held from below only: held at their levels from above too, a pool in a chain would be pinned from both sides (its
 *   feeder could not send more, its taker could not take more) and no single port could ever explain it.
 */
import type { SolveContext } from "./context";
import { compareIds } from "./ids";
import { levelTerms, priceLevel, runModel, type ModelLp, type SolveResult } from "./lp";
import { portKey } from "./model";
import { keptUpTo, levelOf } from "./push";
import { tradeModel, type Trades } from "./trade";
import type { Id, PortRef, UpToReadout, UpToReason } from "./types";
import { NUMERICS } from "./validate";

/** The read-out's models per island. */
export const MAX_READOUT_LPS = 96;
/** A pool within this of its capacity (in levels) is at it. */
export const AT_CAPACITY = 1e-6;

/** Counted work: a model runs only while the budget lasts; once one is refused, every later pool reads null. */
class Budget {
  left = MAX_READOUT_LPS;
  spent = false;

  run(ctx: SolveContext, lp: ModelLp, label: string): SolveResult | "spent" {
    if (this.spent || this.left <= 0) {
      this.spent = true;
      return "spent";
    }
    this.left--;
    return runModel(ctx, lp, label);
  }
}

type Why = { reason: UpToReason; port?: PortRef; tied?: PortRef[]; wants?: number };

/** The read-out of every Up to pool, by `node`; undefined when the context has none. */
export function readUpTo(ctx: SolveContext): UpToReadout[] | undefined {
  const pools = ctx.upToPools;
  if (pools.length === 0) return undefined;
  const point = ctx.point!;
  const trades = ctx.committedTrades;
  const budget = new Budget();
  const read = new Map<number, UpToReadout>();
  for (const p of pools) {
    const data = ctx.model.pools[p]!;
    const machines = data.machines.map((m) => ctx.model.machines[m]!.spec.id);
    const readout: UpToReadout = {
      node: machines[0]!,
      machines,
      capacity: data.capacity,
      reached: ctx.poolTime(p, point.extents),
      reason: null,
    };
    const why = trades === null || budget.spent ? null : reasonOf(ctx, p, trades, budget);
    read.set(p, why === null ? readout : { ...readout, ...why });
  }
  for (const p of pools) {
    const readout = read.get(p)!;
    if (readout.reason !== "STARVED" || readout.port === undefined) continue;
    const upstream = upstreamOf(ctx, p, readout.port, read);
    if (upstream.length > 0) readout.upstream = upstream;
  }
  return [...read.values()].sort((a, b) => compareIds(a.node, b.node));
}

/** Null when the budget ran out on the way. */
function reasonOf(ctx: SolveContext, pool: number, trades: Trades, budget: Budget): Why | null {
  const level = levelOf(ctx, pool, ctx.point!.extents);
  return level >= 1 - AT_CAPACITY
    ? wantsOf(ctx, pool, trades, budget)
    : holdBackOf(ctx, pool, level, trades, budget);
}

// ---------------------------------------------------------------------------
// At its capacity: FULL or BOTTLENECK
// ---------------------------------------------------------------------------

/** The machines a pool's outputs reach, wire by wire (its own only round a loop). */
function downstreamOf(ctx: SolveContext, pool: number): Set<number> {
  const model = ctx.model;
  const outputs: number[][] = model.machines.map(() => []);
  model.connectedPorts.forEach((port, p) => {
    if (!port.input) outputs[port.machine]!.push(p);
  });
  const reached = new Set<number>();
  const queue = [...model.pools[pool]!.machines];
  while (queue.length > 0) {
    const m = queue.pop()!;
    for (const p of outputs[m]!) {
      for (const e of model.connectedPorts[p]!.edges) {
        const taker = model.connectedPorts[model.edges[e]!.dstPort]!.machine;
        if (!reached.has(taker)) {
          reached.add(taker);
          queue.push(taker);
        }
      }
    }
  }
  return reached;
}

/** An unmet drawer asking for flow, and the rate it asked for. */
interface Unmet {
  drawer: number;
  target: number;
}

/** The unmet drawers with a lower bound linked to the pool or to what it feeds, in shortfall order. */
function unmetFed(ctx: SolveContext, pool: number, below: ReadonlySet<number>): Unmet[] {
  const model = ctx.model;
  const own = new Set(model.pools[pool]!.machines);
  const out: Unmet[] = [];
  for (const shortfall of ctx.shortfalls) {
    if (shortfall.rule !== "AT_LEAST" && shortfall.rule !== "EXACTLY") continue;
    if (!(shortfall.target > 0)) continue;
    const d = model.drawers.findIndex((row) => row.id === shortfall.drawer);
    if (d < 0 || out.some((u) => u.drawer === d)) continue;
    const fed = model.drawers[d]!.links.some((link) => {
      const m = model.machineIndex.get(link.node);
      return m !== undefined && (own.has(m) || below.has(m));
    });
    if (fed) out.push({ drawer: d, target: shortfall.target });
  }
  return out;
}

/** A drawer's total as row terms, over `scale`. */
function drawerTerms(
  ctx: SolveContext,
  lp: ModelLp,
  d: number,
  scale: number,
): { cols: number[]; vals: number[] } {
  const row = ctx.model.drawers[d]!;
  const cols: number[] = [];
  const vals: number[] = [];
  row.extentMachines.forEach((m, i) => {
    cols.push(lp.extentCol(m));
    vals.push(row.extentQty[i]! / scale);
  });
  for (const e of row.flowEdges) {
    cols.push(lp.flowCol(e));
    vals.push(1 / scale);
  }
  for (const p of row.externalPorts) {
    cols.push(lp.extCol(p));
    vals.push(1 / scale);
  }
  return { cols, vals };
}

/**
 * The model of "would the plan use more": the trading held, the pool's cap and every push band gone; the objective
 * (to maximise) is the fed pools' levels and the fed drawers' met fractions, returned as row terms.
 */
function usingModel(
  ctx: SolveContext,
  pool: number,
  trades: Trades,
  fedPools: readonly number[],
  fedDrawers: readonly Unmet[],
): { lp: ModelLp; cols: number[]; vals: number[] } {
  ctx.droppedPools.add(pool);
  let lp: ModelLp;
  try {
    lp = tradeModel(ctx, { ...trades, floors: [] });
  } finally {
    ctx.droppedPools.delete(pool);
  }
  const cols: number[] = [];
  const vals: number[] = [];
  for (const q of fedPools) {
    const terms = levelTerms(ctx, lp, q);
    cols.push(...terms.cols);
    vals.push(...terms.vals);
  }
  for (const { drawer, target } of fedDrawers) {
    // Its met fraction: f in 0..1 with total / target - f >= 0.
    const f = lp.addColumn(0, 1, 0);
    const terms = drawerTerms(ctx, lp, drawer, target);
    lp.addRow([...terms.cols, f], [...terms.vals, -1], 0, Infinity);
    cols.push(f);
    vals.push(1);
  }
  return { lp, cols, vals };
}

/** The value of row terms at a model's solution. */
function valueOf(cols: readonly number[], vals: readonly number[], x: readonly number[]): number {
  let total = 0;
  cols.forEach((c, i) => {
    total += vals[i]! * x[c]!;
  });
  return total;
}

/** Whether a machine's count is pinned exactly: a hard pin of its own, or an exact pool. */
function isExact(ctx: SolveContext, m: number): boolean {
  if (!Number.isNaN(ctx.pinnedExtent[m]!)) return true;
  return ctx.model.pools.some(
    (pool, p) => pool.exact && !ctx.droppedPools.has(p) && pool.machines.includes(m),
  );
}

/**
 * Machines an Exactly card on one of the pool's output networks still needs: each forced input there (a wired port with
 * no drawer bringing material in) over the pool's per-machine rate of that output.
 */
function forcedDemand(ctx: SolveContext, pool: number): number {
  const model = ctx.model;
  const point = ctx.point!;
  const dust = NUMERICS.dust * ctx.solutionScaleOf(point);
  const drawn = new Set<number>();
  for (const row of model.drawers) for (const p of row.externalPorts) drawn.add(p);
  const counted = new Set<number>();
  let demand = 0;
  for (const m of model.pools[pool]!.machines) {
    model.connectedPorts.forEach((out, o) => {
      if (out.machine !== m || out.input) return;
      const perMachine = out.qtyPerCraft / ctx.countOf(m, 1);
      if (!(perMachine > 0)) return;
      const network = model.portComponent[o]!;
      model.connectedPorts.forEach((port, q) => {
        if (!port.input || model.portComponent[q] !== network || counted.has(q) || drawn.has(q))
          return;
        if (!isExact(ctx, port.machine) || !(point.externals[q]! > dust)) return;
        counted.add(q);
        demand += point.externals[q]! / perMachine;
      });
    });
  }
  return demand;
}

function wantsOf(ctx: SolveContext, pool: number, trades: Trades, budget: Budget): Why | null {
  const point = ctx.point!;
  const capacity = ctx.model.pools[pool]!.capacity;
  const below = downstreamOf(ctx, pool);
  const fedPools = keptUpTo(ctx).filter(
    (q) => q !== pool && ctx.model.pools[q]!.machines.some((m) => below.has(m)),
  );
  const fedDrawers = unmetFed(ctx, pool, below);
  let wants: number | null = null;
  if (fedPools.length > 0 || fedDrawers.length > 0) {
    let now = 0;
    for (const q of fedPools) now += levelOf(ctx, q, point.extents);
    for (const { drawer, target } of fedDrawers) {
      now += Math.min(
        1,
        ctx.drawerTotal(drawer, point.extents, point.flows, point.externals) / target,
      );
    }
    const most = usingModel(ctx, pool, trades, fedPools, fedDrawers);
    most.cols.forEach((c, i) => {
      most.lp.cost[c] = most.lp.cost[c]! - most.vals[i]!;
    });
    const used = budget.run(ctx, most.lp, "up to: would the plan use more");
    if (used === "spent") return null;
    const best = used.ok ? valueOf(most.cols, most.vals, used.x) : now;
    if (best > now + NUMERICS.readoutTol * Math.max(1, most.cols.length)) {
      // The least of it that does: hold the optimum (the first model's own point keeps it, so no room), then the
      // pool's own machine time as low as it goes.
      const least = usingModel(ctx, pool, trades, fedPools, fedDrawers);
      least.lp.addRow(least.cols, least.vals, best, Infinity);
      priceLevel(ctx, least.lp, pool, 1);
      const takes = budget.run(ctx, least.lp, "up to: how many it would take");
      if (takes === "spent") return null;
      if (takes.ok) {
        const time = ctx.poolTime(pool, takes.point.extents);
        if (time > capacity * (1 + NUMERICS.readoutTol)) wants = time;
      }
    }
  }
  const forced = forcedDemand(ctx, pool);
  if (forced > 0) wants = (wants ?? capacity) + forced;
  return wants === null ? { reason: "FULL" } : { reason: "BOTTLENECK", wants };
}

// ---------------------------------------------------------------------------
// Below its capacity: STARVED, CLOGGED, UNUSED or LIMITED
// ---------------------------------------------------------------------------

/** A port a probe can give a free end: a wired one by a free column, an unwired one by lifting its drawers' caps. */
interface Feed {
  ref: PortRef;
  /** The connected port, or null when unwired. */
  port: number | null;
  /** Unwired: the capped drawers linked to it. */
  drawers: number[];
}

/**
 * The pool's ports on one side a free end could matter at, in machine then port order: every wired one, and every
 * unwired one a capped source (inputs) or product (outputs) drawer is linked to. Other unwired ports already are free.
 */
function feedsOf(ctx: SolveContext, pool: number, input: boolean): Feed[] {
  const model = ctx.model;
  const feeds: Feed[] = [];
  for (const m of model.pools[pool]!.machines) {
    const md = model.machines[m]!;
    (input ? md.inQty : md.outQty).forEach((qty, i) => {
      if (!(qty > 0)) return;
      const ref: PortRef = { node: md.spec.id, port: i, input };
      const port = model.portLookup.get(portKey(m, i, input));
      if (port !== undefined) {
        feeds.push({ ref, port, drawers: [] });
        return;
      }
      const drawers: number[] = [];
      model.drawers.forEach((row, d) => {
        if (row.kind !== (input ? "SOURCE" : "PRODUCT") || Number.isNaN(ctx.drawerUpper[d]!))
          return;
        if (row.links.some((l) => l.node === ref.node && l.port === ref.port && l.input === input))
          drawers.push(d);
      });
      if (drawers.length > 0) feeds.push({ ref, port: null, drawers });
    });
  }
  return feeds;
}

/** Whether free ends at `feeds` raise the pool's level past `level`, others held in their bands. */
function raises(
  ctx: SolveContext,
  pool: number,
  level: number,
  held: Trades,
  feeds: readonly Feed[],
  label: string,
  budget: Budget,
): boolean | "spent" {
  const saved = new Map<number, number>();
  for (const f of feeds)
    for (const d of f.drawers) if (!saved.has(d)) saved.set(d, ctx.drawerUpper[d]!);
  for (const d of saved.keys()) ctx.drawerUpper[d] = Number.NaN;
  let lp: ModelLp;
  try {
    lp = tradeModel(ctx, held);
  } finally {
    for (const [d, upper] of saved) ctx.drawerUpper[d] = upper;
  }
  for (const f of feeds) if (f.port !== null) lp.feedPort(f.port);
  priceLevel(ctx, lp, pool, -1);
  const result = budget.run(ctx, lp, label);
  if (result === "spent") return "spent";
  return result.ok && levelOf(ctx, pool, result.point.extents) > level + NUMERICS.readoutTol;
}

/** The first of `feeds` whose free end alone raises the pool, and the others that do; null when none does. */
function shortAt(
  ctx: SolveContext,
  pool: number,
  level: number,
  held: Trades,
  feeds: readonly Feed[],
  label: string,
  budget: Budget,
): { port: PortRef; tied?: PortRef[] } | null | "spent" {
  if (feeds.length === 0) return null;
  const together = raises(ctx, pool, level, held, feeds, label + " (all)", budget);
  if (together !== true) return together === "spent" ? "spent" : null;
  if (feeds.length === 1) return { port: feeds[0]!.ref };
  let port: PortRef | null = null;
  const tied: PortRef[] = [];
  for (const f of feeds) {
    const alone = raises(ctx, pool, level, held, [f], label, budget);
    if (alone === "spent") return "spent";
    if (!alone) continue;
    if (port === null) port = f.ref;
    else tied.push(f.ref);
  }
  if (port === null) return null;
  return tied.length > 0 ? { port, tied } : { port };
}

function holdBackOf(
  ctx: SolveContext,
  pool: number,
  level: number,
  trades: Trades,
  budget: Budget,
): Why | null {
  // Every other pool at least at its level, free to rise; this one free under its cap.
  const held: Trades = {
    ...trades,
    floors: trades.floors.filter((b) => b.pool !== pool).map((b) => ({ ...b, hi: 1 })),
  };
  const starved = shortAt(
    ctx,
    pool,
    level,
    held,
    feedsOf(ctx, pool, true),
    "up to: a free supply",
    budget,
  );
  if (starved === "spent") return null;
  if (starved !== null) return { reason: "STARVED", ...starved };
  const clogged = shortAt(
    ctx,
    pool,
    level,
    held,
    feedsOf(ctx, pool, false),
    "up to: a free sink",
    budget,
  );
  if (clogged === "spent") return null;
  if (clogged !== null) {
    const point = ctx.point!;
    const dust = NUMERICS.dust * ctx.solutionScaleOf(point);
    const idle = ctx.model.pools[pool]!.machines.every((m) => point.extents[m]! <= dust);
    return { reason: idle ? "UNUSED" : "CLOGGED", ...clogged };
  }
  return { reason: "LIMITED" };
}

/** STARVED's `upstream`: the FULL or BOTTLENECK Up to pools making what the short input takes, by `node`. */
function upstreamOf(
  ctx: SolveContext,
  pool: number,
  short: PortRef,
  read: ReadonlyMap<number, UpToReadout>,
): Id[] {
  const model = ctx.model;
  const m = model.machineIndex.get(short.node);
  const port = m === undefined ? undefined : model.portLookup.get(portKey(m, short.port, true));
  if (port === undefined) return [];
  const network = model.portComponent[port]!;
  const out: Id[] = [];
  for (const q of ctx.upToPools) {
    if (q === pool) continue;
    const readout = read.get(q)!;
    if (readout.reason !== "FULL" && readout.reason !== "BOTTLENECK") continue;
    const members = new Set(model.pools[q]!.machines);
    const makes = model.connectedPorts.some(
      (cp, p) => !cp.input && members.has(cp.machine) && model.portComponent[p] === network,
    );
    if (makes) out.push(readout.node);
  }
  return out.sort(compareIds);
}
