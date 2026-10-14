"use client";

import { useFactoryStore } from "@/store/factory-store";

/**
 * Plan-mode boards mirror the workspace: the overview rail left, the items
 * browser right (like NEI beside the mod's board), no inspector. The Pool
 * worksheet keeps the classic columns.
 */
export function usePlanLayout(): boolean {
  return useFactoryStore((state) => state.project.planMode === true && state.project.poolMode !== true);
}
