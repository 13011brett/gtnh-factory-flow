"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { RecipeFlowNode, RecipeNodeData } from "../RecipeNode";
import { useRenderedHandles } from "../use-rendered-handles";
import { CleanCard } from "./CleanCard";
import { useCleanCardModel } from "./clean-model";
import { SpecialCleanNode } from "./special/SpecialNode";
import { specialKindOf } from "./special/special-model";

function CleanRecipeNodeComponent({ data, selected }: { data: RecipeNodeData; selected: boolean }) {
  const { view, actions, context } = useCleanCardModel(data, selected);
  // React Flow measures handles at mount; re-measure when the set of rendered ids changes.
  useRenderedHandles(data.projectNode.id, context.handleIds);
  return <CleanCard view={view} actions={actions} context={context} recipe={data.recipe} node={data.projectNode} />;
}

/**
 * The recipe card of every board: always the clean look. A node the plain card cannot be (shared machines,
 * generators, the custom rate and fluid tank holders) is `SpecialCleanNode`; everything else is the plain card.
 * The classic `RecipeNode` is no longer reachable from here. Registered as `recipeNode` in FactoryFlow.
 */
function RecipeNodeSwitchComponent(props: NodeProps<RecipeFlowNode>) {
  const { data, selected } = props;
  const kind = specialKindOf(data.recipe, data.projectNode);
  if (kind) return <SpecialCleanNode kind={kind} data={data} selected={selected === true} />;
  return <CleanRecipeNodeComponent data={data} selected={selected === true} />;
}

export const RecipeNodeSwitch = memo(
  RecipeNodeSwitchComponent,
  (previous, next) => previous.data === next.data && previous.selected === next.selected,
);
