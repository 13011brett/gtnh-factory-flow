import type { FactoryNode, FactoryProject, Recipe } from "@/lib/model/types";

/**
 * The selection bar's "Combine N into one machine" (the mod's
 * `BoardSession.canCombine`): two or more selected ids that are all recipe
 * cards, none of them a power, crop or custom-rate card, and one machine that
 * runs every one of their recipes. Never explained when absent.
 */
export interface CombineDeps {
  /** The machines (by id) that could run this card's recipes. */
  handlersOf: (card: FactoryNode, recipesById: Map<string, Recipe>) => Array<{ id: string }>;
  /** Cards with no shared-machine design (power, crops, custom rate). */
  excluded: (recipe: Recipe) => boolean;
}

export function canCombineSelection(
  project: Pick<FactoryProject, "nodes" | "recipes">,
  selectedIds: readonly string[],
  deps: CombineDeps,
): boolean {
  if (selectedIds.length < 2) return false;
  const chosen = new Set(selectedIds);
  const cards = project.nodes.filter((node) => chosen.has(node.id));
  // A drawer, board or note in the selection means it is not a selection of cards.
  if (cards.length !== selectedIds.length) return false;
  const recipesById = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  let common: Array<{ id: string }> | undefined;
  for (const card of cards) {
    const recipe = recipesById.get(card.recipeId);
    if (!recipe || deps.excluded(recipe)) return false;
    const own = deps.handlersOf(card, recipesById);
    const ids = new Set(own.map((handler) => handler.id));
    common = common ? common.filter((handler) => ids.has(handler.id)) : own;
    if (common.length === 0) return false;
  }
  return true;
}

export const COMBINE_TIP = {
  id: "selection|combine",
  title: "Combine into one shared machine",
  notes: [{ text: "The selected recipes run on one machine and share its settings.", tone: "muted" as const }],
};
