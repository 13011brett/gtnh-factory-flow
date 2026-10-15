import { describe, expect, it } from "vitest";
import { loadBiodieselDemoProject } from "@/examples";
import { game, planWithAdditions } from "./__fixtures__/plan-additions";
import { parseFactoryProjectJson, serializeFactoryProject } from "@/lib/import-export/factory-json";
import { decodePlanCode, encodePlanCode } from "@/lib/import-export/plan-code";
import {
  factoryProjectSchema,
  GTNHPLANNER_DATA_MAX_BYTES,
  jsonByteLength,
  OPAQUE_DATA_MAX_DEPTH,
} from "./schemas";
import type { FactoryProject } from "./types";

/**
 * The cloud and live additions to the plan: the game's own data on things
 * (`gtnhplanner`), the view a plan opens on, and the task board. Each must
 * come through every path a plan takes, or a website edit loses what the game
 * wrote.
 */

function expectAdditions(plan: FactoryProject, source: FactoryProject) {
  expect(plan.gtnhplanner).toEqual(source.gtnhplanner);
  expect(plan.primaryView).toBe("tasks");
  expect(plan.nodes[0]!.gtnhplanner).toEqual(game("node"));
  expect(plan.storages?.[0]?.gtnhplanner).toEqual(game("storage"));
  expect(plan.edges[0]!.gtnhplanner).toEqual(game("edge"));
  expect(plan.annotations?.[0]?.gtnhplanner).toEqual(game("note"));
  expect(plan.tasks).toEqual(source.tasks);
  expect(plan.taskItems).toEqual(source.taskItems);
  expect(plan.taskComments).toEqual(source.taskComments);
}

describe("plan additions for cloud plans and task boards", () => {
  it("survive the schema", () => {
    const source = planWithAdditions();
    expectAdditions(factoryProjectSchema.parse(source) as FactoryProject, source);
  });

  it("survive export and import", () => {
    const source = planWithAdditions();
    expectAdditions(parseFactoryProjectJson(serializeFactoryProject(source)), source);
  });

  it("survive a plan link", async () => {
    const source = planWithAdditions();
    expectAdditions(await decodePlanCode(await encodePlanCode(source)), source);
  });

  it("leave old plans as they were: nothing added when absent", () => {
    const parsed = factoryProjectSchema.parse(loadBiodieselDemoProject());
    expect(parsed).not.toHaveProperty("tasks");
    expect(parsed).not.toHaveProperty("primaryView");
    expect(parsed).not.toHaveProperty("gtnhplanner");
  });

  it("refuse the game's data on one thing past 64 KB", () => {
    const source = planWithAdditions();
    const big = { v: 1, blob: "x".repeat(GTNHPLANNER_DATA_MAX_BYTES) };
    expect(jsonByteLength(big)).toBeGreaterThan(GTNHPLANNER_DATA_MAX_BYTES);
    const tooBig = { ...source, nodes: [{ ...source.nodes[0]!, gtnhplanner: big }, ...source.nodes.slice(1)] };
    expect(factoryProjectSchema.safeParse(tooBig).success).toBe(false);
    const justFits = { v: 1, blob: "x".repeat(GTNHPLANNER_DATA_MAX_BYTES - 100) };
    expect(factoryProjectSchema.safeParse({ ...source, gtnhplanner: justFits }).success).toBe(true);
  });

  it("refuse opaque data nested past its depth, however deep", () => {
    const source = planWithAdditions();
    const nest = (levels: number): Record<string, unknown> => {
      let value: Record<string, unknown> = { leaf: 1 };
      for (let i = 1; i < levels; i += 1) {
        value = { a: value };
      }
      return value;
    };
    const deep = (levels: number) => ({
      ...source,
      nodes: [{ ...source.nodes[0]!, gtnhplanner: nest(levels) }, ...source.nodes.slice(1)],
    });
    expect(factoryProjectSchema.safeParse(deep(OPAQUE_DATA_MAX_DEPTH)).success).toBe(true);
    expect(factoryProjectSchema.safeParse(deep(OPAQUE_DATA_MAX_DEPTH + 1)).success).toBe(false);
    expect(factoryProjectSchema.safeParse(deep(100_000)).success).toBe(false);
  });

  it("hold tasks to their limits", () => {
    const source = planWithAdditions();
    const task = source.tasks![0]!;
    const withTask = (patch: object) => ({ ...source, tasks: [{ ...task, ...patch }] });
    expect(factoryProjectSchema.safeParse(withTask({ title: "" })).success).toBe(false);
    expect(factoryProjectSchema.safeParse(withTask({ title: "x".repeat(121) })).success).toBe(false);
    expect(factoryProjectSchema.safeParse(withTask({ title: "x".repeat(120) })).success).toBe(true);
    expect(factoryProjectSchema.safeParse(withTask({ text: "x".repeat(4001) })).success).toBe(false);
    expect(factoryProjectSchema.safeParse(withTask({ status: "later" })).success).toBe(false);
    const item = source.taskItems![0]!;
    expect(factoryProjectSchema.safeParse({ ...source, taskItems: [{ ...item, text: "x".repeat(201) }] }).success).toBe(false);
    expect(factoryProjectSchema.safeParse({ ...source, taskItems: [{ ...item, done: "yes" }] }).success).toBe(false);
    const comment = source.taskComments![0]!;
    expect(factoryProjectSchema.safeParse({ ...source, taskComments: [{ ...comment, text: "x".repeat(2001) }] }).success).toBe(false);
    expect(factoryProjectSchema.safeParse({ ...source, primaryView: "kanban" }).success).toBe(false);
  });
});
