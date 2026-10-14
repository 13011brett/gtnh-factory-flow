import { drawMinimap } from "./minimap-draw";
import type { Scene } from "./minimap-scene";

/**
 * The Simple picture of a plan the Feedback box sends: the whole plan drawn as the minimap draws it, on a
 * canvas of its own, as a PNG (base64, no prefix). Cheap: no DOM capture, no fonts to embed.
 */
export function planPictureBase64(scene: Scene, font = "monospace", maxSide = 1000): string | undefined {
  if (typeof document === "undefined" || !scene.bounds || scene.tiles.length === 0) return undefined;
  const b = scene.bounds;
  const pad = 40;
  const w = b.x1 - b.x0 + 2 * pad;
  const h = b.y1 - b.y0 + 2 * pad;
  const zoom = Math.min(1, maxSide / Math.max(w, h));
  const side = Math.ceil(Math.max(w, h) * zoom);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#141414";
  ctx.fillRect(0, 0, side, side);
  const view = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, zoom, size: side, circle: false };
  drawMinimap(ctx, scene, view, { font, image: () => undefined });
  const data = canvas.toDataURL("image/png");
  const comma = data.indexOf(",");
  return comma > 0 ? data.slice(comma + 1) : undefined;
}
