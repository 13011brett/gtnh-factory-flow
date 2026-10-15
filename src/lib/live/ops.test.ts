import { describe, expect, it } from "vitest";
import vectorFile from "./live-vectors.json";
import { LiveClientState } from "./client-state";
import {
  applyOps,
  cloneJson,
  diffPlans,
  invertOps,
  jsonEqual,
  LIVE_COLLECTIONS,
  LIVE_PROTOCOL_VERSION,
  plansEqual,
  readOps,
  type LiveOp,
  type LivePlan,
} from "./ops";

type Vector = Record<string, unknown> & { kind: string; name: string; rule: string };
type Step = Record<string, unknown> & { do: string; expect?: Record<string, unknown> };

const vectors = (vectorFile as unknown as { vectors: Vector[] }).vectors;

function opsEqual(actual: LiveOp[], expected: unknown): boolean {
  return jsonEqual(actual, expected);
}

function describePlan(plan: unknown): string {
  return JSON.stringify(plan);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return value;
}

function runClient(vector: Vector) {
  const start = vector.start as { seq: number; plan: LivePlan };
  const cids: string[] = [];
  const state = new LiveClientState(cloneJson(start), {
    makeCid: () => {
      const cid = cids.shift();
      if (!cid) {
        throw new Error("no cid queued");
      }
      return cid;
    },
  });
  (vector.steps as Step[]).forEach((step, at) => {
    const where = `${vector.name} step ${at} (${step.do})`;
    const seen: Record<string, unknown> = {};
    switch (step.do) {
      case "local":
        cids.push(step.cid as string);
        state.localOps(cloneJson(step.ops as LiveOp[]));
        break;
      case "receive": {
        const result = state.receive({
          seq: step.seq as number,
          cid: step.cid as string,
          by: step.by as string,
          ops: cloneJson(step.ops as LiveOp[]),
        });
        seen.own = result.own;
        seen.gap = result.gap;
        break;
      }
      case "refuse":
        state.refuse(step.cid as string);
        break;
      case "snapshot":
        seen.resend = state
          .resync({ seq: step.seq as number, plan: cloneJson(step.plan as LivePlan) })
          .map((batch) => batch.cid);
        break;
      case "undo": {
        cids.push(step.cid as string);
        const batch = state.undo();
        seen.sent = batch?.ops ?? [];
        break;
      }
      default:
        throw new Error(`${where}: unknown step`);
    }
    const expectations = step.expect ?? {};
    for (const [key, expected] of Object.entries(expectations)) {
      if (key === "seq") {
        expect(state.seq, where).toBe(expected);
      } else if (key === "pending") {
        expect(state.pendingCids, where).toEqual(expected);
      } else if (key === "confirmed") {
        expect(plansEqual(state.confirmed, expected as LivePlan), `${where} confirmed ${describePlan(state.confirmed)}`).toBe(true);
      } else if (key === "view") {
        expect(plansEqual(state.view, expected as LivePlan), `${where} view ${describePlan(state.view)}`).toBe(true);
      } else if (key === "own" || key === "gap") {
        expect(seen[key], `${where} ${key}`).toBe(expected);
      } else if (key === "resend") {
        expect(seen.resend, where).toEqual(expected);
      } else if (key === "sent") {
        expect(opsEqual(seen.sent as LiveOp[], expected), `${where} sent ${JSON.stringify(seen.sent)}`).toBe(true);
      } else {
        throw new Error(`${where}: unknown expectation ${key}`);
      }
    }
  });
}

