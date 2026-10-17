"use client";

/** The one seam between the plan-mode workspace and the overview rail (flow/clean/rail). */
import { OverviewRail, useRailColumnWidth } from "./flow/clean/rail/OverviewRail";

export const usePlanOverviewWidth = useRailColumnWidth;

/** {@code side}: the side of the board the overview sits on (the settings' "Item browser" may put it on the right). */
export function PlanOverview({ inDrawer = false, side = "left" }: { inDrawer?: boolean; side?: "left" | "right" }) {
  return (
    <div data-testid="plan-overview" className="h-full min-h-0 min-w-0">
      <OverviewRail forceOpen={inDrawer} side={side} />
    </div>
  );
}
