import { mixHex } from "../colors";
import type { Scene, Tile } from "./minimap-scene";

/**
 * The minimap's pixels: the mod's Minimap.drawAt on a 2D canvas. Zoomed out, a card is a tile tinted with its
 * machine's colour, the machine's picture centred, the count in a dark pill bottom right; a drawer is its
 * silhouette with the resource big at the left and a signed rate pill; wires as the router drew them, those that
 * carry nothing at half strength. Whole cards are not redrawn here (the DOM budget: the map is one canvas).
 */

export interface MapView {
  /** Board point at the map's centre. */
  cx: number;
  cy: number;
  /** Map pixels per board pixel. */
  zoom: number;
  /** The map's side, CSS px. */
  size: number;
  circle: boolean;
}

export interface DrawOptions {
  font: string;
  /** The picture for a url, or undefined while it loads (the caller redraws when it lands). */
  image: (url: string) => CanvasImageSource | undefined;
  /** The board's visible area, board px. */
  viewRect?: { x: number; y: number; w: number; h: number };
  /** The card to ring (the selected one, or the one the pointer is on). */
  focusId?: string;
}

export const BACKING = "rgba(20,20,20,0.69)";
const INK = "#E8E9EE";
const GOLD = "#FFD257";
const MUTED = "#9A9CA4";
export const FOCUS_RING = "rgba(255,210,87,0.75)";

export function toMap(view: MapView, bx: number, by: number): { x: number; y: number } {
  return { x: (bx - view.cx) * view.zoom + view.size / 2, y: (by - view.cy) * view.zoom + view.size / 2 };
}

export function toBoard(view: MapView, mx: number, my: number): { x: number; y: number } {
  return { x: (mx - view.size / 2) / view.zoom + view.cx, y: (my - view.size / 2) / view.zoom + view.cy };
}

/** Whether a tile is within the map at all, for skipping the rest. */
export function tileVisible(view: MapView, tile: Tile): boolean {
  const a = toMap(view, tile.x, tile.y);
  const w = tile.w * view.zoom;
  const h = tile.h * view.zoom;
  return a.x + w >= 0 && a.y + h >= 0 && a.x <= view.size && a.y <= view.size;
}

let ctxFont = "monospace";
/** The pill's font is set once a draw, and a figure's width is measured once (a map of 1,500 tiles drew 10 ms a camera step). */
let pillFontSet = false;
const pillWidths = new Map<string, number>();
/** The mixes of a tile's tint are a few colours over and over: computed once each, not per tile per frame. */
const mixes = new Map<string, string>();
function mix(color: string, toward: string, amount: number): string {
  const key = `${color}|${toward}|${amount}`;
  let out = mixes.get(key);
  if (out === undefined) {
    out = mixHex(color, toward, amount);
    if (mixes.size > 2000) mixes.clear();
    mixes.set(key, out);
  }
  return out;
}

