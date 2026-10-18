import { afterEach, expect, it, vi } from "vitest";

/**
 * Manual recalculation is gone and plan boards never showed its switch, so a
 * browser that saved it "off" must lose that value on load, or every plan it
 * opens shows the empty board's books.
 */

const RETIRED_KEY = "gtnh-factory-flow.auto-solve.v1";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("removes the retired manual-recalculation setting when it loads", async () => {
  const store = new Map<string, string>([[RETIRED_KEY, "off"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  vi.resetModules();
  await import("./solve-books");
  expect(store.has(RETIRED_KEY)).toBe(false);
});

it("loads when storage refuses access", async () => {
  vi.stubGlobal("localStorage", {
    removeItem: () => {
      throw new Error("SecurityError");
    },
  });
  vi.resetModules();
  await expect(import("./solve-books")).resolves.toHaveProperty("solveBooks");
});
