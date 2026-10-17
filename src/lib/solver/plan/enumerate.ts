/**
 * The alternatives search and the stored choice (spec-solver 3.6, 3.7; Java `Enumerator`, `Preference`). The FIXED
 * semantics: past the gate count every rule that narrows the field is a preference, so any answer with the same gate
 * count is listed, carrying the reason it is not the default (`Rank`). Work is counted (swap cap, option cap), never
 * timed, so the list is the same on every computer.
 */
import { canonicalHolding } from "./canonical";
import { note, type SolveContext, type StageOutcome } from "./context";
import { leastFlowHolding } from "./flow-min";
import { prepareGuard } from "./guard";
import { comparePortRef } from "./ids";
import { portKey } from "./model";
import { fixedQuantity, gatesThatMayHelp } from "./probes";
import { pushUpTo } from "./push";
import { levels, measureLevel, settleDrawers, settleTrades, type Trades } from "./trade";
import type { Alternative, Alternatives, ChoiceKey, External, Note, PortRef, Rank } from "./types";
import { NUMERICS, scaleOf } from "./validate";

/** Cap on gate swaps tried (times effort percent / 100). */
export const MAX_ALT_SWAPS = 1024;
/** Options listed per decision. */
export const MAX_ALT_OPTIONS = 8;
/** `Config.solverEffortPercent` clamped 25..200; the default is 100. */
export const DEFAULT_EFFORT_PERCENT = 100;

export function effort(tuned: number, percent = DEFAULT_EFFORT_PERCENT): number {
  const p = Math.min(200, Math.max(25, percent));
  return Math.max(1, Math.floor((tuned * p) / 100));
}

/** A set of gates as a stable map key. */
export function keyString(key: ChoiceKey): string {
  return key.gateAnchors.map((a) => `${a.node}:${a.input ? "i" : "o"}:${a.port}`).join(",");
}

/** `ChoiceKey` order: lexicographic over the anchors by `comparePortRef`, then by length. */
export function compareKeys(a: ChoiceKey, b: ChoiceKey): number {
  const n = Math.min(a.gateAnchors.length, b.gateAnchors.length);
  for (let i = 0; i < n; i++) {
    const c = comparePortRef(a.gateAnchors[i]!, b.gateAnchors[i]!);
    if (c !== 0) return c;
  }
  return a.gateAnchors.length - b.gateAnchors.length;
}

const sorted = (gates: Iterable<number>): number[] => [...gates].sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

type Measure = (externals: ArrayLike<number>, flows: ArrayLike<number>) => number[];

interface Preference {
  measure: Measure;
  whenWorse: Rank | null;
  whenBetter: Rank | null;
}

/** AUTO's rules in the order it applies them: buying, selling, then least internal flow. */
function preferences(ctx: SolveContext): Preference[] {
  const all = levels(ctx);
  const perSide = (buying: boolean): Measure => {
    const mine = all.filter((l) => l.buying === buying);
    return (externals) => mine.map((level) => measureLevel(ctx, level, externals));
  };
  return [
    { measure: perSide(true), whenWorse: "BUYS_MORE", whenBetter: null },
    { measure: perSide(false), whenWorse: "SELLS_MORE", whenBetter: null },
    {
      measure: (_externals, flows) => {
        let total = 0;
        for (let i = 0; i < flows.length; i++) total += flows[i]!;
        return [total];
      },
      whenWorse: "MOVES_MORE",
      whenBetter: "MOVES_LESS",
    },
  ];
}

/** Derived from the preference sequence: default, what beats it, ties, then what it gave up (mildest first). */
export function displayOrder(): Rank[] {
  const prefs: Array<[Rank | null, Rank | null]> = [
    [null, "BUYS_MORE"],
    [null, "SELLS_MORE"],
    ["MOVES_LESS", "MOVES_MORE"],
  ];
  const order: Rank[] = ["DEFAULT"];
  for (let i = prefs.length - 1; i >= 0; i--) if (prefs[i]![0] !== null) order.push(prefs[i]![0]!);
  order.push("EQUALLY_VALID");
  for (let i = prefs.length - 1; i >= 0; i--) if (prefs[i]![1] !== null) order.push(prefs[i]![1]!);
  return order;
}

export const DISPLAY_ORDER = displayOrder();

/** Why `alt` is not the default: the earliest rule that separates the two. */
function rankOf(
  prefs: Preference[],
  alt: StageOutcome,
  incumbent: number[][],
  tolerance: number,
): Rank {
  for (let i = 0; i < Math.min(prefs.length, incumbent.length); i++) {
    const preference = prefs[i]!;
    const mine = preference.measure(alt.externals, alt.flows);
    const inc = incumbent[i]!;
    for (let k = 0; k < Math.min(mine.length, inc.length); k++) {
      if (mine[k]! > inc[k]! + tolerance) {
        if (preference.whenWorse !== null) return preference.whenWorse;
        break;
      }
      if (mine[k]! < inc[k]! - tolerance) {
        if (preference.whenBetter !== null) return preference.whenBetter;
        break;
      }
    }
  }
  return "EQUALLY_VALID";
}

