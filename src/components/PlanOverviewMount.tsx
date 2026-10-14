"use client";

/**
 * The ONE seam between the plan-mode workspace and the overview rail.
 *
 * WP5 builds the real rail in `flow/clean/rail/OverviewRail.tsx`
 * (`OverviewRail`, `useRailColumnWidth`). When it lands, replace the body of
 * this file with
 *
 *   export { OverviewRail as PlanOverview, useRailColumnWidth as usePlanOverviewWidth } from "./flow/clean/rail/OverviewRail";
 *
 * Contract: `PlanOverview` fills its grid cell (h-full), draws its own fold
 * strip when folded and keeps that fold per device; `usePlanOverviewWidth`
 * is the cell's width in shell px for the current fold state. In a compact
 * drawer it is passed `inDrawer`, where it must show open.
 *
 * Until then this is a labelled placeholder that folds through the existing
 * per-device `rightPanelOpen` flag.
 */
import { writeWorkspaceView, useWorkspaceView } from "@/lib/workspace-view";
import { INSPECTOR_WIDTH, PANEL_RAIL_WIDTH } from "@/lib/workspace-columns";
import { ChevronIcon } from "./PanelDrawer";

export function usePlanOverviewWidth(): number {
  return useWorkspaceView().rightPanelOpen ? INSPECTOR_WIDTH : PANEL_RAIL_WIDTH;
}

export function PlanOverview({ inDrawer = false }: { inDrawer?: boolean }) {
  const open = useWorkspaceView().rightPanelOpen || inDrawer;
  if (!open) {
    return (
      <button
        type="button"
        data-testid="plan-overview-strip"
        aria-label="Show the overview"
        onClick={() => writeWorkspaceView({ rightPanelOpen: true })}
        className="flex h-full w-full flex-col items-center gap-2 border-r border-line bg-surface pt-1.5 text-fg-muted hover:bg-[#2a2d33]"
      >
        <ChevronIcon direction="right" />
        <span
          aria-hidden
          className="min-h-0 flex-1 text-[12px] font-semibold uppercase tracking-widest"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          Overview
        </span>
      </button>
    );
  }
  return (
    <aside
      data-testid="plan-overview-placeholder"
      data-help-anchor="overview"
      className="flex h-full min-h-[360px] compact:min-h-0 flex-col border-r border-line bg-[#202226] text-fg"
    >
      <div className="flex h-[26px] shrink-0 items-center justify-between bg-[#2A2D33] px-2 text-[11px] text-fg-muted">
        OVERVIEW (placeholder)
        {inDrawer ? null : (
          <button
            type="button"
            aria-label="Fold the overview"
            onClick={() => writeWorkspaceView({ rightPanelOpen: false })}
            className="flex h-5 w-5 items-center justify-center border border-line"
          >
            <ChevronIcon direction="left" />
          </button>
        )}
      </div>
    </aside>
  );
}