/** A figure in a dark pill in a tile's corner, left out when the tile is too small for it (the mod's rule). */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, color: string) {
  if (!pillFontSet) {
    ctx.font = `10px ${ctxFont}`;
    pillFontSet = true;
  }
  let tw = pillWidths.get(text);
  if (tw === undefined) {
    tw = ctx.measureText(text).width;
    if (pillWidths.size > 5000) pillWidths.clear();
    pillWidths.set(text, tw);
  }
  if (tw + 4 > w - 2 || h < 14) return;
  const px = x + w - 2 - tw - 2;
  const py = y + h - 2 - 10;
  ctx.fillStyle = "rgba(16,17,20,0.75)";
  ctx.fillRect(px, py, tw + 4, 10);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, px + 2, py + 5.5);
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  scene: Scene | undefined,
  view: MapView,
  opts: DrawOptions,
): void {
  if (ctxFont !== opts.font) pillWidths.clear();
  ctxFont = opts.font;
  pillFontSet = false;
  const { size, circle, zoom } = view;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  if (circle) ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  else ctx.rect(0, 0, size, size);
  ctx.clip();
  if (!scene || scene.tiles.length === 0) {
    ctx.restore();
    return;
  }

  // Wires first, under the tiles: width * zoom * .8, at least a pixel; carrying nothing, half strength.
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  for (const wire of scene.wires) {
    ctx.globalAlpha = wire.flowing ? 1 : 0.5;
    ctx.strokeStyle = wire.color;
    ctx.lineWidth = Math.max(1, wire.width * zoom * 0.8);
    ctx.beginPath();
    wire.points.forEach((p, i) => {
      const m = toMap(view, p.x, p.y);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const tile of scene.tiles) {
    if (!tileVisible(view, tile)) continue;
    const a = toMap(view, tile.x, tile.y);
    const x = a.x;
    const y = a.y;
    const w = tile.w * zoom;
    const h = tile.h * zoom;
    if (tile.kind === "note") {
      ctx.fillStyle = mix(tile.tint, "#141414", 0.25);
      ctx.fillRect(x, y, w, h);
      continue;
    }
    if (tile.kind === "board") {
      // An open group (docs/groups.md): its colour at 25% and a 1 px border in it.
      ctx.fillStyle = withAlpha(tile.tint, 0.25);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = tile.tint;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      continue;
    }
    if (tile.kind === "group") {
      // A collapsed group: the summary card's box, mix(C, surface, 0.3).
      ctx.fillStyle = mix(tile.tint, "#23252A", 0.3);
      ctx.fillRect(x, y, w, h);
      continue;
    }
    // The mod's tile: edge mixed 55% to #262B34, inner 26% to #07090C.
    ctx.fillStyle = mix(tile.tint, "#262B34", 0.55);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = mix(tile.tint, "#07090C", 0.26);
    ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
    const side = tile.kind === "drawer" ? Math.min(h - 4, w * 0.5) : Math.min(w, h) - 6;
    if (side >= 6 && tile.art) {
      const img = opts.image(tile.art);
      if (img) {
        const iw = (img as { width?: number }).width || side;
        const ih = (img as { height?: number }).height || side;
        const cap = tile.kind === "drawer" ? side : Math.min(side, 32);
        const s = Math.min(cap / iw, cap / ih);
        const pw = iw * s;
        const ph = ih * s;
        if (tile.kind === "drawer") ctx.drawImage(img, x + 2, y + (h - ph) / 2, pw, ph);
        else ctx.drawImage(img, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph);
      }
    }
    if (tile.kind === "card" && tile.count) {
      pill(ctx, tile.count.replace(/^x/, "×"), x, y, w, h, tile.pinned ? GOLD : tile.zero ? MUTED : INK);
    } else if (tile.kind === "drawer" && tile.rate) {
      pill(ctx, tile.rate, x, y, w, h, INK);
    }
    if (tile.id === opts.focusId || tile.selected) {
      ctx.strokeStyle = FOCUS_RING;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    }
  }

  // The board's own view, as a quiet frame.
  if (opts.viewRect) {
    const a = toMap(view, opts.viewRect.x, opts.viewRect.y);
    const w = opts.viewRect.w * zoom;
    const h = opts.viewRect.h * zoom;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(a.x, a.y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
  ctx.restore();
}

/** The zoom step (index) that shows the whole plan in a map `size` wide, never past the finest step. */
export function fitZoomIndex(
  bounds: { x0: number; y0: number; x1: number; y1: number } | undefined,
  size: number,
  zooms: readonly number[],
): number {
  if (!bounds) return 2;
  const span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, 1);
  const want = (size * 0.9) / span;
  let best = 0;
  zooms.forEach((z, i) => {
    if (z <= want) best = i;
  });
  return best;
}

/** Room left round a fitted plan, map px. */
export const FIT_MARGIN = 6;

/**
 * The whole plan fitted in the map: its middle at the map's middle, as large as it fits with a small margin
 * (inside the circle for a round map), never closer than the finest step. Undefined for an empty plan.
 */
export function fitView(
  bounds: { x0: number; y0: number; x1: number; y1: number } | undefined,
  size: number,
  circle: boolean,
  maxZoom = 1,
): { cx: number; cy: number; zoom: number } | undefined {
  if (!bounds) return undefined;
  const room = (circle ? size / Math.SQRT2 : size) - FIT_MARGIN * 2;
  const w = Math.max(bounds.x1 - bounds.x0, 1);
  const h = Math.max(bounds.y1 - bounds.y0, 1);
  return {
    cx: (bounds.x0 + bounds.x1) / 2,
    cy: (bounds.y0 + bounds.y1) / 2,
    zoom: Math.min(maxZoom, Math.max(1e-4, Math.min(room / w, room / h))),
  };
}

/** A `#rrggbb` colour at an alpha (a group's open fill). */
function withAlpha(color: string, alpha: number): string {
  const hex = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${hex}` : color;
}
