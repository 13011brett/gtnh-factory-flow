import type { Recipe, ResourceAmount } from "@/lib/model/types";
import type { DatasetVersion } from "./types";
import { FLUID_TANK_MAP } from "@/lib/model/fluid-tank";
import { getRecipeDatasetRecipe, queryRecipeDatasetRecipes } from "./browser-loader";
import { DEFAULT_DATASET_MANIFEST_URL } from "./remote";

/**
 * The Tank recipe a port dropped on an empty fluid tank makes the card take. `takes` is the tank's side: the tank
 * takes the resource (a machine made it) when true, gives it (a machine asks for it) when false. A cell taken is
 * emptied and a fluid taken fills cells; a cell given is filled and a fluid given is emptied out of cells. Of the
 * containers that would do, the plain Empty Cell's recipe comes first, as in the mod. Undefined for what has no
 * Tank recipe (an item that holds no fluid): the drop is refused, never guessed.
 */
export async function fetchFluidTankRecipe(
  version: DatasetVersion,
  resource: Pick<ResourceAmount, "kind" | "id">,
  takes: boolean,
): Promise<Recipe | undefined> {
  if (resource.kind !== "item" && resource.kind !== "fluid") return undefined;
  // "uses" lists what takes the resource in, "recipes" what makes it.
  const mode = takes ? "uses" : "recipes";
  try {
    const result = await queryRecipeDatasetRecipes(DEFAULT_DATASET_MANIFEST_URL, version, {
      query: "",
      mode,
      maxTier: "all",
      offset: 0,
      limit: 60,
      recipeMap: FLUID_TANK_MAP,
      resource: { kind: resource.kind, id: resource.id },
    });
    const fits = result.recipes.filter((recipe) => recipe.recipeMap === FLUID_TANK_MAP);
    const plain = (recipe: {
      name?: string;
      inputs?: ResourceAmount[];
      outputs?: ResourceAmount[];
    }) =>
      [...(recipe.inputs ?? []), ...(recipe.outputs ?? [])].some(
        (slot) => slot.kind === "item" && /(^|:)itemCellEmpty$/i.test(slot.id),
      ) || /empty cell/i.test(recipe.name ?? "");
    const pick = fits.find(plain) ?? fits[0];
    return pick
      ? await getRecipeDatasetRecipe(DEFAULT_DATASET_MANIFEST_URL, version, pick.id)
      : undefined;
  } catch {
    return undefined;
  }
}
