"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { AnnotationNode, type AnnotationFlowNode } from "../../AnnotationNode";
import { useFactoryStore } from "@/store/factory-store";
import { StickyNote, type StickyNoteFlowNode } from "./StickyNote";

/**
 * What FactoryFlow registers as `annotationNode`: on a plan board (`project.planMode`) a text annotation is a
 * sticky note, drawn as the mod draws it; everywhere else the classic annotation. Other kinds never reach a plan
 * board (`visibleAnnotations`), so they stay in the data untouched.
 */
function AnnotationSwitchComponent(props: NodeProps<AnnotationFlowNode>) {
  const planMode = useFactoryStore((state) => state.project.planMode === true);
  if (planMode && props.data.annotation.kind === "text") {
    return <StickyNote {...(props as unknown as NodeProps<StickyNoteFlowNode>)} />;
  }
  return <AnnotationNode {...props} />;
}

export const AnnotationSwitch = memo(AnnotationSwitchComponent);
