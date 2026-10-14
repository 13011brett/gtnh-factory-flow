import type { Recipe } from "@/lib/model/types";
import { powerPlannerData, resolvePowerResource } from "./planner-data";
import { htgrFuelName } from "./sources/reactors";
import { isPowerRecipe } from "./power-recipe";

/**
 * A recipe-book recipe whose machine is a power card here. kubatech's HTGR recipes show each fuel's whole making as one
 * recipe: the dust it starts from in, and the mixture, the BISO and TRISO steps, the fuel, the burned fuel and what that
 * breaks down to all out. The reactor runs none of that: it takes the finished TRISO fuel and gives back the burned
 * fuel, which is what the HTGR power card has. So adding such a recipe adds the HTGR card burning that fuel.
 */
export interface RecipePowerCard {
  sourceId: string;
  settings: Record<string, string>;
}

const HTGR_MARK = /htgr|high[\s_-]*temp(erature)?[\s_-]*gas/i;

export function powerCardForRecipe(
  recipe: Pick<Recipe, "id" | "machineType" | "source" | "outputs" | "power" | "category">,
): RecipePowerCard | undefined {
  if (isPowerRecipe(recipe)) {
    return undefined;
  }
  const mark = [recipe.source?.recipeMap, recipe.machineType, recipe.id].some(
    (text) => text !== undefined && HTGR_MARK.test(text),
  );
  if (!mark) {
    return undefined;
  }
  const outputIds = new Set(recipe.outputs.map((output) => output.id));
  for (const pebble of powerPlannerData.htgrPebbles) {
    const fuel = resolvePowerResource(htgrFuelName(pebble.name, false));
    if (fuel && outputIds.has(fuel.id)) {
      return { sourceId: "htgr", settings: { pebble: pebble.name } };
    }
  }
  return undefined;
}
