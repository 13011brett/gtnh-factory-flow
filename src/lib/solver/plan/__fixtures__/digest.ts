/**
 * Turns a solver `Answer` into the golden digest form (spec 6.2, Java `SolverCorpus.digest`) so it can be compared with
 * `compare.ts`. Ports become `{nodeId, portIndex, input}`; sets (unneeded, limitingNodes, limitingDrawers) are sorted by
 * their JSON text; map key order does not matter to the comparer. Numbers are left as numbers.
 */
import type {
  Alternative,
  Alternatives,
  Answer,
  Bearer,
  ChoiceKey,
  DrawerReadout,
  External,
  Leftover,
  Note,
  NoteArg,
  PortRef,
  SolutionView,
  UpToReadout,
} from "./types-local";

const port = (p: PortRef) => ({ nodeId: p.node, portIndex: p.port, input: p.input });
const external = (e: External) => ({ port: port(e.port), ratePerSecond: e.ratePerSecond });
const key = (k: ChoiceKey) => ({ gateAnchors: k.gateAnchors.map(port) });
const setSorted = <T>(xs: T[]): T[] =>
  [...xs].sort((a, b) => {
    const x = JSON.stringify(a);
    const y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
const note = (n: Note): unknown => ({ message: n.message, args: n.args.map(noteArg) });
const noteArg = (a: NoteArg): unknown =>
  typeof a === "object" ? (Array.isArray(a) ? a.map(note) : note(a)) : a;
const readout = (d: DrawerReadout) => ({
  rates: d.rates,
  unmet: d.unmet,
  shortfalls: d.shortfalls.map((s) => ({
    drawer: s.drawer,
    rule: s.rule,
    target: s.target,
    reachable: s.reachable,
    limitingNodes: setSorted(s.limitingNodes),
    limitingDrawers: setSorted(s.limitingDrawers),
    limitingGroups: s.limitingGroups,
  })),
  ports: Object.fromEntries(Object.entries(d.ports).map(([id, list]) => [id, list.map(external)])),
  // What a buffer banks only when the plan banks (Up to plans): every golden before it reads the same.
  ...(d.banked !== undefined ? { banked: d.banked } : {}),
});
/** An Up to read-out as the mod's record reads: every field, null or empty where the website leaves one out. */
const upToReadout = (r: UpToReadout) => ({
  node: r.node,
  machines: r.machines,
  capacity: r.capacity,
  reached: r.reached,
  reason: r.reason,
  port: r.port === undefined ? null : port(r.port),
  tied: (r.tied ?? []).map(port),
  wants: r.wants ?? null,
  upstream: r.upstream ?? [],
});
const bearer = (b: Bearer) => ({
  anchor: port(b.anchor),
  flows: b.flows.map(external),
  max: b.max,
  share: b.share,
  solverPick: b.solverPick,
});
const leftover = (l: Leftover) => ({
  key: l.key,
  importing: l.importing,
  bearers: l.bearers.map(bearer),
  custom: l.custom,
});
const alternative = (a: Alternative) => ({
  key: key(a.key),
  replaces: port(a.replaces),
  opens: port(a.opens),
  externals: a.externals.map(external),
  rank: a.rank,
});

export function solutionDigest(s: SolutionView): Record<string, unknown> {
  return {
    extentsPerSecond: s.extentsPerSecond,
    machineCounts: s.machineCounts,
    edgeFlowsPerSecond: s.edgeFlowsPerSecond,
    gatedSources: s.gatedSources.map(external),
    gatedSinks: s.gatedSinks.map(external),
    terminalInputs: s.terminalInputs.map(external),
    terminalOutputs: s.terminalOutputs.map(external),
    unneeded: setSorted(s.unneeded),
    openGates: s.openGates,
    externalQuantity: s.externalQuantity,
    totalInternalFlow: s.totalInternalFlow,
    notes: s.notes.map(note),
    key: key(s.key),
    drawers: readout(s.drawers),
    spares: s.spares.map(leftover),
    // The Up to read-out only when the plan has Up to pools: every golden before it reads the same.
    ...(s.upTo !== undefined ? { upTo: s.upTo.map(upToReadout) } : {}),
  };
}

export function alternativesDigest(a: Alternatives): Record<string, unknown> {
  return {
    chosen: a.chosen === null ? null : key(a.chosen),
    options: a.options.map(alternative),
    complete: a.complete,
    notes: a.notes.map(note),
  };
}

/** Only a solved answer has a digest; a failed one throws (every corpus case solves). */
export function digest(answer: Answer): {
  solution: Record<string, unknown>;
  alternatives: Record<string, unknown>;
} {
  if (answer.kind !== "solved") throw new Error(`answer failed: ${JSON.stringify(answer.failure)}`);
  return {
    solution: solutionDigest(answer.solution),
    alternatives: alternativesDigest(answer.alternatives),
  };
}
