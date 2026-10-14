import type { FactoryNode, Recipe } from "@/lib/model/types";

/**
 * Whether the clean card draws this node: every node, now. The cards the plain clean card cannot be (shared
 * machines, generators, the custom rate and fluid tank holders, crops) are `special/` cards, chosen by
 * `specialKindOf`; the classic card is no longer reachable from the board. Kept so older callers read true.
 */
export function supportsClean(_recipe: Recipe, _node: FactoryNode): boolean {
  void _recipe;
  void _node;
  return true;
}
