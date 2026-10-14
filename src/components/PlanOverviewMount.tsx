"use client";

/** The one seam between the plan-mode workspace and the overview rail (flow/clean/rail). */
import { OverviewRail, useRailColumnWidth } from "./flow/clean/rail/OverviewRail";

export const usePlanOverviewWidth = useRailColumnWidth;

export function PlanOverview({ inDrawer = false }: { inDrawer?: boolean }) {
  return (
    <div data-testid="plan-overview" className="h-full min-h-0 min-w-0">
      <OverviewRail forceOpen={inDrawer} />
    </div>
  );
}
