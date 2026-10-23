import { calculateThroughput } from "@/lib/solver";
import { pinRuleOf } from "@/lib/model/pin-rule";
import type {
  FactoryEdge,
  FactoryProject,
  FactoryStorage,
  ResourceKey,
  ResourceKind,
  ThroughputResult,
} from "@/lib/model/types";
import { IslandCache, type PieceCache } from "@/lib/solver/plan/cache";
import { withIslandCache } from "@/lib/solver/plan/adapter/engine";
import { parsePortKey } from "@/lib/solver/plan/port-key";
import type {
  PlanForced,
  PlanStranded,
  PlanStrandedFix,
  PlanStrandedVent,
  PlanTerminal,
  PlanUpTo,
} from "@/lib/solver/plan/types";
import { makeResourceHandleId, parseResourceHandleId } from "./resource-handles";
import { flowHandle, splitResultNodeId } from "./clean/rail/rail-model";

/**
 * Stranded surplus: the plan-mode twin of `clog-lock.ts`.
 *
 * Under Up to, every wired port with no drawer must balance exactly, and running nothing always does. So one spare
 * output anywhere on a line (a fixed-ratio byproduct whose only wire goes to a card that cannot take it all) holds
 * the whole line at zero, and the Up to card just reads UNUSED. The answer is right (in game that line clogs); what
 * is missing is saying where and offering the fix.
 *
 * Found per island (the cards a stalled Up to card is wired to, nothing else, so a stalled line elsewhere costs an
 * edit nothing), in two steps, both solves of the public solver, so the engine and its goldens are untouched:
 * 1. FIND. The island solved again with its stalled Up to cards set to Exactly. Spare output then shows as forced
 *    output rows; those on solve nodes that were idle and now run are the candidates (the stalled card's own rows
 *    last: a spare further on explains more).
 * 2. PROVE. The real island (Up to kept) solved with the fix put in for one candidate: a wire to an open input on
 *    another card that takes the same thing, when there is one and it starts the line, else a byproduct drawer on the
 *    row. A candidate whose fix starts nothing is dropped, and the rate is the proving solve's own (the Exactly shadow
 *    can overstate it when a cap downstream is higher than the line can feed). When no one fix starts the line, all of
 *    them together (each its own kind) may.
 *
 * The probes keep their islands in a cache of their own, so they never push the plan's out of its cache, and an
 * island's finding is kept by its content, so an edit elsewhere finds it again without solving.
 *
 * Advice only: the books' answer is never changed, and the plan changes only when the player takes the fix.
 */

/** Below this a card counts as stopped, and a flow as nothing. */
const ZERO = 1e-6;
/** At most this many candidates are proven per island (each costs one or two solves). */
const MAX_CANDIDATES = 3;
const STALLED_REASONS = new Set<PlanUpTo["reason"]>(["UNUSED", "CLOGGED", "STARVED"]);

const PROBE_DRAWER = "__stranded-probe-drawer__";
const PROBE_EDGE = "__stranded-probe-edge__";

/** What the search found for some books: the plan-wide list and each stalled Up to card's own entry. */
export interface StrandedPatch {
  stranded?: PlanStranded;
  upTo: Record<string, PlanStrandedVent>;
}

/** The probes' own island cache: what-if islands never evict the plan's. */
const probeCache: PieceCache = new IslandCache(32);
/** An island's vents by its content: an edit elsewhere on the board reuses them without a solve. */
const foundByIsland = new Map<string, PlanStrandedVent[]>();
const FOUND_LIMIT = 16;

/** Forgets every island's finding and the probes' cached islands (tests that stand in their own solves). */
export function forgetStranded(): void {
  foundByIsland.clear();
  probeCache.clear();
}

/** The stalled Up to cards the search is about: on, not in a ring, with a count, and at zero for a line reason. */
function stalledUpToCards(project: FactoryProject, result: ThroughputResult): string[] {
  const plan = result.plan;
  if (project.planMode !== true || !plan || plan.failure || result.stale) return [];
  const recipeOf = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  const inLoop = new Set((plan.loops ?? []).flatMap((loop) => loop.cards));
  return project.nodes
    .filter((node) => {
      if (node.enabled === false || inLoop.has(node.id)) return false;
      if (pinRuleOf(node, recipeOf.get(node.recipeId)) !== "upTo") return false;
      const upTo = plan.upTo?.[node.id];
      return (
        upTo !== undefined &&
        upTo.capacity > 0 &&
        upTo.reached <= ZERO &&
        STALLED_REASONS.has(upTo.reason)
      );
    })
    .map((node) => node.id);
}

