/**
 * The desktop workspace's column arithmetic, kept out of the component so the
 * two layouts can be tested without a DOM.
 *
 * Classic boards: items browser left, board, resource inspector right.
 * Plan-mode boards (`project.planMode`, not Pool): the overview rail left, the
 * board, the items browser right, like NEI beside the mod's board, or the other
 * way round (the settings' "Item browser"). There is no inspector on those.
 *
 * All lengths are SHELL px.
 */
export const ITEMS_WIDTH = 256;
export const INSPECTOR_WIDTH = 234;
/** Wide enough for one 24px button plus its border. */
export const PANEL_RAIL_WIDTH = 26;

export type ItemsSide = "left" | "right";

export interface WorkspaceColumnsInput {
  /** planMode and not poolMode: the mirrored layout. */
  planLayout: boolean;
  itemsOpen: boolean;
  /** Classic only: the inspector column is open. */
  inspectorOpen: boolean;
  /** A page covers the board, or the Pool worksheet is up: nothing reads the board's solve. */
  hideBoardPanels: boolean;
  /** Plan layout only: the overview's own width (open or folded to its strip). */
  overviewWidth: number;
  /** Plan layout only: the items browser on the left and the overview on the right. */
  itemsLeft?: boolean;
}

export interface WorkspaceColumns {
  itemsSide: ItemsSide;
  leftPx: number;
  rightPx: number;
  /** Whether the classic inspector column holds its panel (not the rail or nothing). */
  inspectorShown: boolean;
  template: string;
}

export function workspaceColumns(input: WorkspaceColumnsInput): WorkspaceColumns {
  const itemsPx = input.itemsOpen ? ITEMS_WIDTH : PANEL_RAIL_WIDTH;
  if (input.planLayout) {
    // With a page over the board the overview is GONE, not folded.
    const overviewPx = input.hideBoardPanels ? 0 : input.overviewWidth;
    const leftPx = input.itemsLeft ? itemsPx : overviewPx;
    const rightPx = input.itemsLeft ? overviewPx : itemsPx;
    return {
      itemsSide: input.itemsLeft ? "left" : "right",
      leftPx,
      rightPx,
      inspectorShown: false,
      template: `${leftPx}px minmax(0,1fr) ${rightPx}px`,
    };
  }
  const inspectorShown = input.inspectorOpen && !input.hideBoardPanels;
  const rightPx = inspectorShown
    ? INSPECTOR_WIDTH
    : input.hideBoardPanels
      ? 0
      : PANEL_RAIL_WIDTH;
  return {
    itemsSide: "left",
    leftPx: itemsPx,
    rightPx,
    inspectorShown,
    template: `${itemsPx}px minmax(0,1fr) ${rightPx}px`,
  };
}

/**
 * Where a full-screen search or picker begins and ends so it leaves the items
 * browser (and, on plan boards, the overview) bright beside it. SHELL px.
 * `classicLeft` is the measured browser width the classic layout already used.
 */
export function overlayInsets(
  scale: number,
  classicLeft: () => number,
  root: ParentNode = document,
): { left: number; right: number } {
  const main = root.querySelector<HTMLElement>("main[data-plan-layout]");
  if (!main) {
    return { left: classicLeft(), right: 0 };
  }
  const left = Number(main.dataset.leftPx) || 0;
  let right = Number(main.dataset.rightPx) || 0;
  if (main.dataset.compact === "true") {
    // The items browser is a drawer here: it leaves what its width covers.
    const aside = root.querySelector<HTMLElement>("aside[data-help-anchor='browser']");
    right = aside ? Math.round(aside.getBoundingClientRect().width / scale) : 0;
  }
  return { left, right };
}
