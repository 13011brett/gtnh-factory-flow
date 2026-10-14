"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { RecipeNode, type RecipeFlowNode, type RecipeNodeData } from "../RecipeNode";
import { useRenderedHandles } from "../use-rendered-handles";
import { useFactoryStore } from "@/store/factory-store";
import { CleanCard } from "./CleanCard";
import { useCleanCardModel } from "./clean-model";
import { supportsClean } from "./support";

function CleanRecipeNodeComponent({ data, selected }: { data: RecipeNodeData; selected: boolean }) {
  const { view, actions, context } = useCleanCardModel(data, selected);
  // React Flow measures handles at mount; re-measure when the set of rendered ids changes.
  useRenderedHandles(data.projectNode.id, context.handleIds);
  return <CleanCard view={view} actions={actions} context={context} recipe={data.recipe} node={data.projectNode} />;
}

/**
 * The recipe card of a plan-mode board: the clean look where it has a design,
 * the classic card for the cards the mod has none for yet. Registered as
 * `recipeNode` in FactoryFlow, so a board decides per node, per render, with
 * no change to anything that already speaks of recipe nodes.
 */
function RecipeNodeSwitchComponent(props: NodeProps<RecipeFlowNode>) {
  const planMode = useFactoryStore((state) => state.project.planMode === true);
  const { data, selected } = props;
  if (planMode && supportsClean(data.recipe, data.projectNode)) {
    return <CleanRecipeNodeComponent data={data} selected={selected === true} />;
  }
  return <RecipeNode {...props} />;
}

export const RecipeNodeSwitch = memo(
  RecipeNodeSwitchComponent,
  (previous, next) => previous.data === next.data && previous.selected === next.selected,
);
