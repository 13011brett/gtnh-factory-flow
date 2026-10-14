import type { FactoryNode, Recipe } from "@/lib/model/types";
import {
  CROP_FARM_PLACEHOLDER_RECIPE_ID,
  isBeeProductionRecipe,
  isCropFarmRecipe,
  isCropProductionRecipe,
  isIndustrialApiaryMachineType,
} from "@/lib/model";
import { isCustomRateRecipe } from "@/lib/model/custom-rate";
import { isSharedMachineNode } from "@/lib/model/shared-machine";
import { isEecRecipe } from "@/lib/machines/extreme-entity-crusher";

/**
 * Whether the clean card draws this node. Cards the mod has no clean design
 * for yet (power cards, crop farms, bees, custom rate, the Extreme Entity
 * Crusher's spawner, shared machines) fall back to the classic component, one
 * node at a time.
 */
export function supportsClean(recipe: Recipe, node: FactoryNode): boolean {
  if (recipe.power) return false;
  if (recipe.id === CROP_FARM_PLACEHOLDER_RECIPE_ID) return false;
  if (isCropFarmRecipe(recipe) || isCropProductionRecipe(recipe)) return false;
  if (isBeeProductionRecipe(recipe) || isIndustrialApiaryMachineType(recipe.machineType)) return false;
  if (isCustomRateRecipe(recipe)) return false;
  if (isEecRecipe(recipe)) return false;
  if (isSharedMachineNode(node)) return false;
  return true;
}
