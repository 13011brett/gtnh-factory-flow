import { getSelectedMachineHandler } from "@/lib/model";
import { parseSectionNodeId } from "@/lib/model/shared-machine";
import type { FactoryNode, FactoryProject, Recipe } from "@/lib/model/types";

/**
 * A card named so it cannot be taken for another: its machine name as its head shows it, and, when another card on
 * the board has that name, what tells it apart (something it makes that none of the others makes, else something it
 * takes that none of them takes). The notices bar and a stalled card's foot bar use the same words.
 */

type LabelProject = Pick<FactoryProject, "nodes" | "recipes">;

export interface CardLabel {
  name: string;
  makes?: string;
  takes?: string;
}

/** A card's machine name as its head shows it: the chosen machine's, a generator's own. */
export function machineNameOf(node: FactoryNode, recipe: Recipe | undefined): string | undefined {
  if (!recipe) return undefined;
  if (recipe.power) return recipe.machineType;
  try {
    return getSelectedMachineHandler(recipe, node).label;
  } catch {
    return recipe.machineType;
  }
}

interface LabelIndex {
  nodes: Map<string, FactoryNode>;
  recipes: Map<string, Recipe>;
  name: Map<string, string>;
  byName: Map<string, string[]>;
}

/** Built once per plan object: a label then costs the cards that share its name, not the whole board. */
const indexes = new WeakMap<object, LabelIndex>();

function indexOf(project: LabelProject): LabelIndex {
  let index = indexes.get(project);
  if (!index) {
    const recipes = new Map(project.recipes.map((recipe) => [recipe.id, recipe] as const));
    const nodes = new Map<string, FactoryNode>();
    const name = new Map<string, string>();
    const byName = new Map<string, string[]>();
    for (const node of project.nodes) {
      nodes.set(node.id, node);
      const label = machineNameOf(node, recipes.get(node.recipeId));
      if (label === undefined) continue;
      name.set(node.id, label);
      byName.set(label, [...(byName.get(label) ?? []), node.id]);
    }
    index = { nodes, recipes, name, byName };
    indexes.set(project, index);
  }
  return index;
}

function names(list: readonly { displayName?: string; id: string }[] | undefined): string[] {
  return (list ?? []).map((entry) => entry.displayName ?? entry.id);
}

/** Every recipe a card runs (a shared machine's sections too). */
function recipesOf(index: LabelIndex, cardId: string): Recipe[] {
  const node = index.nodes.get(cardId);
  if (!node) return [];
  return [node.recipeId, ...(node.extraRecipes ?? []).map((extra) => extra.recipeId)]
    .map((id) => index.recipes.get(id))
    .filter((recipe): recipe is Recipe => recipe !== undefined);
}

/**
 * The card's label. `prefer` is the resource the sentence is about (named first when it tells the card apart);
 * `nodeId` the solve node the sentence is about (`card#rN`: that recipe of a shared machine, not its first).
 */
export function cardLabel(
  project: LabelProject,
  cardId: string,
  prefer?: string,
  nodeId?: string,
): CardLabel {
  const index = indexOf(project);
  const name = index.name.get(cardId) ?? "machine";
  const peers = (index.byName.get(name) ?? []).filter((id) => id !== cardId);
  if (peers.length === 0) return { name };
  const node = index.nodes.get(cardId);
  const section = nodeId ? parseSectionNodeId(nodeId).section : 0;
  const recipeId = section > 0 ? node?.extraRecipes?.[section - 1]?.recipeId : node?.recipeId;
  const recipe = recipeId ? index.recipes.get(recipeId) : undefined;
  if (!recipe) return { name };
  const peerRecipes = peers.flatMap((id) => recipesOf(index, id));
  const othersMake = new Set(peerRecipes.flatMap((peer) => names(peer.outputs)));
  const othersTake = new Set(peerRecipes.flatMap((peer) => names(peer.inputs)));
  const outs = names(recipe.outputs);
  const makes = [...(prefer !== undefined && outs.includes(prefer) ? [prefer] : []), ...outs].find(
    (entry) => !othersMake.has(entry),
  );
  if (makes) return { name, makes };
  const takes = names(recipe.inputs).find((entry) => !othersTake.has(entry));
  return takes ? { name, takes } : { name };
}

/** The label as words: "Large Chemical Reactor that makes it" when it makes `it`, else what it makes or takes. */
export function cardLabelText(label: CardLabel, it?: string): string {
  if (label.makes) {
    return `${label.name} that makes ${label.makes === it ? "it" : label.makes}`;
  }
  return label.takes ? `${label.name} that takes ${label.takes}` : label.name;
}
