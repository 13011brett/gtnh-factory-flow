import type { FactoryProject } from "@/lib/model/types";
import { boardOrder } from "./task-board";

/**
 * A task board as chains, the quest book's way (the game's TaskChain, which the chain view draws): tasks joined by
 * what they wait on, each chain laid out in layers left to right (a task one layer past the furthest of the tasks it
 * waits on), and the tasks with no link either way on their own at the end. Pure.
 *
 * Inside a layer tasks sit near the tasks they wait on and the tasks they unblock (sweeps of their neighbours'
 * average place), so arrows cross little. Chains come in the order of their first task on the board, and a loop (two
 * people each adding half of one at once) is broken at its earliest task: its tasks still get a layer each.
 */

/** One chain: its layers left to right, each its tasks' ids top to bottom. */
export interface TaskChain {
  layers: string[][];
}

/** The board as chains, and the tasks linked to nothing in the board's order. */
export interface TaskChainLayout {
  chains: TaskChain[];
  loose: string[];
}

/** A chain's tallest layer: how many rows it takes. */
export function chainRows(chain: TaskChain): number {
  return chain.layers.reduce((most, layer) => Math.max(most, layer.length), 0);
}

/** A chain's task ids, layer by layer. */
export function chainIds(chain: TaskChain): string[] {
  return chain.layers.flat();
}

export function taskChains(project: FactoryProject): TaskChainLayout {
  // The board's order: column by column, top first. Everything below keeps to it where nothing else decides.
  const board = boardOrder(project);
  const rank = new Map<string, number>();
  for (const task of board) rank.set(task.id, rank.size);

  const waits = new Map<string, string[]>();
  const unblocks = new Map<string, string[]>();
  for (const task of board) {
    waits.set(task.id, []);
    unblocks.set(task.id, []);
  }
  for (const task of board) {
    for (const blocker of new Set(task.blockedBy ?? [])) {
      if (blocker !== task.id && rank.has(blocker)) {
        waits.get(task.id)!.push(blocker);
        unblocks.get(blocker)!.push(task.id);
      }
    }
  }

  const loose: string[] = [];
  const placed = new Set<string>();
  const components: string[][] = [];
  for (const task of board) {
    const id = task.id;
    if (placed.has(id)) continue;
    if (waits.get(id)!.length === 0 && unblocks.get(id)!.length === 0) {
      loose.push(id);
      continue;
    }
    // Everything joined to it either way.
    const members: string[] = [];
    const todo = [id];
    placed.add(id);
    while (todo.length > 0) {
      const at = todo.pop()!;
      members.push(at);
      for (const next of [...waits.get(at)!, ...unblocks.get(at)!]) {
        if (!placed.has(next)) {
          placed.add(next);
          todo.push(next);
        }
      }
    }
    members.sort((a, b) => rank.get(a)! - rank.get(b)!);
    components.push(members);
  }
  return { chains: components.map((members) => chain(members, waits, unblocks, rank)), loose };
}

function chain(
  members: string[],
  waits: Map<string, string[]>,
  unblocks: Map<string, string[]>,
  rank: Map<string, number>,
): TaskChain {
  const byRank = (a: string, b: string) => rank.get(a)! - rank.get(b)!;
  // Layers: one past the furthest task waited on, taken in waiting order; a loop is broken at its earliest task.
  const layer = new Map<string, number>();
  const left = new Map<string, number>();
  for (const member of members) left.set(member, waits.get(member)!.length);
  const ready = members.filter((member) => left.get(member) === 0);
  let count = 0;
  while (count < members.length) {
    if (ready.length === 0) {
      const next = members.find((member) => !layer.has(member));
      if (next !== undefined) ready.push(next);
    }
    ready.sort(byRank);
    const at = ready.shift()!;
    if (layer.has(at)) continue;
    let depth = 0;
    for (const wait of waits.get(at)!) {
      const of = layer.get(wait);
      if (of !== undefined) depth = Math.max(depth, of + 1);
    }
    layer.set(at, depth);
    count += 1;
    for (const unblock of unblocks.get(at)!) {
      const remaining = (left.get(unblock) ?? 0) - 1;
      left.set(unblock, remaining);
      if (remaining === 0 && !layer.has(unblock)) ready.push(unblock);
    }
  }
  // A task waiting on nothing sits just before the first task it unblocks, not far back at the start.
  for (const member of members) {
    if (waits.get(member)!.length > 0) continue;
    let first = Number.POSITIVE_INFINITY;
    for (const unblock of unblocks.get(member)!) first = Math.min(first, layer.get(unblock)!);
    if (Number.isFinite(first) && first - 1 > layer.get(member)!) layer.set(member, first - 1);
  }
  let depth = 0;
  for (const value of layer.values()) depth = Math.max(depth, value + 1);
  const layers: string[][] = Array.from({ length: depth }, () => []);
  for (const member of members) layers[layer.get(member)!]!.push(member);

  // Sweeps: each layer by where what it waits on sits, then each by where what it unblocks sits, then again.
  const place = new Map<string, number>();
  for (const each of layers) number(each, place);
  for (let i = 1; i < layers.length; i += 1) arrange(layers[i]!, waits, place, rank);
  for (let i = layers.length - 2; i >= 0; i -= 1) arrange(layers[i]!, unblocks, place, rank);
  for (let i = 1; i < layers.length; i += 1) arrange(layers[i]!, waits, place, rank);
  return { layers };
}

/** Sorts a layer by the average place of each task's neighbours (its own place where it has none). */
function arrange(
  each: string[],
  neighbours: Map<string, string[]>,
  place: Map<string, number>,
  rank: Map<string, number>,
): void {
  const key = new Map<string, number>();
  for (const id of each) {
    let sum = 0;
    let n = 0;
    for (const other of neighbours.get(id)!) {
      const at = place.get(other);
      if (at === undefined) continue;
      sum += at;
      n += 1;
    }
    key.set(id, n === 0 ? place.get(id)! : sum / n);
  }
  each.sort((a, b) => key.get(a)! - key.get(b)! || rank.get(a)! - rank.get(b)!);
  number(each, place);
}

/** Each task's place in its layer, centred, so a short layer lines up with the middle of a tall one. */
function number(each: string[], place: Map<string, number>): void {
  each.forEach((id, at) => place.set(id, at - (each.length - 1) / 2));
}
