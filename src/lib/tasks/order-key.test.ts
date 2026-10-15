import { describe, expect, it } from "vitest";
import { byOrder, orderBetween } from "./order-key";
import vectorsJson from "./order-key-vectors.json";

describe("fractional order keys", () => {
  it("makes a key for an empty list, then after and before it", () => {
    const first = orderBetween();
    const after = orderBetween(first);
    const before = orderBetween(undefined, first);
    expect(before < first && first < after).toBe(true);
  });

  it("always finds a key between two neighbours, however often it is asked", () => {
    let low = orderBetween();
    const high = orderBetween(low);
    for (let i = 0; i < 200; i += 1) {
      const middle = orderBetween(low, high);
      expect(middle > low && middle < high).toBe(true);
      low = middle;
    }
    let top = orderBetween();
    const bottom = orderBetween(undefined, top);
    for (let i = 0; i < 200; i += 1) {
      const middle = orderBetween(bottom, top);
      expect(middle > bottom && middle < top).toBe(true);
      top = middle;
    }
  });

  it("fits between keys another client wrote", () => {
    const key = orderBetween("a0", "a1");
    expect(key > "a0" && key < "a1").toBe(true);
    expect(orderBetween(undefined, "a0") < "a0").toBe(true);
    expect(orderBetween("a0") > "a0").toBe(true);
  });

  it("never ends a key in the lowest digit, so there is room before it", () => {
    let key = orderBetween();
    for (let i = 0; i < 50; i += 1) {
      key = orderBetween(undefined, key);
      expect(key.endsWith("0")).toBe(false);
    }
  });

  it("sorts by key, then id", () => {
    const sorted = byOrder([
      { id: "b", order: "V" },
      { id: "a", order: "V" },
      { id: "c", order: "I" },
    ]);
    expect(sorted.map((thing) => thing.id)).toEqual(["c", "a", "b"]);
  });
});

describe("shared order key vectors (the game's OrderKeys checks the same file)", () => {
  type Vectors = {
    between: { before: string | null; after: string | null; expected: string }[];
    chains: { mode: string; start: string | null; end?: string; n: number; expected: string[] }[];
    sorting: { items: { id: string; order: string }[]; expected: string[] }[];
  };
  const vectors = vectorsJson as Vectors;

  it("gives the recorded key for every pair", () => {
    for (const row of vectors.between) {
      expect(orderBetween(row.before ?? undefined, row.after ?? undefined)).toBe(row.expected);
    }
  });

  it("gives the recorded runs of keys", () => {
    for (const chain of vectors.chains) {
      let low = chain.start ?? undefined;
      let high = chain.mode === "between" ? chain.end : undefined;
      const got: string[] = [];
      for (let i = 0; i < chain.n; i += 1) {
        let key: string;
        if (chain.mode === "after") {
          key = orderBetween(low);
          low = key;
        } else if (chain.mode === "before") {
          key = orderBetween(undefined, high);
          high = key;
        } else {
          key = orderBetween(low, high);
          high = key;
        }
        got.push(key);
      }
      expect(got).toEqual(chain.expected);
    }
  });

  it("sorts as recorded", () => {
    for (const set of vectors.sorting) {
      expect(byOrder(set.items).map((thing) => thing.id)).toEqual(set.expected);
    }
  });
});
