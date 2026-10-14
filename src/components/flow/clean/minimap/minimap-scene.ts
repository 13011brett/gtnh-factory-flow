import { GT_NODE_COLORS } from "../../node-colors";
import type { MinimapRoute } from "./minimap-feed";

/**
 * What the minimap draws, as plain data: the tiles (cards, drawers, notes, boards), the routed wires, the
 * plan's name. Built from the board's own state (React Flow's node lookup, the router's published routes), never
 * from the DOM per frame. Drawing is `minimap-draw.ts`.
 */

export type TileKind = "card" | "drawer" | "note" | "board";
export type DrawerKind = "source" | "product" | "trash";

export interface Tile {
  id: string;
  kind: TileKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hex colour of the machine's tag (or the drawer's role). */
  tint: string;
  label: string;
  /** Card: the count as the card shows it ("x3"), gold when pinned, muted at zero. */
  count?: string;
  pinned?: boolean;
  zero?: boolean;
  /** The picture the zoomed-out card shows: the machine's art, or the drawer's resource icon. */
  art?: string;
  drawer?: DrawerKind;
  /** Drawer: the signed short rate. */
  rate?: string;
  selected?: boolean;
}

export interface Wire {
  id: string;
  points: Array<{ x: number; y: number }>;
  width: number;
  color: string;
  flowing: boolean;
}

export interface Scene {
  name: string;
  tiles: Tile[];
  wires: Wire[];
  /** The bounds of every tile, or undefined for an empty plan. */
  bounds?: { x0: number; y0: number; x1: number; y1: number };
}

/** What the card's own DOM says (its picture, its count line), read once per change, never per frame. */
export interface TileExtras {
  art?: string;
  count?: string;
  label?: string;
  drawer?: DrawerKind;
  rate?: string;
}

export interface SceneNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
  selected?: boolean;
  data: unknown;
}

export interface SceneEdge {
  id: string;
  hidden?: boolean;
  data?: { color?: string; flowRate?: unknown; transferred?: number } | undefined;
}

export interface SceneInput {
  name: string;
  nodes: readonly SceneNode[];
  edges: readonly SceneEdge[];
  routes?: readonly MinimapRoute[];
  extras?: (id: string) => TileExtras | undefined;
}

const NEUTRAL_TINT = "#8A93A6";
const SOURCE_TINT = "#78B6F4";
const PRODUCT_TINT = "#F59A5C";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "x0";
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
  return `x${rounded}`;
}

function tintOf(tag: unknown): string {
  const entry = typeof tag === "string" ? (GT_NODE_COLORS as Record<string, { swatch: string }>)[tag] : undefined;
  return entry?.swatch ?? NEUTRAL_TINT;
}

/** A wire's colour lifted off the dark board, as the edge itself does (a touch brighter). */
export function wireColor(hex: string | undefined): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#9aa1b0";
  const n = parseInt(hex.slice(1), 16);
  const lift = (c: number) => Math.round(c + (255 - c) * 0.2);
  const r = lift((n >> 16) & 255), g = lift((n >> 8) & 255), b = lift(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function buildScene(input: SceneInput): Scene {
  const tiles: Tile[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const node of input.nodes) {
    if (node.hidden || !(node.w > 0) || !(node.h > 0)) continue;
    const data = (node.data ?? {}) as Loose;
    const extras = input.extras?.(node.id);
    let tile: Tile | undefined;
    if (node.type === "recipeNode") {
      const pn = (data.projectNode ?? {}) as Loose;
      const pinned = typeof pn.solvePin === "number" && pn.solvePin > 0;
      const needed = Number(data.result?.theoreticalMachinesRequired ?? 0);
      const value = pinned ? pn.solvePin * Math.max(1, Number(pn.parallel ?? 1)) : needed;
      tile = {
        id: node.id,
        kind: "card",
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        tint: tintOf(pn.colorTag),
        label: extras?.label ?? String(data.recipe?.machineType ?? ""),
        count: extras?.count ?? formatCount(value),
        pinned,
        zero: !(value > 0),
        art: extras?.art,
      };
    } else if (node.type === "storageNode") {
      const drawer: DrawerKind = extras?.drawer ?? "product";
      tile = {
        id: node.id,
        kind: "drawer",
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        tint: drawer === "source" ? SOURCE_TINT : drawer === "product" ? PRODUCT_TINT : NEUTRAL_TINT,
        label: extras?.label ?? "",
        drawer,
        rate: extras?.rate,
        art: extras?.art,
      };
    } else if (node.type === "annotationNode") {
      const a = (data.annotation ?? {}) as Loose;
      if (a.kind !== "text") continue;
      tile = {
        id: node.id,
        kind: "note",
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        tint: tintOf(a.colorTag ?? "yellow"),
        label: "",
      };
    } else if (node.type === "boardNode") {
      tile = { id: node.id, kind: "board", x: node.x, y: node.y, w: node.w, h: node.h, tint: NEUTRAL_TINT, label: "" };
    }
    if (!tile) continue;
    tile.selected = node.selected === true;
    tiles.push(tile);
    x0 = Math.min(x0, tile.x);
    y0 = Math.min(y0, tile.y);
    x1 = Math.max(x1, tile.x + tile.w);
    y1 = Math.max(y1, tile.y + tile.h);
  }

  const edgeById = new Map(input.edges.map((e) => [e.id, e]));
  const wires: Wire[] = [];
  for (const route of input.routes ?? []) {
    const edge = edgeById.get(route.edgeId);
    if (!edge || edge.hidden || route.points.length < 2) continue;
    const data = edge.data;
    wires.push({
      id: route.edgeId,
      points: route.points,
      width: route.width ?? 3,
      color: wireColor(data?.color),
      flowing: data?.flowRate !== undefined || (data?.transferred ?? 0) > 0,
    });
  }
  return {
    name: input.name,
    tiles,
    wires,
    bounds: tiles.length ? { x0, y0, x1, y1 } : undefined,
  };
}
