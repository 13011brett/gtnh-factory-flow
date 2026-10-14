/**
 * The plan's leftovers and who bears them (spec-solver 3.8; Java `Spares`). When pinned machines disagree, something
 * leaves the plan (or comes into it) at a wired port with no drawer: an open gate. The alternatives search finds each
 * single place; this groups them per leftover and honours a stored split by mixing their points. A split is shares of
 * the leftover (unitless, summing to one), never amounts. Any mix of points the chain itself reached keeps every linear
 * row, so the mix is checked like any other point and dropped for the solver's own when it does not conserve.
 */
import type { SolveContext, StageOutcome } from "./context";
import { keyString } from "./enumerate";
import { portKey } from "./model";
import type { Alternative, Alternatives, Bearer, External, Leftover, PortRef } from "./types";
import { NUMERICS, scaleOf } from "./validate";

/** A bearer key: `${node}:${i|o}:${port}`. */
export function bearerKey(ref: PortRef): string {
  return `${ref.node}${ref.input ? ":i:" : ":o:"}${ref.port}`;
}

interface Draft {
  key: string;
  importing: boolean;
  options: Alternative[];
  vertices: StageOutcome[];
  shares: number[] | null;
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The stored split for these bearers, normalised to them; null when none applies. */
function shares(
  keys: string[],
  exact: Record<string, number> | undefined,
  stored: Record<string, Record<string, number>>,
): number[] | null {
  let split = exact;
  if (split === undefined) {
    let best = 1;
    for (const candidate of Object.values(stored)) {
      let common = 0;
      for (const k of keys) if (has(candidate, k)) common++;
      if (common > best) {
        best = common;
        split = candidate;
      }
    }
  }
  if (split === undefined) return null;
  const chosen = split;
  const out = keys.map((k) => Math.max(0, has(chosen, k) ? chosen[k]! : 0));
  const total = out.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  return out.map((s) => s / total);
}

function addMix(into: number[], vertex: ArrayLike<number>, own: ArrayLike<number>, w: number): void {
  if (w === 0) return;
  for (let i = 0; i < into.length; i++) into[i]! += w * (vertex[i]! - own[i]!);
}

const clampDust = (values: number[]): void => {
  for (let i = 0; i < values.length; i++) if (values[i]! < 0) values[i] = 0;
};

/**
 * The leftovers on the committed point, from its alternatives and their points, with `stored` splits applied: when any
 * applies, the mix is committed on `ctx`. A leftover with one possible place is listed too.
 */
export function applySpares(
  ctx: SolveContext,
  alternatives: Alternatives,
  points: ReadonlyMap<string, StageOutcome>,
  stored: Record<string, Record<string, number>>,
): Leftover[] {
  const own = ctx.point;
  if (own === null) return [];
  // The options per decision (the open gate each would replace), in the order the search listed them.
  const byDecision = new Map<string, Alternative[]>();
  for (const option of alternatives.options) {
    const k = bearerKey(option.replaces);
    const list = byDecision.get(k);
    if (list) list.push(option);
    else byDecision.set(k, [option]);
  }
  const drafts: Draft[] = [];
  for (const options of byDecision.values()) {
    const current = options.find((o) => o.rank === "DEFAULT");
    if (current === undefined) continue;
    const importing = current.opens.input;
    const usable: Alternative[] = [];
    const vertices: StageOutcome[] = [];
    for (const option of options) {
      // A bearer on the other side would import and void at once: never mixed in.
      if (option.opens.input !== importing) continue;
      const point = option.rank === "DEFAULT" ? own : points.get(keyString(option.key));
      if (point === undefined) continue;
      usable.push(option);
      vertices.push(point);
    }
    if (usable.length === 0) continue;
    const keys = usable.map((o) => bearerKey(o.opens));
    const key = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join("|");
    const exact = has(stored, key) ? stored[key] : undefined;
    drafts.push({ key, importing, options: usable, vertices, shares: shares(keys, exact, stored) });
  }
  if (drafts.length === 0) return [];

  // The mix: the solver's own point, moved by each leftover's split.
  let anyCustom = false;
  const extents = own.extents.slice();
  const flows = own.flows.slice();
  const externals = own.externals.slice();
  for (const d of drafts) {
    if (d.shares === null) continue;
    anyCustom = true;
    d.vertices.forEach((v, b) => {
      const w = d.shares![b]!;
      addMix(extents, v.extents, own.extents, w);
      addMix(flows, v.flows, own.flows, w);
      addMix(externals, v.externals, own.externals, w);
    });
  }
  let mixed = false;
  if (anyCustom && ctx.validate(extents, flows, externals) === null) {
    clampDust(extents);
    clampDust(flows);
    clampDust(externals);
    ctx.commit(ctx.outcome(extents, flows, externals));
    mixed = true;
  }

  const now = ctx.point!.externals;
  const dust = NUMERICS.dust * scaleOf(now);
  return drafts.map((d): Leftover => {
    const custom = mixed && d.shares !== null;
    const bearers = d.options.map((option, b): Bearer => {
      const flowsHere: External[] = [];
      const machine = ctx.model.machineIndex.get(option.opens.node);
      const port =
        machine === undefined
          ? undefined
          : ctx.model.portLookup.get(portKey(machine, option.opens.port, option.opens.input));
      if (port !== undefined) {
        for (const p of ctx.model.gates[ctx.model.portGate[port]!]!.ports) {
          if (now[p]! > dust) flowsHere.push({ port: ctx.refOf(p), ratePerSecond: now[p]! });
        }
      }
      let max = 0;
      for (const e of option.externals) max += e.ratePerSecond;
      const isCurrent = option.rank === "DEFAULT";
      return {
        anchor: option.opens,
        flows: flowsHere,
        max,
        share: custom ? d.shares![b]! : isCurrent ? 1 : 0,
        solverPick: isCurrent,
      };
    });
    return { key: d.key, importing: d.importing, bearers, custom };
  });
}
