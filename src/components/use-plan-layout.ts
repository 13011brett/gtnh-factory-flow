"use client";

import { useDeviceSettings } from "@/lib/device-settings";
import { useIsCompactViewport } from "@/lib/compact-view";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Plan-mode boards mirror the workspace: the overview rail left, the items
 * browser right (like NEI beside the mod's board), no inspector. The Pool
 * worksheet keeps the classic columns.
 */
export function usePlanLayout(): boolean {
  return useFactoryStore((state) => state.project.planMode === true && state.project.poolMode !== true);
}

/**
 * Whether the items browser sits right of the board: on plan boards, unless the settings' "Item browser" puts it on the
 * left (and the overview on the right). A phone's drawers keep it on the right.
 */
export function useItemsOnRight(): boolean {
  const planLayout = usePlanLayout();
  const itemsLeft = useDeviceSettings().itemsLeft;
  const compact = useIsCompactViewport();
  return planLayout && (compact || !itemsLeft);
}
