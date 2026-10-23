import { afterEach, describe, expect, it, vi } from "vitest";
import type { FactoryProject, ThroughputResult } from "@/lib/model/types";
import cbdPlan from "@/components/flow/__fixtures__/stranded/cbd.json";

const TOWER = "node-2b7d62e3-445f-4288-9514-7286d5aa1313";
const HEAVY_FUEL_OUT = "node-bbba4208-fadf-4819-be90-87206c39142c|o|output:fluid:liquid_heavy_fuel";

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

describe("the stranded-spare search that follows worker books", () => {
  /** A stand-in worker: records what the store posts; the test answers for it. */
  class FakeWorker {
    static last: FakeWorker | undefined;
    posted: Array<{ key: string; project: FactoryProject }> = [];
    onmessage: ((event: { data: unknown }) => void) | undefined;
    onerror: unknown;
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(message: { key: string; project: FactoryProject }) {
      this.posted.push(message);
    }
  }

  it("shows the books at once, the finding when it lands, carries it over an edit, and re-solves a plan whose search was stopped", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    vi.resetModules();
    const books = await import("./solve-books");
    const { calculateThroughput } = await import("@/lib/solver");
    const { findStranded, strandedWanted } = await import("@/components/flow/stranded-surplus");
    const shown: ThroughputResult[] = [];
    books.registerBooksSink((result) => shown.push(result));
    const worker = () => FakeWorker.last!;
    const answer = (index: number) => {
      const { key, project } = worker().posted[index]!;
      const result = calculateThroughput(project);
      expect(strandedWanted(project, result)).toBe(true);
      result.plan!.strandedPending = true;
      worker().onmessage!({ data: { key, result } });
      return { key, project, result };
    };

    const plan = structuredClone(cbdPlan) as unknown as FactoryProject;
    expect(books.solveBooks(plan).stale).toBe(true);
    const first = answer(0);
    // The books land at once, marked as still being searched.
    expect(shown.at(-1)?.plan?.strandedPending).toBe(true);
    expect(shown.at(-1)?.plan?.stranded).toBeUndefined();
    worker().onmessage!({ data: { key: first.key, stranded: findStranded(first.project, first.result) } });
    const found = shown.at(-1)!;
    expect(found.plan?.strandedPending).toBeUndefined();
    expect(found.plan?.stranded?.vents[0]?.portKey).toBe(HEAVY_FUEL_OUT);

    // An edit on the same stalled line: its books keep the hint while their own search runs.
    const edited = { ...plan, nodes: plan.nodes.map((n) => (n.id === TOWER ? { ...n, solvePin: 3 } : n)) };
    books.solveBooks(edited);
    const second = answer(1);
    expect(shown.at(-1)?.plan?.strandedPending).toBe(true);
    expect(shown.at(-1)?.plan?.stranded?.vents[0]?.portKey).toBe(HEAVY_FUEL_OUT);

    // A third plan comes in, and the second's search is stopped for it: the second's books are not kept, so coming
    // back to that plan solves it again instead of showing books that never got their search.
    const third = { ...plan, nodes: plan.nodes.map((n) => (n.id === TOWER ? { ...n, solvePin: 4 } : n)) };
    books.solveBooks(third);
    answer(2);
    worker().onmessage!({ data: { key: second.key, stranded: "skipped" } });
    const before = worker().posted.length;
    books.solveBooks(edited);
    expect(worker().posted.length).toBe(before + 1);
  });
});
