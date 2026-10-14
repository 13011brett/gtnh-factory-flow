import { describe, expect, it } from "vitest";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { formatSolvedMachines } from "./clean-model";
import { supportsClean } from "./support";
import { specialKindOf } from "./special/special-model";

const node = { id: "n", recipeId: "r", machineCount: 1, parallel: 1, overclockTier: "HV", enabled: true } as unknown as FactoryNode;
const recipe = (patch: Partial<Recipe>) =>
  ({ id: "r", name: "r", machineType: "Electric Blast Furnace", minimumTier: "HV", durationTicks: 100, eut: 480, inputs: [], outputs: [], ...patch }) as unknown as Recipe;

describe("supportsClean", () => {
  it("draws every card: the classic card is no longer reachable", () => {
    expect(supportsClean(recipe({}), node)).toBe(true);
    expect(supportsClean(recipe({ power: { sourceId: "x" } } as Partial<Recipe>), node)).toBe(true);
    expect(supportsClean(recipe({ id: "factoryflow:crop-farm:empty" }), node)).toBe(true);
  });
});

describe("specialKindOf", () => {
  it("leaves an ordinary machine to the plain card", () => {
    expect(specialKindOf(recipe({}), node)).toBeUndefined();
  });

  it("names the cards the plain card cannot be", () => {
    expect(specialKindOf(recipe({ power: { sourceId: "x" } } as Partial<Recipe>), node)).toBe("power");
    expect(specialKindOf(recipe({}), { ...node, extraRecipes: [{ recipeId: "other" }] } as unknown as FactoryNode)).toBe("shared");
    expect(specialKindOf(recipe({ machineType: "Custom Rate" }), node)).toBe("custom-rate");
    expect(specialKindOf(recipe({ machineType: "Tank", source: { recipeMap: "Tank" } } as Partial<Recipe>), node)).toBe("tank");
    expect(specialKindOf(recipe({ machineType: "Tank", source: { recipeMap: "crossform-tank" } } as Partial<Recipe>), node)).toBeUndefined();
    expect(specialKindOf(recipe({ id: "factoryflow:crop-farm:empty", machineType: "Crop Farm", source: { recipeMap: "Crop Farm" } } as Partial<Recipe>), node)).toBe("crop");
  });
});

describe("formatSolvedMachines", () => {
  it("prints three decimals under 1, two under 10, one under 100, whole from 100", () => {
    expect(formatSolvedMachines(0)).toBe("0");
    expect(formatSolvedMachines(0.0001)).toBe("<0.001");
    expect(formatSolvedMachines(0.5)).toBe("0.5");
    expect(formatSolvedMachines(0.12345)).toBe("0.123");
    expect(formatSolvedMachines(1.2)).toBe("1.2");
    expect(formatSolvedMachines(3.14159)).toBe("3.14");
    expect(formatSolvedMachines(12.34)).toBe("12.3");
    expect(formatSolvedMachines(100.2)).toBe("101");
  });
});
