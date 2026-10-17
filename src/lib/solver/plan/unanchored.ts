/**
 * The parts of a plan that nothing sets (spec-solver 3.10; Java `Unanchored`): each group of recipes and drawers joined
 * by wires (or sharing a machine) with no pinned count, no target rate and no drawer asking for flow. The solve scales
 * those to nothing, so the board asks for a number there ("(set count)" / "Set rate").
 *
 * Defined on the board's graph, not on `SolveInput`; the types here are the slice of the graph it reads.
 */
import type { DrawerRule, Id } from "./types";

export interface UnanchoredGraph {
  nodes: Array<{
    id: Id;
    countFixed: boolean;
    /** An Up to pin (docs/up-to.md) anchors its part of the plan as an exact one does. */
    upTo?: boolean;
    targetOutputRates?: Record<number, number | null | undefined>;
    targetInputRates?: Record<number, number | null | undefined>;
  }>;
  edges: Array<{ source: Id; target: Id }>;
  drawers: Array<{
    id: Id;
    /** The EFFECTIVE rule (ANY for kinds without one). */
    rule: DrawerRule;
    rate: number;
    links: Array<{ node: Id }>;
  }>;
  /** Machine groups (shared machines), any of them. */
  groups: Array<{ nodeIds: Id[]; pinned: boolean; capacity: number }>;
}

const anyRate = (rates: Record<number, number | null | undefined> | undefined): boolean => {
  if (!rates) return false;
  for (const r of Object.values(rates)) if (r !== null && r !== undefined && r > 0) return true;
  return false;
};

/** The ids of every recipe and drawer in a part of the plan that nothing sets. */
export function unanchored(graph: UnanchoredGraph): Set<Id> {
  const parent = new Map<Id, Id>();
  for (const n of graph.nodes) parent.set(n.id, n.id);
  for (const d of graph.drawers) parent.set(d.id, d.id);
  const root = (start: Id): Id => {
    let id = start;
    for (;;) {
      const up = parent.get(id)!;
      if (up === id) return id;
      const next = parent.get(up)!;
      parent.set(id, next);
      id = next;
    }
  };
  const join = (a: Id, b: Id): void => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of graph.edges) join(e.source, e.target);
  for (const d of graph.drawers) for (const l of d.links) join(d.id, l.node);
  for (const g of graph.groups) {
    let first: Id | null = null;
    for (const id of g.nodeIds) {
      if (first === null) first = id;
      else join(first, id);
    }
  }

  const anchored = new Set<Id>();
  for (const n of graph.nodes) {
    if (n.countFixed || n.upTo || anyRate(n.targetOutputRates) || anyRate(n.targetInputRates)) anchored.add(root(n.id));
  }
  for (const d of graph.drawers) {
    if (d.rule !== "ANY" && d.rule !== "AT_MOST" && d.rate > 0 && d.links.length > 0) anchored.add(root(d.id));
  }
  for (const g of graph.groups) {
    if (g.pinned && g.capacity > 0) for (const id of g.nodeIds) if (parent.has(id)) anchored.add(root(id));
  }
  const out = new Set<Id>();
  for (const id of parent.keys()) if (!anchored.has(root(id))) out.add(id);
  return out;
}
