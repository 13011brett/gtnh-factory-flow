import { describe, expect, it } from "vitest";
import { makeResourceHandleId } from "../../resource-handles";
import { rowAccepts, type DraggedPort } from "./accept";

const dragged: DraggedPort = { nodeId: "a", side: "output", kind: "fluid", resourceId: "benzene" };
const handle = (side: "input" | "output", kind: "item" | "fluid", id: string) => makeResourceHandleId(side, { kind, id });

describe("which port rows light for a wire in hand", () => {
  it("takes the opposite side with the same resource on another card", () => {
    expect(rowAccepts(dragged, { nodeId: "b", handleId: handle("input", "fluid", "benzene") })).toBe(true);
  });

  it("refuses the same side, another resource, another kind", () => {
    expect(rowAccepts(dragged, { nodeId: "b", handleId: handle("output", "fluid", "benzene") })).toBe(false);
    expect(rowAccepts(dragged, { nodeId: "b", handleId: handle("input", "fluid", "toluene") })).toBe(false);
    expect(rowAccepts(dragged, { nodeId: "b", handleId: handle("input", "item", "benzene") })).toBe(false);
  });

  it("never lights the card the wire came from: carried home it is no green", () => {
    expect(rowAccepts(dragged, { nodeId: "a", handleId: handle("input", "fluid", "benzene") })).toBe(false);
  });

  it("reads a section handle of a shared machine and ignores junk", () => {
    expect(rowAccepts(dragged, { nodeId: "b", handleId: "r2:" + handle("input", "fluid", "benzene") })).toBe(true);
    expect(rowAccepts(dragged, { nodeId: "b", handleId: "nonsense" })).toBe(false);
  });
});
