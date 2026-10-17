/**
 * Old Build's dead loops and clog locks on a plan board (`PlanSolveExtras.loops`, docs/up-to.md): which cards are in a
 * ring, which wires join them along the ring's rows, and what the notice says. Pure.
 */
import type { FactoryEdge } from "@/lib/model/types";
import { sectionNodeId, splitSectionHandleId } from "@/lib/model/shared-machine";
import { makePortKey } from "@/lib/solver/plan/port-key";
import type { PlanUpToLoop } from "@/lib/solver/plan/types";

/** A ring's look on the board: a dead loop in STARVED's amber, a clog lock in CLOGGED's purple. */
export type LoopTone = "dead" | "clog";

export function loopTone(loop: Pick<PlanUpToLoop, "kind">): LoopTone {
  return loop.kind === "DEAD_LOOP" ? "dead" : "clog";
}

/** The ring a card is in (the first, when it is in several), as its tone. */
export function cardLoop(
  loops: readonly PlanUpToLoop[] | undefined,
  cardId: string,
): LoopTone | undefined {
  const loop = loops?.find((entry) => entry.cards.includes(cardId));
  return loop ? loopTone(loop) : undefined;
}

/** A wire end's port key, as the solve names it (a shared machine's recipe is its own solve node). */
function endKey(nodeId: string, side: "i" | "o", handle: string | undefined): string | undefined {
  if (!handle) return undefined;
  const split = splitSectionHandleId(handle);
  return makePortKey(sectionNodeId(nodeId, split.section), side, split.handleId ?? handle);
}

/**
 * The wires that join a ring's cards along its rows: both ends on the ring's cards, and one end on a row the ring
 * names (its members' blaming ports: a dead loop's inputs, a clog lock's outputs). By wire id, the ring's tone.
 */
export function loopEdges(
  edges: readonly Pick<FactoryEdge, "id" | "source" | "target" | "sourceHandle" | "targetHandle">[],
  loops: readonly PlanUpToLoop[] | undefined,
): Map<string, LoopTone> {
  const out = new Map<string, LoopTone>();
  for (const loop of loops ?? []) {
    const cards = new Set(loop.cards);
    const rows = new Set(loop.portKeys);
    for (const edge of edges) {
      if (out.has(edge.id) || !cards.has(edge.source) || !cards.has(edge.target)) continue;
      const from = endKey(edge.source, "o", edge.sourceHandle ?? undefined);
      const to = endKey(edge.target, "i", edge.targetHandle ?? undefined);
      if ((from && rows.has(from)) || (to && rows.has(to))) out.set(edge.id, loopTone(loop));
    }
  }
  return out;
}

/** "A", "A and B", "A, B and C". */
function list(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The ring's cards by name, each name once; a ring of one kind of machine says how many. */
function members(names: readonly string[]): { text: string; one: boolean } {
  const distinct = [...new Set(names)];
  if (names.length > 1 && distinct.length === 1)
    return { text: `${names.length} ${distinct[0]} cards`, one: false };
  return { text: list(distinct), one: names.length === 1 };
}

/**
 * The notice for a ring, in plain short sentences: a dead loop's cards wait on each other and nothing feeds them; a
 * clog lock's are stuck on what they cannot get rid of, and a drawer for it frees them.
 */
export function loopSentence(
  loop: Pick<PlanUpToLoop, "kind">,
  names: readonly string[],
  resources: readonly string[],
): string {
  const who = members(names);
  if (loop.kind === "DEAD_LOOP") {
    return who.one
      ? `The ${who.text} waits on itself. Nothing feeds the loop.`
      : `The ${who.text} wait on each other. Nothing feeds the loop.`;
  }
  const what = resources.length > 0 ? list(resources) : "what they make";
  const drawer = resources.length > 1 ? "A drawer for each" : "A drawer for it";
  return who.one
    ? `The ${who.text} is stuck on ${what}. ${drawer} frees it.`
    : `The ${who.text} are stuck on ${what}. ${drawer} frees them.`;
}
