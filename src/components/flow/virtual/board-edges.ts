import type { Edge } from "@xyflow/react";
import { boardVirtualizer, virtualizationEnabled } from "./card-virtualizer";
import { sameEdgeList, selectVisibleEdges, type RoutePoints } from "./edge-culler";

/** How far past the screen a wire still counts as near, as a share of the screen's size. */
export const EDGE_MARGIN = 0.35;
/** A wire already mounted stays until it is this far out, so a zoom that goes back and forth does not remount it. */
export const EDGE_KEEP_MARGIN = 0.9;
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

  /** Recomputes; returns the new list when the choice changed. */
  refresh(): Edge[] | undefined {
    const next = this.compute();
    if (sameEdgeList(next, this.shown)) return undefined;
    this.shown = next;
    return next;
  }
}

export const boardEdges = new BoardEdges();
