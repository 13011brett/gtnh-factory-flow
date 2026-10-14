/**
 * Test-only island split (spec-solver 5), enough to check the cases whose tie-breaks depend on island-local indexing.
 * WP1c owns the real `islands.ts` and the merged read-out; this only cuts a `SolveInput` into its islands.
 */
import type { Id, SolveInput } from "./types-local";

export function splitIslands(input: SolveInput): SolveInput[] {
  const index = new Map<Id, number>();
  input.machines.forEach((m, i) => {
    if (!index.has(m.id)) index.set(m.id, i);
  });
  const root = input.machines.map((_, i) => i);
  const find = (i: number): number => {
    while (root[i] !== i) i = root[i]!;
    return i;
  };
  const join = (a: number | undefined, b: number | undefined) => {
    if (a === undefined || b === undefined) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) root[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (const e of input.edges) join(index.get(e.source), index.get(e.target));
  for (const p of input.pools) {
    const known = p.machines.map((m) => index.get(m)).filter((x): x is number => x !== undefined);
    for (const k of known.slice(1)) join(known[0], k);
  }
  for (const d of input.drawers) {
    const known = d.links.map((l) => index.get(l.node)).filter((x): x is number => x !== undefined);
    for (const k of known.slice(1)) join(known[0], k);
  }
  const numbering = new Map<number, number>();
  input.machines.forEach((_, i) => {
    const r = find(i);
    if (!numbering.has(r)) numbering.set(r, numbering.size);
  });
  const islandOf = (id: Id): number | undefined => {
    const i = index.get(id);
    return i === undefined ? undefined : numbering.get(find(i));
  };
  const k = numbering.size;
  return Array.from({ length: k }, (_, n) => ({
    mode: input.mode,
    choice: null,
    machines: input.machines.filter((m) => islandOf(m.id) === n),
    edges: input.edges.filter((e) => islandOf(e.source) === n),
    pools: input.pools.filter((p) => {
      const first = p.machines.find((m) => index.has(m));
      return (first === undefined ? 0 : islandOf(first)) === n;
    }),
    drawers: input.drawers.filter((d) => {
      const first = d.links.find((l) => index.has(l.node));
      return (first === undefined ? 0 : islandOf(first.node)) === n;
    }),
    extentPins: Object.fromEntries(Object.entries(input.extentPins).filter(([id]) => islandOf(id) === n)),
    spares: {},
  }));
}