describe("live-vectors.json", () => {
  it("names the protocol version and the collections ops.ts uses", () => {
    const file = vectorFile as unknown as { version: number; collections: string[]; about: string[] };
    expect(file.version).toBe(LIVE_PROTOCOL_VERSION);
    expect(file.collections).toEqual([...LIVE_COLLECTIONS]);
    expect(file.about.join("\n").length).toBeGreaterThan(500);
  });

  it("has unique names and enough cases of every kind", () => {
    const names = vectors.map((vector) => vector.name);
    expect(new Set(names).size).toBe(names.length);
    expect(vectors.length).toBeGreaterThanOrEqual(40);
    for (const kind of ["jsonEqual", "plansEqual", "apply", "diff", "invert", "rebase", "client"]) {
      expect(vectors.some((vector) => vector.kind === kind), kind).toBe(true);
    }
  });

  for (const vector of vectors) {
    it(`${vector.kind}: ${vector.name}`, () => {
      switch (vector.kind) {
        case "jsonEqual":
          expect(jsonEqual(vector.a, vector.b)).toBe(vector.expect);
          expect(jsonEqual(vector.b, vector.a)).toBe(vector.expect);
          return;
        case "plansEqual":
          expect(plansEqual(vector.a as LivePlan, vector.b as LivePlan)).toBe(vector.expect);
          expect(plansEqual(vector.b as LivePlan, vector.a as LivePlan)).toBe(vector.expect);
          return;
        case "apply": {
          const plan = deepFreeze(cloneJson(vector.plan as LivePlan));
          const ops = deepFreeze(cloneJson(vector.ops as LiveOp[]));
          const result = applyOps(plan, ops);
          expect(plansEqual(result, vector.expect as LivePlan), describePlan(result)).toBe(true);
          // The expected collections are listed in the order the rules give.
          for (const c of LIVE_COLLECTIONS) {
            const expected = (vector.expect as LivePlan)[c];
            if (Array.isArray(expected)) {
              expect(jsonEqual(result[c], expected), `${c} order`).toBe(true);
            }
          }
          return;
        }
        case "diff": {
          const before = deepFreeze(cloneJson(vector.before as LivePlan));
          const after = deepFreeze(cloneJson(vector.after as LivePlan));
          const ops = diffPlans(before, after);
          expect(opsEqual(ops, vector.expect), JSON.stringify(ops)).toBe(true);
          expect(plansEqual(applyOps(before, ops), after)).toBe(true);
          return;
        }
        case "invert": {
          const plan = deepFreeze(cloneJson(vector.plan as LivePlan));
          const ops = deepFreeze(cloneJson(vector.ops as LiveOp[]));
          const inverse = invertOps(plan, ops);
          expect(opsEqual(inverse, vector.expect), JSON.stringify(inverse)).toBe(true);
          expect(plansEqual(applyOps(applyOps(plan, ops), inverse), plan)).toBe(true);
          return;
        }
        case "rebase": {
          const confirmed = vector.confirmed as LivePlan;
          let view = applyOps(confirmed, vector.remote as LiveOp[]);
          for (const batch of vector.pending as LiveOp[][]) {
            view = applyOps(view, batch);
          }
          expect(plansEqual(view, vector.expect as LivePlan), describePlan(view)).toBe(true);
          // The client engine reaches the same view.
          const cids = (vector.pending as LiveOp[][]).map((_, at) => `p${at}`);
          const state = new LiveClientState({ seq: 1, plan: cloneJson(confirmed) }, { makeCid: () => cids.shift()! });
          for (const batch of vector.pending as LiveOp[][]) {
            state.localOps(cloneJson(batch));
          }
          state.receive({ seq: 2, cid: "remote", ops: cloneJson(vector.remote as LiveOp[]) });
          expect(plansEqual(state.view, vector.expect as LivePlan)).toBe(true);
          return;
        }
        case "client":
          runClient(vector);
          return;
        default:
          throw new Error(`unknown vector kind ${vector.kind}`);
      }
    });
  }
});

