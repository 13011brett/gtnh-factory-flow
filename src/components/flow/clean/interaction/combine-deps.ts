import { getSharedMachineHandlers } from "@/lib/model/shared-machine";
import { isPowerRecipe } from "@/lib/power/power-recipe";
import { isCropFarmRecipe } from "@/lib/model/passive-production";
import { isCustomRateRecipe } from "@/lib/model/custom-rate";
import type { CombineDeps } from "./selection";

/** The real rules behind the selection bar's Combine key (see `canCombineSelection`). */
export const COMBINE_DEPS: CombineDeps = {
  handlersOf: (card, recipesById) => getSharedMachineHandlers(card, recipesById),
  excluded: (recipe) => isPowerRecipe(recipe) || isCropFarmRecipe(recipe) || isCustomRateRecipe(recipe),
};