// ---------------------------------------------------------------------------
// Evaluating a support
// ---------------------------------------------------------------------------

/**
 * The canonical point with exactly `open`'s gates allowed, settled as AUTO settles a plan: trades level by level, the
 * Up to push and the drawer stages (docs/up-to.md), then least flow and the canonical tie-break; with the trading and
 * bands it was pushed under (`SolveContext.committedTrades`). Null when they do not balance. Commits nothing.
 */
export function evaluateSupportWith(
  ctx: SolveContext,
  open: ReadonlySet<number>,
): { point: StageOutcome; trades: Trades } | null {
  prepareGuard(ctx);
  const settled = settleTrades(ctx, open);
  if (!settled.ok) return null;
  const trades = pushUpTo(ctx, settled.held);
  const drawn = settleDrawers(ctx, trades);
  const s3 = leastFlowHolding(ctx, drawn);
  if (!s3.ok) return null;
  return { point: canonicalHolding(ctx, drawn, s3.point), trades };
}

/** `evaluateSupportWith`'s point only. */
export function evaluateSupport(ctx: SolveContext, open: ReadonlySet<number>): StageOutcome | null {
  return evaluateSupportWith(ctx, open)?.point ?? null;
}

function asAlternative(
  ctx: SolveContext,
  externals: ArrayLike<number>,
  support: ReadonlySet<number>,
  replaced: number,
  opened: number,
  rank: Rank,
): Alternative {
  const dust = NUMERICS.dust * scaleOf(externals);
  const flows: External[] = [];
  for (const p of ctx.model.gates[opened]!.ports) {
    if (externals[p]! <= dust) continue;
    flows.push({ port: ctx.refOf(p), ratePerSecond: externals[p]! });
  }
  return {
    key: ctx.keyOf(support),
    replaces: ctx.anchorOf(replaced),
    opens: ctx.anchorOf(opened),
    externals: flows,
    rank,
  };
}

/** Counted work of one enumeration (budgets are counts, never clock time). */
export interface EnumerationStats {
  decisions: number;
  swaps: number;
  tried: number;
  found: number;
  shown: number;
}

/**
 * The answers around the committed point on `ctx`. Each answer's whole point is kept in `points` by its key (the
 * committed point under the default's key) so a split between answers can be made by mixing them (`spares.ts`).
 */
export function enumerate(
  ctx: SolveContext,
  points: Map<string, StageOutcome> = new Map(),
  stats?: EnumerationStats,
): Alternatives {
  const point = ctx.point!;
  const incumbent = point.support;
  const chosen = ctx.keyOf(incumbent);
  points.set(keyString(chosen), point);
  const options: Alternative[] = [];
  // One "this is what it does now" row per open gate: every question has its current answer at the top of its group.
  for (const gate of sorted(incumbent)) {
    options.push(asAlternative(ctx, point.externals, incumbent, gate, gate, "DEFAULT"));
  }
  const notes: Note[] = [];
  // Nothing else could open, so nothing else could differ.
  if (incumbent.size === 0 || ctx.model.gates.length === incumbent.size) {
    return { chosen, options, complete: true, notes };
  }

  let flowStar = 0;
  for (const f of point.flows) flowStar += f;
  let qtyStar = 0;
  for (let p = 0; p < point.externals.length; p++)
    qtyStar += point.externals[p]! * ctx.externalWeight(p);
  const prefs = preferences(ctx);
  const incumbentCost = prefs.map((pref) => pref.measure(point.externals, point.flows));
  const tol = NUMERICS.tieRel * Math.max(Math.max(flowStar, qtyStar), ctx.solutionScaleOf(point));

  // What the answer opens, gates carrying too little to show included: a swap keeps them open.
  const open = ctx.openGates.size === 0 ? incumbent : ctx.openGates;
  const decisions = sorted(incumbent);
  const movable = decisions.map((out) => {
    const without = new Set<number>();
    for (let g = 0; g < ctx.model.gates.length; g++) if (g !== out) without.add(g);
    return fixedQuantity(ctx, without).ok;
  });
  const swaps: Array<[number, number]> = [];
  decisions.forEach((out, i) => {
    if (!movable[i]) return;
    for (let into = 0; into < ctx.model.gates.length; into++)
      if (!open.has(into)) swaps.push([out, into]);
  });
  const cap = Math.min(swaps.length, effort(MAX_ALT_SWAPS));
  const tried = swaps.slice(0, cap);

  // The swaps that can balance at all (the rest are not asked about one by one; the budget above still counts them).
  const intos = new Map<number, number[]>();
  for (const [out, into] of tried) {
    const list = intos.get(out) ?? [];
    intos.set(out, list);
    list.push(into);
  }
  const workable = new Set<string>();
  for (const [out, list] of intos) {
    const rest = new Set(open);
    rest.delete(out);
    for (const into of gatesThatMayHelp(ctx, rest, list)) workable.add(`${out}:${into}`);
  }

  const byDecision = new Map<number, Alternative[]>();
  const seen = new Set<string>([keyString(chosen)]);
  for (const [out, into] of tried) {
    if (!workable.has(`${out}:${into}`)) continue;
    const trial = new Set(open);
    trial.delete(out);
    trial.add(into);
    const alt = evaluateSupport(ctx, trial);
    if (
      alt === null ||
      alt.support.size !== incumbent.size ||
      !alt.support.has(into) ||
      alt.support.has(out)
    )
      continue;
    const key = ctx.keyOf(alt.support);
    const text = keyString(key);
    if (seen.has(text)) continue;
    seen.add(text);
    points.set(text, alt);
    const list = byDecision.get(out) ?? [];
    byDecision.set(out, list);
    list.push(
      asAlternative(
        ctx,
        alt.externals,
        alt.support,
        out,
        into,
        rankOf(prefs, alt, incumbentCost, tol),
      ),
    );
  }

  const best = (a: Alternative, b: Alternative): number =>
    DISPLAY_ORDER.indexOf(a.rank) - DISPLAY_ORDER.indexOf(b.rank) || compareKeys(a.key, b.key);
  let complete = cap === swaps.length;
  let shown = 0;
  let found = 0;
  for (const out of sorted(byDecision.keys())) {
    const decision = byDecision.get(out)!;
    decision.sort(best);
    found += decision.length;
    if (decision.length > MAX_ALT_OPTIONS) {
      decision.length = MAX_ALT_OPTIONS;
      complete = false;
    }
    shown += decision.length;
    options.push(...decision);
  }
  options.sort((a, b) => comparePortRef(a.replaces, b.replaces) || best(a, b));
  if (shown < found) notes.push(note("SHOWING_CLOSEST", shown, found));
  if (cap < swaps.length) notes.push(note("STOPPED_EARLY", cap, swaps.length - cap));
  if (stats)
    Object.assign(stats, {
      decisions: decisions.length,
      swaps: swaps.length,
      tried: cap,
      found,
      shown,
    });
  return { chosen, options, complete, notes };
}

