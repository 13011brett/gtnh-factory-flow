"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { RecipeFlowNode, RecipeNodeData } from "../RecipeNode";
import { useRenderedHandles } from "../use-rendered-handles";
import { CleanCard } from "./CleanCard";
import { useCleanCardModel, type CleanCardActions, type CleanCardContext, type CleanCardView } from "./clean-model";
import { CC_GEOMETRY } from "./tokens";
import { VirtualCard } from "../virtual/VirtualCard";
import { cardLayoutSignature, estimateCardHeight } from "../virtual/card-shell";
import { SpecialCleanNode } from "./special/SpecialNode";
import { specialKindOf } from "./special/special-model";

/** The card itself; it exists only while the card is near the screen (virtual/VirtualCard.tsx). */
function MountedCleanCard({
  data,
  view,
  actions,
  context,
}: {
  data: RecipeNodeData;
  view: CleanCardView;
  actions: CleanCardActions;
  context: CleanCardContext;
}) {
  // React Flow measures handles at mount; re-measure when the set of rendered ids changes.
  useRenderedHandles(data.projectNode.id, context.handleIds);
  return <CleanCard view={view} actions={actions} context={context} recipe={data.recipe} node={data.projectNode} />;
}

function CleanRecipeNodeComponent({ data, selected }: { data: RecipeNodeData; selected: boolean }) {
  const { view, actions, context } = useCleanCardModel(data, selected);
  return (
    <VirtualCard
      nodeId={data.projectNode.id}
      selected={selected}
      signature={cardLayoutSignature(view)}
      face={{
        selected: view.selected,
        cannotRun: view.cannotRun,
        unset: view.unset,
        count: view.count.text,
        art: view.glanceArt,
        fallbackWidth: CC_GEOMETRY.cardWidth,
        fallbackHeight: estimateCardHeight(view),
      }}
    >
      <MountedCleanCard data={data} view={view} actions={actions} context={context} />
    </VirtualCard>
  );
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