/** Whether these books have a stalled Up to card to search from. Cheap: no solve. */
export function strandedWanted(project: FactoryProject, result: ThroughputResult): boolean {
  return stalledUpToCards(project, result).length > 0;
}

/**
 * The search as steps: it yields before each solve, so a caller off the main thread can stop between them when newer
 * books are wanted (`solve-books.worker.ts`). Returns undefined when there is nothing to search from.
 */
export function* strandedSteps(
  project: FactoryProject,
  result: ThroughputResult,
): Generator<void, StrandedPatch | undefined> {
  const flipped = stalledUpToCards(project, result);
  if (flipped.length === 0) return undefined;
  const vents: PlanStrandedVent[] = [];
  for (const island of islandsOf(project, flipped)) {
    const key = islandKey(island.project);
    let found = foundByIsland.get(key);
    if (found) {
      foundByIsland.delete(key);
    } else {
      found = yield* searchIsland(island.project, result, island.flipped);
    }
    foundByIsland.set(key, found);
    while (foundByIsland.size > FOUND_LIMIT) {
      foundByIsland.delete(foundByIsland.keys().next().value as string);
    }
    vents.push(...found);
  }
  const upTo: Record<string, PlanStrandedVent> = {};
  for (const id of flipped) {
    const freed = vents.find((entry) => entry.stalled.includes(id));
    if (freed) upTo[id] = freed;
  }
  return vents.length === 0
    ? { upTo }
    : { stranded: { vents, stalled: [...new Set(vents.flatMap((entry) => entry.stalled))] }, upTo };
}

