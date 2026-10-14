/**
 * Island results kept by value (spec-solver 4.4; Java `Balancer.Cache`): an island's answer is a pure function of its
 * input, so an edit that touches one island leaves every other island's answer to be read back, not solved again, and
 * undo finds the older one. The key is the island's input digest: the whole input, canonically written (object keys
 * sorted, so the order a record was filled in never matters). Least-recently-used out when full. Pure bookkeeping: with
 * or without a cache `solvePlan` answers the same.
 */
import type { SolveInput } from "./types";

function sortedKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object).sort()) out[k] = (value as Record<string, unknown>)[k];
  return out;
}

/** The island's input as one string: equal strings are equal inputs (same machines, wires, pins, drawers, choice, spares). */
export function inputDigest(input: SolveInput, salt = ""): string {
  return `${salt}\u0000${JSON.stringify(input, sortedKeys)}`;
}

export class IslandCache<V> {
  private readonly entries = new Map<string, V>();
  hits = 0;
  misses = 0;

  constructor(readonly capacity = 128) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    // most recently used goes last
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/** What `solvePlan` keeps per island. */
export type PieceCache = IslandCache<import("./solve-core").Piece>;