describe("ops beyond the vectors", () => {
  it("diff then apply reproduces any edit, and the inverse undoes it", () => {
    const before: LivePlan = {
      schemaVersion: 1,
      id: "p",
      name: "Plan",
      nodes: [
        { id: "n1", recipeId: "r1", machineCount: 1, position: { x: 0, y: 0 }, enabled: true },
        { id: "n2", recipeId: "r2", machineCount: 2, position: { x: 100, y: 0 }, enabled: true },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", resourceKind: "item", resourceId: "iron" }],
      recipes: [{ id: "r1" }, { id: "r2" }],
      fuelProfiles: [],
    };
    const after: LivePlan = {
      ...before,
      name: "Renamed",
      nodes: [
        { id: "n2", recipeId: "r2", machineCount: 4, position: { x: 100, y: 0 }, enabled: false },
        { id: "n3", recipeId: "r1", machineCount: 1, position: { x: 0, y: 200 }, enabled: true },
      ],
      edges: [],
      tasks: [{ id: "t1", title: "Wire it", status: "todo", order: "a0", nodeIds: ["n3"] }],
    };
    const ops = diffPlans(before, after);
    expect(plansEqual(applyOps(before, ops), after)).toBe(true);
    expect(plansEqual(applyOps(applyOps(before, ops), invertOps(before, ops)), before)).toBe(true);
  });

  it("treats a key holding undefined as absent", () => {
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(diffPlans({ nodes: [{ id: "n", a: 1 }] }, { nodes: [{ id: "n", a: 1, b: undefined }] })).toEqual([]);
    const patched = applyOps({ nodes: [{ id: "n", a: 1 }] }, [{ o: "patch", c: "nodes", id: "n", f: { a: undefined } }]);
    expect(patched.nodes).toEqual([{ id: "n" }]);
  });

  it("never changes its inputs and shares untouched collections", () => {
    const plan = deepFreeze({ nodes: [{ id: "n1", a: 1 }], edges: [{ id: "e1" }] }) as LivePlan;
    const next = applyOps(plan, [{ o: "patch", c: "nodes", id: "n1", f: { a: 2 } }]);
    expect(next.edges).toBe(plan.edges);
    expect(next.nodes).not.toBe(plan.nodes);
  });

  it("applies a large batch without rescanning the collection per op", () => {
    const nodes = Array.from({ length: 5000 }, (_, at) => ({ id: `n${at}`, a: at }));
    const ops: LiveOp[] = nodes.map((node) => ({ o: "del", c: "nodes", id: node.id }));
    const started = performance.now();
    const next = applyOps({ nodes }, ops);
    expect((next.nodes as unknown[]).length).toBe(0);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("reads ops off the wire and refuses bad shapes", () => {
    expect(readOps([{ o: "put", c: "nodes", id: "n", v: { id: "n" } }])).toEqual({
      ops: [{ o: "put", c: "nodes", id: "n", v: { id: "n" } }],
    });
    expect("error" in readOps({})).toBe(true);
    expect("error" in readOps([{ o: "put", c: "nodes", id: "n", v: { id: "m" } }])).toBe(true);
    expect("error" in readOps([{ o: "put", c: "widgets", id: "n", v: { id: "n" } }])).toBe(true);
    expect("error" in readOps([{ o: "patch", c: "nodes", id: "n", f: { id: "x" } }])).toBe(true);
    expect("error" in readOps([{ o: "patch", c: "nodes", id: "n", f: {}, d: [3] }])).toBe(true);
    expect("error" in readOps([{ o: "meta", f: { nodes: [] } }])).toBe(true);
    expect("error" in readOps([{ o: "del", c: "nodes", id: "" }])).toBe(true);
    expect("error" in readOps([{ o: "move", c: "nodes", id: "n" }])).toBe(true);
  });
});

describe("LiveClientState", () => {
  it("turns a whole-plan edit into a batch and undoes and redoes it", () => {
    let n = 0;
    const state = new LiveClientState({ seq: 0, plan: { name: "A", nodes: [] } }, { makeCid: () => `c${(n += 1)}` });
    const batch = state.edit({ name: "B", nodes: [{ id: "n1" }] });
    expect(batch?.ops).toEqual([
      { o: "put", c: "nodes", id: "n1", v: { id: "n1" } },
      { o: "meta", f: { name: "B" } },
    ]);
    expect(state.edit(state.view)).toBeNull();
    expect(state.frame("u:d", batch!)).toEqual({ t: "ops", doc: "u:d", base: 0, cid: "c1", ops: batch!.ops });
    state.undo();
    expect(plansEqual(state.view, { name: "A", nodes: [] })).toBe(true);
    expect(state.canRedo).toBe(true);
    state.redo();
    expect(plansEqual(state.view, { name: "B", nodes: [{ id: "n1" }] })).toBe(true);
    expect(state.pendingCids).toEqual(["c1", "c2", "c3"]);
  });

  it("survives a save and restore with its pending batches", () => {
    const state = new LiveClientState({ seq: 3, plan: { name: "A" } }, { makeCid: () => "x" });
    state.edit({ name: "B" });
    const copy = LiveClientState.restore(JSON.parse(JSON.stringify(state.save())));
    expect(copy.seq).toBe(3);
    expect(copy.pendingCids).toEqual(["x"]);
    expect(copy.view).toEqual({ name: "B" });
  });
});
