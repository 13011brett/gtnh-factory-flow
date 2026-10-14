"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { useFactoryStore } from "@/store/factory-store";
import { storageRoleFor, type StorageRole } from "@/lib/model/storage-role";
import { StorageNode, type StorageFlowNode } from "../../StorageNode";
import { CleanDrawer } from "./CleanDrawer";
import { supportsCleanDrawer } from "./drawer-model";

/**
 * The drawer of every board: always the clean drawer (source, product, byproduct, trash, and EU as a source or
 * product). The classic card is no longer reachable from here. Registered as `storageNode` in FactoryFlow.
 */
function StorageNodeSwitchComponent(props: NodeProps<StorageFlowNode>) {
  const { data, selected } = props;
  const { storage } = data;
  // Read off this drawer's own wires, as the classic drawer does: the whole-board map would re-render every
  // drawer whenever any other drawer's wiring changed.
  const role = useFactoryStore((state): StorageRole => {
    let hasIn = false;
    let hasOut = false;
    for (const edge of state.project.edges) {
      if (edge.target === storage.id) hasIn = true;
      else if (edge.source === storage.id) hasOut = true;
      if (hasIn && hasOut) break;
    }
    return storageRoleFor(storage, hasIn, hasOut, state.project.poolMode === true);
  });
  if (supportsCleanDrawer(storage, role)) {
    return <CleanDrawer data={data} selected={selected === true} role={role} />;
  }
  return <StorageNode {...props} />;
}

export const StorageNodeSwitch = memo(
  StorageNodeSwitchComponent,
  (previous, next) => previous.data === next.data && previous.selected === next.selected,
);
