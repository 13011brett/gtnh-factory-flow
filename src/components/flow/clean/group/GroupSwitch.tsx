"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { useFactoryStore } from "@/store/factory-store";
import { BoardNode, type BoardWindowFlowNode } from "../../BoardNode";
import { PocketNode, type PocketFlowNode } from "../../PocketNode";
import { CleanGroupFrame } from "./CleanGroupFrame";
import { CleanGroupSummary } from "./CleanGroupSummary";

/**
 * What FactoryFlow registers as `boardNode` and `pocketNode`: on a plan board (`project.planMode`) a board is a group
 * in the clean look (docs/groups.md), an open frame or a collapsed summary card; classic boards keep theirs.
 */
function BoardNodeSwitchComponent(props: NodeProps<BoardWindowFlowNode>) {
  const planMode = useFactoryStore((state) => state.project.planMode === true);
  return planMode ? <CleanGroupFrame {...props} /> : <BoardNode {...props} />;
}

function PocketNodeSwitchComponent(props: NodeProps<PocketFlowNode>) {
  const planMode = useFactoryStore((state) => state.project.planMode === true);
  return planMode ? <CleanGroupSummary {...props} /> : <PocketNode {...props} />;
}

export const BoardNodeSwitch = memo(BoardNodeSwitchComponent);
export const PocketNodeSwitch = memo(PocketNodeSwitchComponent);
