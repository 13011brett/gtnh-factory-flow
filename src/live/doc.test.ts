import { describe, expect, it } from "vitest";
import {
  applyOps,
  jsonEqual,
  readOps,
  type LiveCollection,
  type LiveOp,
  type LivePlan,
} from "@/lib/live/ops";
import { LIVE_LIMITS } from "@/lib/live/protocol";
import { PROJECT_SCHEMA_VERSION } from "@/lib/model/types";
import { prepareBatch } from "./batch";
import { LiveDoc } from "./doc";

/**
 * The room's plan (doc.ts) against the shared engine: every batch must leave
 * exactly what `applyOps` leaves, order and all, and a batch must cost what
 * it touches, never the size of the plan.
 */

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const COLLECTIONS: LiveCollection[] = ["nodes", "tasks", "edges"];
const IDS = ["a", "b", "c", "d", "e"];
const FIELDS = ["x", "y", "z", "w"];

function randomOps(next: () => number, count: number): LiveOp[] {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
  const fields = () => {
    const f: Record<string, unknown> = {};
    for (const name of FIELDS) {
      if (next() < 0.4) {
        f[name] = next() < 0.2 ? { deep: [Math.floor(next() * 5)] } : Math.floor(next() * 5);
      }
    }
    return f;
  };
  const ops: LiveOp[] = [];
  for (let i = 0; i < count; i += 1) {
    const roll = next();
    const c = pick(COLLECTIONS);
    const id = pick(IDS);
    if (roll < 0.3) {
      ops.push({ o: "put", c, id, v: { ...fields(), id } });
    } else if (roll < 0.65) {
      const d = FIELDS.filter(() => next() < 0.2);
      ops.push(
        d.length > 0 ? { o: "patch", c, id, f: fields(), d } : { o: "patch", c, id, f: fields() },
      );
    } else if (roll < 0.85) {
      ops.push({ o: "del", c, id });
    } else {
      const d = ["notes", "extra"].filter(() => next() < 0.3);
      ops.push({
        o: "meta",
        f: next() < 0.5 ? { notes: `n${i}` } : { extra: i },
        ...(d.length ? { d } : {}),
      });
    }
  }
  return ops;
}

describe("the room's plan", () => {
  it("leaves exactly what applyOps leaves, batch after batch, order included", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = random(seed);
      // Duplicate ids, things without ids, a collection that is not an array
      // and one that is absent: the engine's edge cases.
      let expected: LivePlan = {
        name: "Plan",
        nodes: [{ id: "a", x: 1 }, { id: "b" }, { id: "a", x: 2 }, { loose: true }],
        tasks: "not a list",
        notes: "start",
      };
      const doc = new LiveDoc(expected);
      for (let batch = 0; batch < 25; batch += 1) {
        const ops = randomOps(next, 1 + Math.floor(next() * 8));
        const staged = doc.stage(ops);
        const after = applyOps(expected, ops);
        for (const thing of staged.things) {
          const list = Array.isArray(after[thing.c])
            ? (after[thing.c] as Array<{ id?: unknown }>)
            : [];
          const holders = list.filter((item) => item?.id === thing.id);
          if (thing.after) {
            expect(holders.some((item) => jsonEqual(item, thing.after))).toBe(true);
          } else if (thing.id !== "a" || thing.c !== "nodes") {
            expect(holders).toEqual([]);
          }
        }
        for (const field of staged.meta) {
          expect(jsonEqual(field.after, after[field.name])).toBe(true);
        }
        doc.commit(ops);
        expected = after;
        expect(JSON.stringify(doc.toPlan()), `seed ${seed} batch ${batch}`).toBe(
          JSON.stringify(expected),
        );
      }
    }
  });

  it("hands out plans that stay as they were while the doc goes on", () => {
    const doc = new LiveDoc({ tasks: [{ id: "t", n: 1 }] });
    const before = doc.toPlan();
    const text = JSON.stringify(before);
    doc.commit([
      { o: "patch", c: "tasks", id: "t", f: { n: 2 } },
      { o: "put", c: "tasks", id: "u", v: { id: "u" } },
      { o: "del", c: "tasks", id: "t" },
    ]);
    expect(JSON.stringify(before)).toBe(text);
    expect(doc.toPlan()).toEqual({ tasks: [{ id: "u" }] });
  });

  it("closes the holes deletes leave, keeping every lookup right", () => {
    const things = Array.from({ length: 500 }, (_, at) => ({ id: `t${at}`, at }));
    const doc = new LiveDoc({ tasks: things });
    doc.commit(things.slice(0, 400).map((thing) => ({ o: "del", c: "tasks", id: thing.id })));
    expect(doc.count("tasks")).toBe(100);
    expect(doc.find("tasks", "t450")).toEqual({ id: "t450", at: 450 });
    doc.commit([{ o: "patch", c: "tasks", id: "t499", f: { at: -1 } }]);
    expect((doc.toPlan().tasks as unknown[]).at(-1)).toEqual({ id: "t499", at: -1 });
  });
});

