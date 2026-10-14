import { describe, expect, it } from "vitest";

import { isCustomRateNodeId, releaseCustomRates } from "./custom-rate";
import {
  createFluidTankPlaceholderRecipe,
  fluidTankEmptyRecipeId,
  getFluidTankSlot,
  isFluidTankRecipe,
  releaseFluidTanks,
} from "./fluid-tank";
import type { FactoryNode, Recipe } from "./types";

const CELL = { kind: "item", id: "gregtech:cell@1", amount: 1, displayName: "Water Cell" } as const;
const EMPTY = {
  kind: "item",
  id: "ic2:itemcellempty",
  amount: 1,
  displayName: "Empty Cell",
} as const;
const WATER = { kind: "fluid", id: "water", amount: 1000, displayName: "Water" } as const;

/** The dataset's own Tank recipes, as the pipeline writes them (planner.tank, a tick a craft). */
const emptying = {
  id: "oracle:planner-tank:empty",
  name: "Tank: Empty Cell",
  kind: "gregtech_machine",
  machineType: "Tank",
  minimumTier: "NONE",
  durationTicks: 1,
  eut: 0,
  inputs: [CELL],
  outputs: [WATER, EMPTY],
  source: { recipeMap: "Tank" },
} as unknown as Recipe;
const filling = {
  ...emptying,
  id: "oracle:planner-tank:fill",
  name: "Tank: Water Cell",
  inputs: [EMPTY, WATER],
  outputs: [CELL],
} as unknown as Recipe;

function node(id: string, recipeId: string): FactoryNode {
  return {
    id,
    recipeId,
    machineCount: 1,
    parallel: 1,
    overclockTier: "NONE",
    enabled: true,
    position: { x: 0, y: 0 },
  };
}

describe("the fluid tank card", () => {
  it("is the dataset's Tank map, and the empty card, but never the solver's hidden Tank", () => {
    expect(isFluidTankRecipe(emptying)).toBe(true);
    expect(isFluidTankRecipe(createFluidTankPlaceholderRecipe("r"))).toBe(true);
    expect(
      isFluidTankRecipe({ machineType: "Tank", source: { recipeMap: "crossform-tank" } }),
    ).toBe(false);
    expect(isFluidTankRecipe({ machineType: "Crafter", source: { recipeMap: "Tank" } })).toBe(
      false,
    );
  });

  it("reads what a Tank recipe holds: emptying or filling, litres from the recipe", () => {
    const empty = getFluidTankSlot(emptying)!;
    expect(empty.mode).toBe("empty");
    expect(empty.pair.cell.id).toBe(CELL.id);
    expect(empty.pair.fluid.amount).toBe(1000);
    expect(empty.pair.empty.id).toBe(EMPTY.id);
    const fill = getFluidTankSlot(filling)!;
    expect(fill.mode).toBe("fill");
    expect(fill.pair.cell.id).toBe(CELL.id);
    expect(fill.pair.empty.id).toBe(EMPTY.id);
    expect(getFluidTankSlot(createFluidTankPlaceholderRecipe("r"))).toBeUndefined();
  });

  it("takes anything while empty, and wires like any card once it holds a recipe", () => {
    const placeholder = createFluidTankPlaceholderRecipe("p");
    expect(isCustomRateNodeId({ nodes: [node("t", "p")], recipes: [placeholder] }, "t")).toBe(true);
    expect(isCustomRateNodeId({ nodes: [node("t", emptying.id)], recipes: [emptying] }, "t")).toBe(
      false,
    );
  });

  it("lets go of its recipe when nothing is wired to it, into one empty recipe per node", () => {
    const project = {
      nodes: [node("held", emptying.id), node("wired", emptying.id), node("other", "x")],
      recipes: [emptying],
      edges: [{ source: "wired", target: "other" }],
    };
    const released = releaseFluidTanks(project);
    expect(released.nodes[0]!.recipeId).toBe(fluidTankEmptyRecipeId("held"));
    expect(released.nodes[1]!.recipeId).toBe(emptying.id);
    const empty = released.recipes.find((recipe) => recipe.id === fluidTankEmptyRecipeId("held"))!;
    expect(empty.inputs).toEqual([]);
    expect(isFluidTankRecipe(empty)).toBe(true);
    // Everything wired: the same project comes back.
    const wired = {
      ...project,
      edges: [
        { source: "held", target: "other" },
        { source: "wired", target: "other" },
      ],
    };
    expect(releaseFluidTanks(wired)).toBe(wired);
    // Run through the custom rate's release, which every edit passes.
    expect(releaseCustomRates(project).nodes[0]!.recipeId).toBe(fluidTankEmptyRecipeId("held"));
    expect(releaseFluidTanks(released)).toBe(released);
  });
});
