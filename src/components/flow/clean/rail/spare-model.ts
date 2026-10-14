import type { FactoryProject, ThroughputResult } from "@/lib/model/types";
import { parsePortKey, splitLeftoverKey } from "@/lib/solver/plan/port-key";
import type { PlanLeftover } from "@/lib/solver/plan/types";
import { parseResourceHandleId } from "../../resource-handles";
import {
  buildResourceLookup,
  canonicalOf,
  splitResultNodeId,
  type RailModel,
  type RailResource,
} from "./rail-model";

/**
 * A spare (the solver's leftover): flow sent out of the plan, or brought into
 * it, at ports with no drawer, with more than one place that could bear it.
 * The mod's `BoardSession.SpareLine`/`SpareBearer`. Pure.
 */

export interface SpareBearerView {
  /** The place's PortKey, also its key in `spareShares`. */
  key: string;
  /** The card the place is on (a shared section's `#rN` dropped). */
  nodeId: string;
  /** The place's port handle on that card. */
  handle: string;
  output: boolean;
  /** The resource's name. */
  name: string;
  /** The machine's name. */
  machine: string;
  /** The canonical resource key. */
  resourceKey: string;
  resource: RailResource;
  /** What crosses at this place when it bears the whole leftover, a second. */
  max: number;
  solverPick: boolean;
  energy: boolean;
  /** The ports the leftover crosses at this place (its own port when it bears none now). */
  ports: Array<{ nodeId: string; handle: string }>;
}

export interface SpareView {
  key: string;
  importing: boolean;
  /** A stored split is in force. */
  custom: boolean;
  bearers: SpareBearerView[];
  /** The solver's own shares. */
  solved: number[];
  /** The shares in force: the stored split first, else the solver's. */
  shares: number[];
}

/** The shares in force for a leftover: the stored split (normalised), else the solver's. */
export function effectiveShares(
  bearerKeys: readonly string[],
  solved: readonly number[],
  stored: Record<string, number> | undefined,
): number[] {
  if (!stored) return [...solved];
  const raw = bearerKeys.map((key) => Math.max(0, stored[key] ?? 0));
  const total = raw.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [...solved];
  return raw.map((v) => v / total);
}

export function buildSpares(
  project: FactoryProject,
  result: ThroughputResult | undefined,
  rail: Pick<RailModel, "aliases" | "machines">,
): SpareView[] {
  const leftovers: PlanLeftover[] = result?.plan?.leftovers ?? [];
  if (!result || leftovers.length === 0) return [];
  const lookup = buildResourceLookup(project);
  const recipes = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const machineName = new Map(rail.machines.map((m) => [m.nodeId, m.label]));
  const depth = cardDepths(project);
  const out: SpareView[] = [];
  for (const leftover of leftovers) {
    const bearers: SpareBearerView[] = [];
    let ok = true;
    for (const b of leftover.bearers) {
      const parsed = parsePortKey(b.portKey);
      const handle = parsed ? parseResourceHandleId(parsed.handle) : undefined;
      if (!parsed || !handle) {
        ok = false;
        break;
      }
      const { cardId } = splitResultNodeId(parsed.nodeId);
      const key = `${handle.kind}:${handle.resourceId}`;
      const resource = lookup.get(key) ?? { kind: handle.kind, id: handle.resourceId };
      const node = nodesById.get(cardId);
      bearers.push({
        key: b.portKey,
        nodeId: cardId,
        handle: parsed.handle,
        output: parsed.side === "o",
        name: resource.displayName ?? handle.resourceId,
        machine:
          machineName.get(cardId) ?? recipes.get(node?.recipeId ?? "")?.machineType ?? cardId,
        resourceKey: canonicalOf(rail.aliases, key),
        resource,
        max: b.maxPerSecond,
        solverPick: b.solverPick,
        energy: handle.kind === "power",
        ports: (b.flows.length > 0 ? b.flows.map((f) => f.portKey) : [b.portKey]).flatMap(
          (portKey) => {
            const p = parsePortKey(portKey);
            return p ? [{ nodeId: splitResultNodeId(p.nodeId).cardId, handle: p.handle }] : [];
          },
        ),
      });
    }
    if (!ok || bearers.length === 0) continue;
    // Most upstream first: a place leaving after a card sits just past it, one coming in just before it.
    const order = bearers.map((_, i) => i);
    const rank = (i: number) =>
      (depth.get(bearers[i]!.nodeId) ?? 1e9) + (bearers[i]!.output ? 0.5 : -0.5);
    order.sort((a, b) => rank(a) - rank(b) || a - b);
    const sorted = order.map((i) => bearers[i]!);
    const solved = order.map((i) => leftover.bearers[i]!.share);
    const stored = project.spareShares?.[leftover.key];
    out.push({
      key: leftover.key,
      importing: leftover.importing,
      custom: leftover.custom || stored !== undefined,
      bearers: sorted,
      solved,
      shares: effectiveShares(
        sorted.map((b) => b.key),
        solved,
        stored,
      ),
    });
  }
  return out;
}

/** How far each card is from where the plan starts along its wires (the nearest way, so a loop does not run on). */
export function cardDepths(project: FactoryProject): Map<string, number> {
  // Only wires between cards count: a drawer feeding a card does not make it later in the plan.
  const cards = new Set(project.nodes.map((n) => n.id));
  const feeds = new Map<string, string[]>();
  const fed = new Set<string>();
  for (const edge of project.edges) {
    if (!cards.has(edge.source) || !cards.has(edge.target)) continue;
    const list = feeds.get(edge.source);
    if (list) list.push(edge.target);
    else feeds.set(edge.source, [edge.target]);
    fed.add(edge.target);
  }
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const node of project.nodes) {
    if (!fed.has(node.id)) {
      depth.set(node.id, 0);
      queue.push(node.id);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head]!;
    for (const to of feeds.get(at) ?? []) {
      if (!depth.has(to)) {
        depth.set(to, depth.get(at)! + 1);
        queue.push(to);
      }
    }
  }
  return depth;
}

/** How much of each resource the spares with a choice of place carry in (`importing`) or out, by canonical key. */
export function sparedByResource(
  spares: readonly SpareView[],
  importing: boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const spare of spares) {
    if (spare.importing !== importing || spare.bearers.length < 2) continue;
    spare.bearers.forEach((b, i) => {
      out.set(b.resourceKey, (out.get(b.resourceKey) ?? 0) + spare.shares[i]! * b.max);
    });
  }
  return out;
}

/** Whether a leftover key names these bearers (kept for symmetry with `makeLeftoverKey`). */
export function keyHasBearers(key: string, bearerKeys: readonly string[]): boolean {
  const parts = splitLeftoverKey(key);
  return parts.length === bearerKeys.length && parts.every((p) => bearerKeys.includes(p));
}
