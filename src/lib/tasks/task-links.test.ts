import { describe, expect, it } from "vitest";
import {
  designForPlan,
  itemLink,
  morePressing,
  planLinkId,
  planLinkIds,
  taskLinks,
} from "./task-links";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("task links", () => {
  it("reads links, then the older same-plan card ids, each card once", () => {
    const task = {
      id: "t",
      title: "x",
      status: "todo" as const,
      order: "a0",
      links: [{ plan: "p1", node: "n1" }],
      nodeIds: ["n1", "n2"],
    };
    expect(taskLinks(task, "own")).toEqual([
      { plan: "p1", node: "n1" },
      { plan: "own", node: "n1" },
      { plan: "own", node: "n2" },
    ]);
    // A link with no plan is a card of the plan holding the task.
    expect(taskLinks({ ...task, links: [{ plan: "", node: "n9" }], nodeIds: undefined }, "own")).toEqual([
      { plan: "own", node: "n9" },
    ]);
  });

  it("reads a checklist line's card in either spelling", () => {
    const base = { id: "i", taskId: "t", text: "x", done: false, order: "a0" };
    expect(itemLink({ ...base, link: { plan: "p", node: "n" } }, "own")).toEqual({ plan: "p", node: "n" });
    expect(itemLink({ ...base, nodeId: "n" }, "own")).toEqual({ plan: "own", node: "n" });
    expect(itemLink(base, "own")).toBeUndefined();
  });

  it("names a plan by its doc key once it is in the account, by its local id before", () => {
    expect(planLinkId({ id: "d1" }, ME)).toBe("d1");
    expect(planLinkId({ id: "d1", remoteUpdatedAt: "2026-01-01" }, ME)).toBe(`${ME}:d1`);
    expect(planLinkId({ id: "shared-x", cloud: { ownerId: OTHER, designId: "d2" } }, ME)).toBe(`${OTHER}:d2`);
    expect(planLinkIds({ id: "d1", remoteUpdatedAt: "x" }, ME)).toEqual([`${ME}:d1`, "d1"]);
  });

  it("finds the design a link's plan names, however it was spelled", () => {
    const own = { id: "d1", remoteUpdatedAt: "x" };
    const shared = { id: "shared-o-d2", cloud: { ownerId: OTHER, designId: "d2" } };
    const designs = [own, shared];
    expect(designForPlan(designs, "d1", ME)).toBe(own);
    expect(designForPlan(designs, `${ME}:d1`, ME)).toBe(own);
    expect(designForPlan(designs, `${OTHER}:d2`, ME)).toBe(shared);
    expect(designForPlan(designs, `${OTHER}:d3`, ME)).toBeUndefined();
  });

  it("ranks blocked over doing over to do over done", () => {
    expect(morePressing("done", "todo")).toBe("todo");
    expect(morePressing("todo", "doing")).toBe("doing");
    expect(morePressing("blocked", "doing")).toBe("blocked");
  });
});
