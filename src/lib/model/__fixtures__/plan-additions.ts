import { loadBiodieselDemoProject } from "@/examples";
import type { FactoryProject } from "../types";

/** A plan carrying every cloud and live addition: the game's data on each kind of thing, the view it opens on, tasks. */
export const game = (kind: string) => ({ v: 1, game: { kind, settings: { pins: [1, 2.5], nested: { deep: true } } }, sum: "abc123" });

export function planWithAdditions(): FactoryProject {
  const demo = loadBiodieselDemoProject();
  const [first, ...rest] = demo.nodes;
  return {
    ...demo,
    gtnhplanner: { v: 1, balance: "auto", groups: [{ id: "g1", nodes: [first!.id] }] },
    primaryView: "tasks",
    nodes: [{ ...first!, gtnhplanner: game("node") }, ...rest],
    storages: [
      {
        id: "drawer-1",
        kind: "item",
        resourceId: "minecraft:iron_ingot",
        position: { x: 40, y: 40 },
        gtnhplanner: game("storage"),
      },
    ],
    edges: demo.edges.map((edge, at) => (at === 0 ? { ...edge, gtnhplanner: game("edge") } : edge)),
    annotations: [
      {
        id: "note-1",
        kind: "text",
        text: "Hello",
        position: { x: 0, y: 0 },
        size: { width: 100, height: 40 },
        gtnhplanner: game("note"),
      },
    ],
    pockets: [
      {
        id: "pocket-1",
        name: "Group 1",
        position: { x: 0, y: 0 },
        expanded: true,
        size: { width: 400, height: 200 },
        gtnhplanner: game("pocket"),
      },
    ],
    tasks: [
      {
        id: "t1",
        title: "Build the biodiesel line",
        text: "Two LV mixers first.",
        status: "doing",
        order: "a0",
        assignees: ["11111111-1111-4111-8111-111111111111"],
        nodeIds: [first!.id],
        createdBy: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-10-14T10:00:00.000Z",
      },
      { id: "t2", title: "Done thing", status: "done", order: "a1", doneAt: "2026-10-14T11:00:00.000Z" },
    ],
    taskItems: [
      { id: "i1", taskId: "t1", text: "Place mixers", done: true, order: "a0", nodeId: first!.id },
      { id: "i2", taskId: "t1", text: "Wire them", done: false, order: "a1" },
    ],
    taskComments: [
      {
        id: "c1",
        taskId: "t1",
        by: "11111111-1111-4111-8111-111111111111",
        byName: "ann",
        at: "2026-10-14T10:05:00.000Z",
        text: "On it",
      },
    ],
  };
}