describe("a batch on a big plan", () => {
  /** A plan near the upload limit's count of things: 40,000 small cards. */
  function bigPlan(count: number): LivePlan {
    return {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: "big",
      name: "Big",
      recipes: [],
      edges: [],
      fuelProfiles: [],
      nodes: Array.from({ length: count }, (_, at) => ({
        id: `node-${at}`,
        recipeId: "r",
        machineCount: 1,
        parallel: 1,
        overclockTier: "LV",
        enabled: true,
        position: { x: at, y: at },
      })),
    };
  }

  /** What the service does with a batch frame: read it, prepare it, commit it. */
  function handle(doc: LiveDoc, text: string): number {
    const started = performance.now();
    const read = readOps((JSON.parse(text) as { ops: unknown }).ops);
    if ("error" in read) {
      throw new Error(read.error);
    }
    const prepared = prepareBatch(doc, read.ops);
    if ("error" in prepared) {
      throw new Error(prepared.error);
    }
    doc.commit(prepared.ops);
    return performance.now() - started;
  }

  it("takes well under 50 ms for the biggest batch, whatever it names", () => {
    const doc = new LiveDoc(bigPlan(40_000));
    const max = LIVE_LIMITS.opsPerBatch;
    const frame = (ops: LiveOp[]) => {
      const text = JSON.stringify({ t: "ops", doc: "d", base: 0, cid: "c", ops });
      expect(text.length).toBeLessThanOrEqual(LIVE_LIMITS.batchBytes);
      return text;
    };
    const missing = frame(
      Array.from({ length: max }, (_, at) => ({
        o: "patch" as const,
        c: "nodes" as const,
        id: `missing-${at}-${"x".repeat(150)}`,
        f: { position: { x: at, y: 0 } },
      })),
    );
    const moves = frame(
      Array.from({ length: max }, (_, at) => ({
        o: "patch" as const,
        c: "nodes" as const,
        id: `node-${at * 37}`,
        f: { position: { x: at, y: -at } },
      })),
    );
    const replace = frame(
      Array.from({ length: max }, (_, at) => ({
        o: "put" as const,
        c: "nodes" as const,
        id: `node-${at * 31}`,
        v: {
          id: `node-${at * 31}`,
          recipeId: "r",
          machineCount: 2,
          parallel: 1,
          overclockTier: "MV",
          enabled: true,
          position: { x: 0, y: 0 },
        },
      })),
    );
    const deletes = frame(
      Array.from({ length: max }, (_, at) => ({
        o: "del" as const,
        c: "nodes" as const,
        id: `node-${at * 13 + 1}`,
      })),
    );
    // Warm up the code paths, as a running service has.
    handle(new LiveDoc(bigPlan(2_000)), moves);
    for (const text of [missing, moves, replace, deletes]) {
      const took = Math.min(handle(doc, text), handle(doc, text), handle(doc, text));
      expect(took).toBeLessThan(50);
    }
  });
});
