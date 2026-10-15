import { isPowerRecipe } from "@/lib/power/power-recipe";
import type { FactoryProject, Recipe } from "@/lib/model/types";
import type { LivePlan } from "./ops";

/**
 * A plan as live edits see it: the editor's project with everything that is
 * not a person's doing taken out, so a diff of two shapes is exactly what
 * someone did. Both sides of every diff are shaped the same way, and so is
 * a snapshot before it becomes the confirmed plan, so no op ever names a
 * field left out here:
 *
 * - `metadata`: this device's stamps and the owner's post link.
 * - `name`: the design's name is the account row's, changed through the
 *   library, never as a plan edit.
 * - `view`: how each person dresses the board.
 * - `poolCellRatios`: fetched from the Canner's recipes by every client.
 * - GregTech recipes' `runtimeCalculation` tables: the dataset puts them back
 *   on landing (`recipesToRefresh`), as for the account copy.
 *
 * Shapes are cached by object identity, so an edit that leaves a thing alone
 * leaves its shape the same object and the diff skips it without comparing.
 */

const DROPPED_FIELDS = ["metadata", "name", "view", "poolCellRatios"] as const;

const shapedPlans = new WeakMap<object, LivePlan>();
const shapedRecipeLists = new WeakMap<object, unknown[]>();
const shapedRecipes = new WeakMap<object, Recipe>();

function shapeRecipe(recipe: Recipe): Recipe {
  if (isPowerRecipe(recipe) || !recipe.runtimeCalculation?.sourceKind?.startsWith("gregtech-")) {
    return recipe;
  }
  let shaped = shapedRecipes.get(recipe);
  if (!shaped) {
    const { runtimeCalculation, ...rest } = recipe;
    void runtimeCalculation;
    shaped = rest as Recipe;
    shapedRecipes.set(recipe, shaped);
  }
  return shaped;
}

function shapeRecipes(recipes: unknown): unknown {
  if (!Array.isArray(recipes)) {
    return recipes;
  }
  let shaped = shapedRecipeLists.get(recipes);
  if (!shaped) {
    shaped = recipes.map((recipe) =>
      recipe && typeof recipe === "object" ? shapeRecipe(recipe as Recipe) : recipe,
    );
    shapedRecipeLists.set(recipes, shaped);
  }
  return shaped;
}

/** The plan as live edits see it (see above). Never mutate the result. */
export function liveShape(plan: FactoryProject | LivePlan): LivePlan {
  const source = plan as LivePlan;
  let shaped = shapedPlans.get(source);
  if (!shaped) {
    const next: LivePlan = { ...source };
    for (const field of DROPPED_FIELDS) {
      delete next[field];
    }
    if ("recipes" in next) {
      next.recipes = shapeRecipes(next.recipes);
    }
    shaped = next;
    shapedPlans.set(source, shaped);
  }
  return shaped;
}