// ---------------------------------------------------------------------------
// The stored choice
// ---------------------------------------------------------------------------

/** The gate matching a stored anchor by ingredient, only when the match is unique. */
function resolveByIngredient(ctx: SolveContext, anchor: PortRef): number | null {
  const model = ctx.model;
  const machine = model.machines[model.machineIndex.get(anchor.node)!]!;
  const ports = anchor.input ? machine.spec.inputs : machine.spec.outputs;
  if (anchor.port < 0 || anchor.port >= ports.length) return null;
  const want = ports[anchor.port]!.resource;
  let found: number | null = null;
  for (let p = 0; p < model.connectedPorts.length; p++) {
    const cp = model.connectedPorts[p]!;
    if (cp.input !== anchor.input) continue;
    const spec = model.machines[cp.machine]!.spec;
    const candidate = (cp.input ? spec.inputs : spec.outputs)[cp.portIndex]!.resource;
    if (want !== candidate) continue;
    if (found !== null && found !== model.portGate[p]) return null; // ambiguous, so no answer
    found = model.portGate[p]!;
  }
  return found;
}

/** Whether a stored choice still names a support on this plan, or null when it does not. */
export function resolveChoice(ctx: SolveContext, choice: readonly PortRef[]): Set<number> | null {
  const support = new Set<number>();
  for (const anchor of choice) {
    const machine = ctx.model.machineIndex.get(anchor.node);
    if (machine === undefined) return null;
    const port = ctx.model.portLookup.get(portKey(machine, anchor.port, anchor.input));
    const gate = port !== undefined ? ctx.model.portGate[port]! : resolveByIngredient(ctx, anchor);
    if (gate === null) return null;
    // Two anchors on one gate: an edge has merged two ingredient components since the key was stored.
    if (support.has(gate)) return null;
    support.add(gate);
  }
  return support;
}

const sameSet = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Applies a stored choice, or says in a note why it could not be. Returns the point to commit: the incumbent when the
 * choice no longer fits or already is the answer; never null. When it is the choice's point, `ctx.committedTrades`
 * becomes the trading that point was settled under (the Up to read-out probes it).
 */
export function applyChoice(ctx: SolveContext, choice: readonly PortRef[]): StageOutcome {
  const incumbent = ctx.point!;
  const target = resolveChoice(ctx, choice);
  if (target === null) {
    ctx.notes.push(note("CHOICE_NO_LONGER_FITS"));
    return incumbent;
  }
  if (sameSet(target, incumbent.support)) return incumbent;
  const alt = evaluateSupportWith(ctx, target);
  if (alt === null || alt.point.support.size !== incumbent.support.size) {
    // Gate count is the one bar a choice may not fall below: it is a real optimum; the rest is preference.
    ctx.notes.push(note("CHOICE_NEEDS_MORE_GATES"));
    return incumbent;
  }
  ctx.committedTrades = alt.trades;
  return alt.point;
}
