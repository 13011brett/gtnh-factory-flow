import { describe, expect, it } from "vitest";
import { applyOps, type LiveOp, type LivePlan } from "./ops";
import { colorFor, LIVE_COLORS, parseDocKey } from "./protocol";
import { checkBatch } from "./validate";

const plan: LivePlan = {
  schemaVersion: 1,
  id: "p",
  name: "Plan",
  recipes: [],
  nodes: [],
  edges: [],
  fuelProfiles: [],
  tasks: [{ id: "t1", title: "Task", status: "todo", order: "a0" }],
};

const check = (ops: LiveOp[]) => checkBatch(applyOps(plan, ops), ops);

describe("live batch checks", () => {
  it("pass a sound batch", () => {
    expect(
      check([
        { o: "patch", c: "tasks", id: "t1", f: { status: "done" } },
        {
          o: "put",
          c: "taskItems",
          id: "i1",
          v: { id: "i1", taskId: "t1", text: "Do", done: false, order: "a0" },
        },
        { o: "meta", f: { primaryView: "tasks", notes: "n" } },
      ]),
    ).toBeNull();
  });

  it("refuse a thing its collection's schema refuses", () => {
    expect(check([{ o: "patch", c: "tasks", id: "t1", f: { status: "later" } }])).toMatch(
      /^tasks t1: status/,
    );
    expect(check([{ o: "patch", c: "tasks", id: "t1", f: {}, d: ["title"] }])).toMatch(
      /^tasks t1: title/,
    );
  });

  it("let a patch on nothing and a thing put then deleted pass", () => {
    expect(check([{ o: "patch", c: "tasks", id: "gone", f: { status: "later" } }])).toBeNull();
    expect(
      check([
        { o: "put", c: "tasks", id: "t2", v: { id: "t2", title: "", status: "x", order: "" } },
        { o: "del", c: "tasks", id: "t2" },
      ]),
    ).toBeNull();
  });

  it("refuse deleting a required plan field, setting an unknown one, or a bad value", () => {
    expect(check([{ o: "meta", f: {}, d: ["name"] }])).toMatch(/^plan field name/);
    expect(check([{ o: "meta", f: { bogus: true } }])).toMatch(/not part of a plan/);
    expect(check([{ o: "meta", f: { primaryView: "kanban" } }])).toMatch(/^plan field primaryView/);
  });
});

describe("live protocol helpers", () => {
  it("read doc keys and nothing else", () => {
    expect(parseDocKey("11111111-1111-4111-8111-111111111111:design-abc1")).toEqual({
      ownerId: "11111111-1111-4111-8111-111111111111",
      designId: "design-abc1",
    });
    expect(parseDocKey("nope:design-abc1")).toBeUndefined();
    expect(parseDocKey("11111111-1111-4111-8111-111111111111:x")).toBeUndefined();
    expect(parseDocKey(42)).toBeUndefined();
  });

  it("give each account one colour from the palette", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(colorFor(id)).toBe(colorFor(id));
    expect(LIVE_COLORS).toContain(colorFor(id));
  });
});
