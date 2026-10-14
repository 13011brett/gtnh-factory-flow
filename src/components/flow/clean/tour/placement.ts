/**
 * Where a note sits (the mod's Callout): beside the thing it is about, where it covers least: below the thing if
 * there is room, else above, right or left, slid along that side, kept on the screen and off the cursor. The tip
 * points at the thing. Pure, so it can be tested.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "below" | "above" | "right" | "left" | "centre";

export interface Placement {
  x: number;
  y: number;
  side: Side;
  /** Where along the note's edge the tip is, in px from its left (below/above) or top (left/right). */
  tip: number;
}

export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function placeNote(opts: {
  target: Rect | null;
  size: { w: number; h: number };
  viewport: { w: number; h: number };
  /** Things the note should not cover, most important first (cards, popups, the cursor). */
  avoid?: Rect[];
  gap?: number;
  margin?: number;
  /** Keep out of these edges' strips (top bar, bottom bar). */
  inset?: { top: number; bottom: number; left: number; right: number };
}): Placement {
  const { target, size, viewport } = opts;
  const gap = opts.gap ?? 14;
  const margin = opts.margin ?? 10;
  const inset = opts.inset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const minX = margin + inset.left;
  const maxX = viewport.w - size.w - margin - inset.right;
  const minY = margin + inset.top;
  const maxY = viewport.h - size.h - margin - inset.bottom;
  if (!target) {
    return {
      x: clamp((viewport.w - size.w) / 2, minX, maxX),
      y: clamp((viewport.h - size.h) / 2, minY, maxY),
      side: "centre",
      tip: 0,
    };
  }
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const avoid = opts.avoid ?? [];
  const fits = (r: Rect) => r.x >= minX - 0.5 && r.y >= minY - 0.5 && r.x <= maxX + 0.5 && r.y <= maxY + 0.5;
  const cost = (r: Rect) => avoid.reduce((sum, a) => sum + overlap(r, a), 0);
  const candidates: Array<{ side: Side; rect: Rect }> = [
    { side: "below", rect: { x: clamp(cx - size.w / 2, minX, maxX), y: target.y + target.h + gap, w: size.w, h: size.h } },
    { side: "above", rect: { x: clamp(cx - size.w / 2, minX, maxX), y: target.y - gap - size.h, w: size.w, h: size.h } },
    { side: "right", rect: { x: target.x + target.w + gap, y: clamp(cy - size.h / 2, minY, maxY), w: size.w, h: size.h } },
    { side: "left", rect: { x: target.x - gap - size.w, y: clamp(cy - size.h / 2, minY, maxY), w: size.w, h: size.h } },
  ];
  const ok = candidates.filter((c) => fits(c.rect));
  const best = (ok.length ? ok : candidates)
    .map((c, i) => ({ c, score: cost(c.rect) * 1000 + i }))
    .sort((a, b) => a.score - b.score)[0]!.c;
  const rect = {
    ...best.rect,
    x: clamp(best.rect.x, minX, maxX),
    y: clamp(best.rect.y, minY, maxY),
  };
  const tip =
    best.side === "below" || best.side === "above"
      ? clamp(cx - rect.x, 14, size.w - 14)
      : clamp(cy - rect.y, 14, size.h - 14);
  return { x: rect.x, y: rect.y, side: best.side, tip };
}
