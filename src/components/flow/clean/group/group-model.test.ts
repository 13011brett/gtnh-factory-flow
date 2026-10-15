import { describe, expect, it } from "vitest";
import type { FactoryProject } from "@/lib/model/types";
import { addToGroup, fitGroups, groupColorTag, groupItems, nextGroupColor, removeFromGroup } from "./group-model";
import { groupUnder } from "./group-drop";

const card = (id: string, x: number, y: number, pocketId?: string) =>
  ({ id, recipeId: "r", position: { x, y }, ...(pocketId ? { pocketId } : {}) }) as FactoryProject["nodes"][number];

function plan(nodes: FactoryProject["nodes"], pockets: FactoryProject["pockets"] = []): FactoryProject {
  return { nodes, edges: [], recipes: [], storages: [], annotations: [], pockets } as unknown as FactoryProject;
}

const size = () => ({ width: 380, height: 160 });

describe("groups (docs/groups.md)", () => {
  it("makes a group round the selection where it stands", () => {
    const made = groupItems(plan([card("a", 100, 200), card("b", 600, 200), card("c", 0, 900)]), ["a", "b"], size, "g")!;
    const group = made.project.pockets!.find((p) => p.id === "g")!;
    expect(group.name).toBe("Group 1");
    expect(group.expanded).toBe(true);
    expect(group.colorTag).toBe("light_blue");
    // A cell of padding round the members, the title strip (two cells) above.
    expect(group.position).toEqual({ x: 80, y: 140 });
    const a = made.project.nodes.find((n) => n.id === "a")!;
    expect(a.pocketId).toBe("g");
    expect({ x: a.position.x + group.position.x, y: a.position.y + group.position.y }).toEqual({ x: 100, y: 200 });
    expect(made.project.nodes.find((n) => n.id === "c")!.pocketId).toBeUndefined();
    expect(group.size!.width).toBeGreaterThanOrEqual(600 + 380 - 80 + 20);
  });

  it("nests a group made inside one group, and never nests by accident", () => {
    const outer = { id: "o", name: "O", position: { x: 0, y: 0 }, expanded: true, size: { width: 2000, height: 1000 } };
    const inside = groupItems(plan([card("a", 40, 80, "o"), card("b", 500, 80, "o")], [outer]), ["a", "b"], size, "g")!;
    expect(inside.project.pockets!.find((p) => p.id === "g")!.parentPocketId).toBe("o");
    const mixed = groupItems(plan([card("a", 40, 80, "o"), card("b", 3000, 80)], [outer]), ["a", "b"], size, "g")!;
    expect(mixed.project.pockets!.find((p) => p.id === "g")!.parentPocketId).toBeUndefined();
  });

  it("grows a frame to hold its members and never shrinks it", () => {
    const g = { id: "g", name: "G", position: { x: 0, y: 0 }, expanded: true, size: { width: 300, height: 200 } };
    const grown = fitGroups(plan([card("a", 20, 60, "g")], [g]), size);
    expect(grown.pockets![0]!.size).toEqual({ width: 420, height: 240 });
    const big = { ...g, size: { width: 3000, height: 3000 } };
    expect(fitGroups(plan([card("a", 20, 60, "g")], [big]), size).pockets![0]!.size).toEqual(big.size);
  });

  it("adds under the members and takes out beside the frame", () => {
    const g = { id: "g", name: "G", position: { x: 0, y: 0 }, expanded: true, size: { width: 420, height: 240 } };
    const added = addToGroup(plan([card("a", 20, 60, "g"), card("b", 2000, 0)], [g]), ["b"], "g", size);
    const b = added.nodes.find((n) => n.id === "b")!;
    expect(b.pocketId).toBe("g");
    expect(b.position.y).toBeGreaterThanOrEqual(60 + 160);
    const out = removeFromGroup(added, "b", size);
    expect(out.nodes.find((n) => n.id === "b")!.pocketId).toBeUndefined();
  });

  it("wears its paper's colour when it has no tag, and a new one takes the first colour nobody wears", () => {
    expect(groupColorTag({ id: "x", theme: "chalkboard" })).toBe("green");
    expect(nextGroupColor([{ id: "a", name: "", position: { x: 0, y: 0 }, colorTag: "light_blue" }])).toBe("lime");
  });

  it("finds the group under a carried card's centre, innermost first", () => {
    const frames = [
      { id: "o", depth: 1, x: 0, y: 0, width: 1000, height: 1000 },
      { id: "i", depth: 2, x: 100, y: 100, width: 400, height: 400 },
    ];
    expect(groupUnder(frames, { x: 150, y: 200, width: 100, height: 100 }, 40)).toBe("i");
    expect(groupUnder(frames, { x: 600, y: 600, width: 100, height: 100 }, 40)).toBe("o");
    expect(groupUnder(frames, { x: 1200, y: 0, width: 100, height: 100 }, 40)).toBeUndefined();
    expect(groupUnder(frames, { x: 150, y: 200, width: 100, height: 100 }, 40, new Set(["i"]))).toBe("o");
  });
});