/** The search run to its end on this thread. */
export function findStranded(
  project: FactoryProject,
  result: ThroughputResult,
): StrandedPatch | undefined {
  const steps = strandedSteps(project, result);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * Finds the spare outputs that stall Up to cards at zero and stores them on the books (`plan.stranded`, and each
 * stalled card's `plan.upTo[id].stranded`). Plain data, so it survives postMessage. The mutation is on a result no
 * one has seen yet. Costs nothing on a plan with no Up to card at zero.
 */
export function attachStranded(project: FactoryProject, result: ThroughputResult): void {
  const patch = findStranded(project, result);
  if (patch?.stranded && result.plan) result.plan = withStranded(result, patch).plan;
}

/**
 * The books with a search's finding in place of whatever they carried (a carried-over finding, or none): new objects,
 * the answer itself untouched. `pending` keeps them marked as still being searched.
 */
export function withStranded(
  result: ThroughputResult,
  patch: StrandedPatch | undefined,
  pending = false,
): ThroughputResult {
  const plan = result.plan;
  if (!plan) return result;
  const { stranded: _stranded, strandedPending: _pending, ...rest } = plan;
  void _stranded;
  void _pending;
  const upTo = plan.upTo
    ? Object.fromEntries(
        Object.entries(plan.upTo).map(([id, entry]) => {
          const { stranded: _own, ...own } = entry;
          void _own;
          const freed = patch?.upTo[id];
          return [id, freed ? { ...own, stranded: freed } : own];
        }),
      )
    : undefined;
  return {
    ...result,
    plan: {
      ...rest,
      ...(upTo ? { upTo } : {}),
      ...(patch?.stranded ? { stranded: patch.stranded } : {}),
      ...(pending ? { strandedPending: true } : {}),
    },
  };
}

/**
 * Books whose search is still running, wearing the last books' finding where it still holds (the Up to cards it
 * named are still stalled), so the board does not drop the hint and bring it back on every edit to a stalled line.
 * Marked pending: no fix is offered from a carried finding.
 */
export function carryStranded(
  previous: ThroughputResult | undefined,
  next: ThroughputResult,
): ThroughputResult {
  const plan = next.plan;
  const old = previous?.plan;
  if (!plan || !old?.stranded) return next;
  const upTo: Record<string, PlanStrandedVent> = {};
  for (const [id, entry] of Object.entries(old.upTo ?? {})) {
    const now = plan.upTo?.[id];
    if (
      entry.stranded &&
      now &&
      now.reached <= ZERO &&
      STALLED_REASONS.has(now.reason) &&
      next.nodes[entry.stranded.nodeId] !== undefined
    ) {
      upTo[id] = entry.stranded;
    }
  }
  const kept = new Set(Object.values(upTo).map((vent) => vent.portKey));
  const vents = old.stranded.vents.filter((vent) => kept.has(vent.portKey));
  if (vents.length === 0) return next;
  return withStranded(
    next,
    { stranded: { vents, stalled: [...new Set(vents.flatMap((entry) => entry.stalled))] }, upTo },
    true,
  );
}

// ---------------------------------------------------------------------------
// One island
// ---------------------------------------------------------------------------

function* searchIsland(
  project: FactoryProject,
  result: ThroughputResult,
  flipped: readonly string[],
): Generator<void, PlanStrandedVent[]> {
  const plan = result.plan!;
  const flippedSet = new Set(flipped);
  const cardIds = new Set(project.nodes.map((node) => node.id));

  // 1. FIND: the stalled cards at Exactly. What then has to leave a solve node that was idle and now runs is spare.
  yield;
  const shadow = solve({
    ...project,
    nodes: project.nodes.map((node) =>
      flippedSet.has(node.id) ? { ...node, solvePinExact: true } : node,
    ),
  });
  if (!shadow?.plan || shadow.plan.failure) return [];
  const before = runningNodes(result);
  const inShadow = runningNodes(shadow);
  const forcedBefore = new Set(plan.forced.map((row) => row.portKey));
  const own = (row: PlanForced) => flippedSet.has(splitResultNodeId(row.nodeId).cardId);
  const candidates = shadow.plan.forced
    .filter((row) => {
      if (row.side !== "out" || forcedBefore.has(row.portKey)) return false;
      if (!cardIds.has(splitResultNodeId(row.nodeId).cardId)) return false;
      if ((before.get(row.nodeId) ?? 0) > ZERO || (inShadow.get(row.nodeId) ?? 0) <= ZERO) return false;
      return isMaterial(shadow, row);
    })
    // A stalled card's own spare last: one further on explains more of the line.
    .sort((a, b) => Number(own(a)) - Number(own(b)))
    .slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return [];

  // 2. PROVE each candidate on the real island, its fix put in.
  const terminalsIn = [...shadow.plan.terminals, ...plan.terminals]
    .filter((terminal) => terminal.side === "in")
    .sort((a, b) => (a.portKey < b.portKey ? -1 : a.portKey > b.portKey ? 1 : 0));
  const takerOf = (row: PlanForced): PlanTerminal | undefined => {
    const { cardId } = splitResultNodeId(row.nodeId);
    return terminalsIn.find((terminal) => {
      const at = parsePortKey(terminal.portKey);
      const handle = at ? parseResourceHandleId(at.handle) : undefined;
      const takerCard = splitResultNodeId(terminal.nodeId).cardId;
      return (
        handle !== undefined &&
        `${handle.kind}:${handle.resourceId}` === row.resourceKey &&
        takerCard !== cardId &&
        cardIds.has(takerCard)
      );
    });
  };
  /** The cards at zero now that some solve node of runs once the fix is in, in plan order; none unless an Up to card starts. */
  const proven = (fixed: ThroughputResult | undefined): string[] => {
    if (!fixed?.plan || fixed.plan.failure) return [];
    if (!flipped.some((id) => (fixed.plan?.upTo?.[id]?.reached ?? 0) > ZERO)) return [];
    const started = new Set<string>();
    for (const [id, extent] of runningNodes(fixed)) {
      if (extent > ZERO && (before.get(id) ?? 0) <= ZERO) started.add(splitResultNodeId(id).cardId);
    }
    return project.nodes.map((node) => node.id).filter((id) => started.has(id));
  };
  const fixOf = (taker: PlanTerminal | undefined): PlanStrandedFix =>
    taker
      ? {
          kind: "wire",
          takerNodeId: taker.nodeId,
          takerCardId: splitResultNodeId(taker.nodeId).cardId,
          takerPortKey: taker.portKey,
        }
      : { kind: "drawer" };

  // One fix for one candidate: its wire when an open input takes it and that starts the line, else its drawer.
  // `starts` is what a proof must also show: the stalled card's own spare counts only when its fix starts more than
  // the stalled cards themselves (else it lets the Up to card run alone and leaves the line dead).
  function* single(
    row: PlanForced,
    starts: (stalled: string[]) => boolean,
  ): Generator<void, PlanStrandedVent | undefined> {
    const taker = takerOf(row);
    if (taker) {
      yield;
      const wired = solve(withFixes(project, [{ row, taker }]));
      const stalled = proven(wired);
      const perSecond = wired?.edges[`${PROBE_EDGE}0`]?.transferredPerSecond ?? 0;
      if (stalled.length > 0 && starts(stalled) && perSecond > ZERO) {
        return vent(shadow!, row, perSecond, stalled, fixOf(taker));
      }
    }
    yield;
    const drained = solve(withFixes(project, [{ row }]));
    const stalled = proven(drained);
    const perSecond = drained?.edges[`${PROBE_EDGE}0`]?.transferredPerSecond ?? 0;
    return stalled.length > 0 && starts(stalled) && perSecond > ZERO
      ? vent(shadow!, row, perSecond, stalled, { kind: "drawer" })
      : undefined;
  }

  const vents: PlanStrandedVent[] = [];
  const further = candidates.filter((row) => !own(row));
  for (const row of further) {
    const found = yield* single(row, () => true);
    if (found) vents.push(found);
  }
  // Two separate spares stall a line only together: no one fix starts it, all of them do. Each is put in as it would
  // be alone (the wire where an open input takes it, never a drawer that buys back what the plan makes), and each is
  // offered with the rate of the solve that has them all; once one is taken, the next solve finds the rest. A wire
  // takes only what its one input uses, so when that is not enough the spare also gets a drawer for the rest (two
  // rows, the wire first), and last of all every spare gets a drawer.
  if (vents.length === 0 && further.length > 1) {
    const preferred = further.map((row) => ({ row, taker: takerOf(row) }));
    const attempts: ReadonlyArray<ReadonlyArray<{ row: PlanForced; taker?: PlanTerminal }>> = [
      preferred,
      preferred.flatMap((fix) => (fix.taker ? [fix, { row: fix.row }] : [fix])),
      further.map((row) => ({ row })),
    ];
    const tried = new Set<string>();
    for (const fixes of attempts) {
      const key = fixes.map(({ row, taker }) => `${row.portKey}>${taker?.portKey ?? ""}`).join("|");
      if (tried.has(key)) continue;
      tried.add(key);
      yield;
      const joint = solve(withFixes(project, fixes));
      const stalled = proven(joint);
      if (stalled.length === 0) continue;
      fixes.forEach(({ row, taker }, index) => {
        const perSecond = joint?.edges[`${PROBE_EDGE}${index}`]?.transferredPerSecond ?? 0;
        if (perSecond > ZERO) vents.push(vent(shadow, row, perSecond, stalled, fixOf(taker)));
      });
      break;
    }
  }
  // The stalled card's own spare (a fixed-ratio byproduct its one taker cannot absorb) only when nothing further on
  // explains the line.
  if (vents.length === 0) {
    for (const row of candidates.filter(own)) {
      const found = yield* single(row, (stalled) => stalled.some((id) => !flippedSet.has(id)));
      if (found) vents.push(found);
    }
  }
  // A missing wire first: it is the cheaper mistake to fix, and a drawer taken first would hide it.
  return vents.sort((a, b) => Number(a.fix.kind !== "wire") - Number(b.fix.kind !== "wire"));
}

function solve(project: FactoryProject): ThroughputResult | undefined {
  try {
    return withIslandCache(probeCache, () => calculateThroughput(project));
  } catch {
    // A probe that cannot be solved proves nothing; the board stays as quiet as it was.
    return undefined;
  }
}

/** How hard each solve node runs (a shared card's recipes each by its own `card#rN`). */
function runningNodes(result: ThroughputResult): Map<string, number> {
  const running = new Map<string, number>();
  for (const [id, node] of Object.entries(result.nodes)) {
    running.set(id, node.theoreticalMachinesRequired ?? 0);
  }
  return running;
}

/** Dust at a port that makes far more is not a spare worth a drawer. */
function isMaterial(result: ThroughputResult, row: PlanForced): boolean {
  if (!(row.perSecond > ZERO)) return false;
  const made = result.nodes[row.nodeId]?.outputs[row.resourceKey as ResourceKey]?.amountPerSecond ?? 0;
  return made <= 0 || row.perSecond > made * ZERO;
}

function resourceOf(resourceKey: string): { kind: ResourceKind; id: string } | undefined {
  const at = resourceKey.indexOf(":");
  if (at <= 0) return undefined;
  return { kind: resourceKey.slice(0, at) as ResourceKind, id: resourceKey.slice(at + 1) };
}

function vent(
  shadow: ThroughputResult,
  row: PlanForced,
  perSecond: number,
  stalled: string[],
  fix: PlanStrandedFix,
): PlanStrandedVent {
  const name =
    shadow.nodes[row.nodeId]?.outputs[row.resourceKey as ResourceKey]?.displayName ??
    row.resourceKey.slice(row.resourceKey.indexOf(":") + 1);
  return {
    nodeId: row.nodeId,
    cardId: splitResultNodeId(row.nodeId).cardId,
    portKey: row.portKey,
    resourceKey: row.resourceKey,
    resourceName: name,
    perSecond,
    fix,
    stalled,
  };
}

/**
 * The island with fixes put in: what the notice's key adds. Fix `i` is edge `PROBE_EDGE + i`: a wire to the taker's
 * open input when there is one, else a byproduct drawer on the row.
 */
function withFixes(
  project: FactoryProject,
  fixes: ReadonlyArray<{ row: PlanForced; taker?: PlanTerminal }>,
): FactoryProject {
  const storages: FactoryStorage[] = [];
  const edges: FactoryEdge[] = [];
  fixes.forEach(({ row, taker }, index) => {
    const resource = resourceOf(row.resourceKey);
    if (!resource) return;
    const source = splitResultNodeId(row.nodeId).cardId;
    const sourceHandle = flowHandle(row.nodeId, "output", resource.kind, resource.id);
    if (taker) {
      edges.push({
        id: `${PROBE_EDGE}${index}`,
        source,
        target: splitResultNodeId(taker.nodeId).cardId,
        sourceHandle,
        targetHandle: flowHandle(taker.nodeId, "input", resource.kind, resource.id),
        resourceKind: resource.kind,
        resourceId: resource.id,
      });
      return;
    }
    const storageId = `${PROBE_DRAWER}${index}`;
    storages.push({
      id: storageId,
      kind: resource.kind,
      resourceId: resource.id,
      drainMode: "byproduct",
      position: { x: 0, y: 0 },
    });
    edges.push({
      id: `${PROBE_EDGE}${index}`,
      source,
      target: storageId,
      sourceHandle,
      targetHandle: makeResourceHandleId("input", resource),
      resourceKind: resource.kind,
      resourceId: resource.id,
    });
  });
  return {
    ...project,
    storages: [...(project.storages ?? []), ...storages],
    edges: [...project.edges, ...edges],
  };
}

// ---------------------------------------------------------------------------
// Islands
// ---------------------------------------------------------------------------

/**
 * The parts of the board the stalled cards stand in, each as a plan of its own: the cards and drawers wires join, as
 * the solver splits its islands (a wire, a shared card's recipes, a drawer's links), so each answers as it does in
 * the whole plan. Islands come in the order of their first stalled card.
 */
function islandsOf(
  project: FactoryProject,
  flipped: readonly string[],
): Array<{ project: FactoryProject; flipped: string[] }> {
  const root = new Map<string, string>();
  const find = (id: string): string => {
    let at = id;
    while (root.has(at) && root.get(at) !== at) at = root.get(at)!;
    // Path compression.
    let walk = id;
    while (walk !== at) {
      const next = root.get(walk)!;
      root.set(walk, at);
      walk = next;
    }
    return at;
  };
  for (const node of project.nodes) root.set(node.id, node.id);
  for (const storage of project.storages ?? []) root.set(storage.id, storage.id);
  for (const edge of project.edges) {
    if (!root.has(edge.source) || !root.has(edge.target)) continue;
    const a = find(edge.source);
    const b = find(edge.target);
    if (a !== b) root.set(b, a);
  }
  const byRoot = new Map<string, string[]>();
  for (const id of flipped) {
    const at = find(id);
    byRoot.set(at, [...(byRoot.get(at) ?? []), id]);
  }
  return [...byRoot.entries()].map(([at, ids]) => {
    const inIsland = (id: string) => root.has(id) && find(id) === at;
    return {
      flipped: ids,
      project: {
        ...project,
        nodes: project.nodes.filter((node) => inIsland(node.id)),
        storages: (project.storages ?? []).filter((storage) => inIsland(storage.id)),
        edges: project.edges.filter((edge) => inIsland(edge.source) && inIsland(edge.target)),
      },
    };
  });
}

/**
 * What an island's search depends on, as one string: its cards, drawers and wires (where they stand left out), the
 * recipes they run and the plan-wide settings the solver reads. Equal strings find the same spares.
 */
function islandKey(island: FactoryProject): string {
  const used = new Set<string>();
  for (const node of island.nodes) {
    used.add(node.recipeId);
    for (const extra of node.extraRecipes ?? []) used.add(extra.recipeId);
  }
  const unplaced = <T extends { position?: unknown; pocketId?: unknown }>(thing: T) => ({
    ...thing,
    position: undefined,
    pocketId: undefined,
  });
  return JSON.stringify([
    island.solveMode,
    island.poolMode,
    island.planMode,
    island.targetRate,
    island.setupRules,
    island.spareShares,
    island.settingPins,
    island.poolCellRatios,
    island.assumeBoundaries,
    island.fuelProfiles,
    island.selectedFuelProfileId,
    island.productionGroups,
    island.poolResourceRules,
    island.nodes.map(unplaced),
    (island.storages ?? []).map(unplaced),
    island.edges,
    island.recipes.filter((recipe) => used.has(recipe.id)),
  ]);
}
