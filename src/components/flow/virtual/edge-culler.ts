/**
 * ONLY THE WIRES ON OR NEAR THE SCREEN ARE MOUNTED.
 *
 * A wire is 7-8 elements and a React Flow wrapper, and its hit area is hit-test work for the browser whether it
 * is on screen or not. This picks the wires worth mounting: those whose box (the two cards and, when the router
 * has already routed the wire, its whole route) meets the camera's rectangle grown a little. Nothing here reads
 * the DOM, and the routes themselves stay a function of the cards' published boxes (grid-edge-router), so what
 * is mounted never changes where a wire goes.
 */

import { grow, meets, type VRect } from "./card-virtualizer";

export interface CullableEdge {
  id: string;
  source: string;
  target: string;
  selected?: boolean;
}

export type RoutePoints = ReadonlyArray<{ x: number; y: number }>;

/** The box of a route, kept per points array (a route is rebuilt, never edited, so identity is the key). */
const routeBoxes = new WeakMap<object, VRect | null>();

export function routeBox(points: RoutePoints | undefined): VRect | undefined {
  if (!points || points.length === 0) return undefined;
  const cached = routeBoxes.get(points);
  if (cached !== undefined) return cached ?? undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of points) {
    if (point.x < x0) x0 = point.x;
    if (point.x > x1) x1 = point.x;
    if (point.y < y0) y0 = point.y;
    if (point.y > y1) y1 = point.y;
  }
  const box = Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  routeBoxes.set(points, box);
  return box ?? undefined;
}

function union(a: VRect, b: VRect): VRect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
}

/**
 * The edges to mount, in their original order. `boxOf` is a card's published box; an edge with an end that has no
 * measured box is left out (React Flow cannot draw it yet either). `routeOf` gives the route the router found, if
 * any; without one the wire's box is the two cards' union grown by `detour` px for the way round obstacles.
 */
export function selectVisibleEdges<E extends CullableEdge>(
  edges: readonly E[],
  view: VRect,
  options: {
    margin: number;
    /** Wires already mounted stay until they are out of this larger reach (the camera's rectangle grown by it). */
    keepMargin?: number;
    kept?: ReadonlySet<string>;
    detour: number;
    boxOf: (cardId: string) => VRect | undefined;
    routeOf?: (edgeId: string) => RoutePoints | undefined;
    alwaysIds?: ReadonlySet<string>;
  },
): E[] {
  const reach = grow(view, options.margin);
  const keepReach = options.keepMargin !== undefined && options.kept ? grow(view, options.keepMargin) : undefined;
  const shown: E[] = [];
  for (const edge of edges) {
    if (edge.selected || options.alwaysIds?.has(edge.id)) {
      shown.push(edge);
      continue;
    }
    const a = options.boxOf(edge.source);
    const b = options.boxOf(edge.target);
    if (!a || !b || !(a.w > 0) || !(b.w > 0)) continue;
    const route = routeBox(options.routeOf?.(edge.id));
    const box = route ? union(route, union(a, b)) : union(a, b);
    // Stroke, arrow and hops reach a little past the route; an unrouted wire may detour round obstacles.
    const pad = route ? 40 : options.detour;
    const padded = { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad };
    if (meets(padded, keepReach && options.kept!.has(edge.id) ? keepReach : reach)) shown.push(edge);
  }
  return shown;
}

export function sameEdgeList<E extends { id: string }>(a: readonly E[], b: readonly E[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
