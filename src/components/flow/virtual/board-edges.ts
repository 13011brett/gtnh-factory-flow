import type { Edge } from "@xyflow/react";
import { boardVirtualizer, virtualizationEnabled } from "./card-virtualizer";
import { sameEdgeList, selectVisibleEdges, type RoutePoints } from "./edge-culler";

/** How far past the screen a wire still counts as near, as a share of the screen's size. */
export const EDGE_MARGIN = 0.35;
/** A wire already mounted stays until it is this far out, so a zoom that goes back and forth does not remount it. */
export const EDGE_KEEP_MARGIN = 0.9;
/** How far the camera may move (a share of the screen) before the wires are picked again. */
export const EDGE_STEP = 0.1;
/** The wires are picked again at least this often while the camera moves (routes may have arrived). */
export const EDGE_REPICK_MS = 250;
/** How far an unrouted wire may wander round obstacles beyond its two cards, in flow px. */
export const EDGE_DETOUR = 480;

/**
 * The board's wires and the ones of them that are mounted.
 *
 * FactoryFlow hands React Flow `shown` (through `setAll`, in a memo, so a new plan or a solve gives it the
 * current choice); the controller changes the choice as the camera moves by writing React Flow's own store,
 * which does not re-render FactoryFlow. React Flow overwrites its store only when the prop's identity changes,
 * and a change of `all` is the only time that happens.
 */
class BoardEdges {
  all: Edge[] = [];
  shown: Edge[] = [];
  /** The router's route for a wire, once it has one (registered by FactoryFlow). */
  routeOf: ((edgeId: string) => RoutePoints | undefined) | undefined;

  setAll<E extends Edge>(edges: E[]): E[] {
    this.all = edges;
    this.shown = this.compute();
    this.lastView = undefined;
    return this.shown as E[];
  }

  /** The wires to mount for the camera as it is now. */
  compute(): Edge[] {
    if (!virtualizationEnabled() || boardVirtualizer.holding()) return this.all;
    const view = boardVirtualizer.viewRect();
    if (!view) return [];
    return selectVisibleEdges(this.all, view, {
      margin: EDGE_MARGIN,
      keepMargin: EDGE_KEEP_MARGIN,
      kept: this.shownIds(),
      detour: EDGE_DETOUR,
      boxOf: (id) => boardVirtualizer.boxOf(id),
      routeOf: this.routeOf,
    });
  }

  private shownIdSet: Set<string> | undefined;
  private shownIdsOf: Edge[] | undefined;

  /** The ids of the wires mounted now, kept per list. */
  private shownIds(): ReadonlySet<string> {
    if (this.shownIdsOf !== this.shown || !this.shownIdSet) {
      this.shownIdSet = new Set(this.shown.map((edge) => edge.id));
      this.shownIdsOf = this.shown;
    }
    return this.shownIdSet;
  }

  private lastView: { x: number; y: number; w: number; h: number } | undefined;
  private lastAt = 0;

  /** The next refresh picks again whatever the camera did (the export's hold ended, say). */
  invalidate(): void {
    this.lastView = undefined;
  }

  /**
   * Recomputes; returns the new list when the choice changed. A camera that moved less than `EDGE_STEP` of the
   * screen (and zoomed less than that) since the last pick keeps it: the pick reaches `EDGE_MARGIN` past the
   * screen, so nothing it left out can have come on screen yet. It is picked again at least every
   * `EDGE_REPICK_MS` all the same, for routes that arrived meanwhile.
   */
  refresh(now = performance.now()): Edge[] | undefined {
    const view = boardVirtualizer.viewRect();
    const last = this.lastView;
    if (
      view &&
      last &&
      now - this.lastAt < EDGE_REPICK_MS &&
      !boardVirtualizer.holding() &&
      Math.abs(view.x - last.x) < last.w * EDGE_STEP &&
      Math.abs(view.y - last.y) < last.h * EDGE_STEP &&
      Math.abs(view.w - last.w) < last.w * EDGE_STEP
    ) {
      return undefined;
    }
    this.lastView = view ? { ...view } : undefined;
    this.lastAt = now;
    const next = this.compute();
    if (sameEdgeList(next, this.shown)) return undefined;
    this.shown = next;
    return next;
  }
}

export const boardEdges = new BoardEdges();
