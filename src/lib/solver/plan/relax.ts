/**
 * Drawer relaxation (spec-solver 3.5.2; Java `DrawerRelaxation`). Pins are the player's hard word; a drawer's rate is a
 * wish. When a pass stalls with drawer bounds in the model, this solves the most permissive model there is (every gate
 * open, every external free, pins and pools held) with each drawer bound given a priced slack. The drawers that needed
 * slack are unmet: their bounds are loosened to what the relaxed point reaches, the core re-runs the chain once on a
 * fresh context under them, and each unmet drawer is told what holds it back (pins, other drawers, pools), found by
 * dropping them one at a time, capped at MAX_PROBES models for the whole relaxation.
 */
import { note, type SolveContext } from "./context";
import { relaxedModel, runModel } from "./lp";
import type { Id, Note, Shortfall } from "./types";
import { NUMERICS } from "./validate";

/** How far a loosened bound sits past the relaxed point, relative, so the re-run is not on a knife edge. */
export const LOOSEN = 1e-7;
/** Cap on the drop-one probes across all unmet drawers. */
export const MAX_PROBES = 32;

interface Relaxed {
  slack: number[];
  total: number[];
}

/** The relaxed LP over the context's current pins, bounds and pools; null when infeasible. */
function solveRelaxed(ctx: SolveContext): Relaxed | null {
  const lp = relaxedModel(ctx);
  const result = runModel(ctx, lp, "drawer relaxation");
  if (!result.ok) return null;
  const drawers = ctx.model.drawers.length;
  const slack = new Array<number>(drawers).fill(0);
  const total = new Array<number>(drawers).fill(0);
  for (let d = 0; d < drawers; d++) {
    const under = lp.drawerUnder[d]!;
    const over = lp.drawerOver[d]!;
    slack[d] = (under >= 0 ? result.x[under]! : 0) + (over >= 0 ? result.x[over]! : 0);
    total[d] = ctx.drawerTotal(d, result.point.extents, result.point.externals);
  }
  return { slack, total };
}

/** Whether drawer `d` needed slack at the relaxed point (judged by the context's ORIGINAL bounds). */
function missed(ctx: SolveContext, relaxed: Relaxed, d: number): boolean {
  const lower = ctx.drawerLower[d]!;
  const upper = ctx.drawerUpper[d]!;
  if (Number.isNaN(lower) && Number.isNaN(upper)) return false;
  const bound = Math.max(Number.isNaN(lower) ? 0 : Math.abs(lower), Number.isNaN(upper) ? 0 : Math.abs(upper));
  return relaxed.slack[d]! > NUMERICS.validateTol * Math.max(1, bound);
}

function keptWithout(ctx: SolveContext, d: number): boolean {
  const relaxed = solveRelaxed(ctx);
  return relaxed !== null && !missed(ctx, relaxed, d);
}

/**
 * Relaxes the drawer bounds of a stalled run: a function that applies the outcome to a FRESH context, or null when the
 * drawers are not why it stalled. Leaves `ctx`'s pins, bounds and pools as it found them.
 */
export function drawerRelaxation(ctx: SolveContext): ((fresh: SolveContext) => void) | null {
  const base = solveRelaxed(ctx);
  if (base === null) return null;
  const drawers = ctx.model.drawers.length;
  const lower = ctx.drawerLower.slice();
  const upper = ctx.drawerUpper.slice();
  const short: number[] = [];
  for (let d = 0; d < drawers; d++) {
    if (!missed(ctx, base, d)) continue;
    short.push(d);
    const total = base.total[d]!;
    const eps = LOOSEN * Math.max(1, Math.abs(total));
    if (!Number.isNaN(lower[d]!)) lower[d] = Math.max(0, Math.min(lower[d]!, total - eps));
    if (!Number.isNaN(upper[d]!)) upper[d] = Math.max(upper[d]!, total + eps);
  }
  if (short.length === 0) return null;

  const unmet: Id[] = [];
  const shortfalls: Shortfall[] = [];
  const notes: Note[] = [];
  let probes = 0;
  for (const d of short) {
    const row = ctx.model.drawers[d]!;
    if (!unmet.includes(row.id)) unmet.push(row.id);
    notes.push(note("DRAWER_UNMET", row.label, note(`RULE_${row.rule}` as "RULE_ANY"), row.rate, base.total[d]!));
    const nodes: Id[] = [];
    const others: Id[] = [];
    let groups = 0;
    const limits: Note[] = [];
    for (let m = 0; m < ctx.model.machines.length; m++) {
      if (Number.isNaN(ctx.pinnedExtent[m]!)) continue;
      if (probes++ >= MAX_PROBES) break;
      const saved = ctx.pinnedExtent[m]!;
      ctx.pinnedExtent[m] = Number.NaN;
      try {
        if (keptWithout(ctx, d)) {
          const md = ctx.model.machines[m]!;
          nodes.push(md.spec.id);
          limits.push(note("LIMIT_PIN", md.spec.name, note(ctx.pinKind[m]!)));
        }
      } finally {
        ctx.pinnedExtent[m] = saved;
      }
    }
    for (let e = 0; e < drawers; e++) {
      if (e === d || (Number.isNaN(ctx.drawerLower[e]!) && Number.isNaN(ctx.drawerUpper[e]!))) continue;
      if (probes++ >= MAX_PROBES) break;
      const savedLower = ctx.drawerLower[e]!;
      const savedUpper = ctx.drawerUpper[e]!;
      ctx.drawerLower[e] = Number.NaN;
      ctx.drawerUpper[e] = Number.NaN;
      try {
        if (keptWithout(ctx, d)) {
          const other = ctx.model.drawers[e]!;
          others.push(other.id);
          limits.push(note("LIMIT_DRAWER", other.label));
        }
      } finally {
        ctx.drawerLower[e] = savedLower;
        ctx.drawerUpper[e] = savedUpper;
      }
    }
    for (let p = 0; p < ctx.model.pools.length; p++) {
      if (probes++ >= MAX_PROBES) break;
      ctx.droppedPools.add(p);
      try {
        if (keptWithout(ctx, d)) {
          groups++;
          limits.push(note("LIMIT_GROUP", ctx.model.pools[p]!.capacity));
        }
      } finally {
        ctx.droppedPools.delete(p);
      }
    }
    for (const limit of limits) notes.push(note("DRAWER_LIMITED_BY", row.label, limit));
    shortfalls.push({
      drawer: row.id,
      rule: row.rule,
      target: row.rate,
      reachable: base.total[d]!,
      limitingNodes: nodes,
      limitingDrawers: others,
      limitingGroups: groups,
    });
  }
  return (fresh) => {
    for (let d = 0; d < drawers; d++) {
      fresh.drawerLower[d] = lower[d]!;
      fresh.drawerUpper[d] = upper[d]!;
    }
    for (const id of unmet) if (!fresh.unmetDrawers.includes(id)) fresh.unmetDrawers.push(id);
    fresh.shortfalls.push(...shortfalls);
    fresh.notes.push(...notes);
  };
}
