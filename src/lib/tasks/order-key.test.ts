import { describe, expect, it } from "vitest";
import { byOrder, orderBetween } from "./order-key";

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
