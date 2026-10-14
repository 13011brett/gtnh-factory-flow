import path from "node:path";
// Tiny PNG helpers on pngjs: read, crop, side-by-side montage, 50% overlay, absolute diff, pixel sampling, and
// the card detector that finds the mod card's frame in a reference shot (surface #23252A with 1 px edge #34363C).
import fs from "node:fs";
import { PNG } from "pngjs";

export const readPng = (p) => PNG.sync.read(fs.readFileSync(p));
export const writePng = (p, png) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, PNG.sync.write(png));
};
export const px = (png, x, y) => {
  const i = (png.width * y + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
};
export const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

export function blank(w, h, rgba = [20, 20, 20, 255]) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) p.data.set(rgba, i * 4);
  return p;
}

export function copyInto(dst, src, dx, dy, sx = 0, sy = 0, w = src.width, h = src.height) {
  for (let y = 0; y < h; y++) {
    const yy = dy + y;
    if (yy < 0 || yy >= dst.height) continue;
    for (let x = 0; x < w; x++) {
      const xx = dx + x;
      if (xx < 0 || xx >= dst.width) continue;
      const sxx = sx + x, syy = sy + y;
      if (sxx < 0 || sxx >= src.width || syy < 0 || syy >= src.height) continue;
      const si = (src.width * syy + sxx) * 4;
      const di = (dst.width * yy + xx) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = 255;
    }
  }
}

/** The mod card's bounding box in a reference PNG: the biggest block of surface-coloured pixels. */
export function detectModCard(png) {
  const near = (c, t, tol = 3) => Math.abs(c[0] - t[0]) <= tol && Math.abs(c[1] - t[1]) <= tol && Math.abs(c[2] - t[2]) <= tol;
  const S = [0x23, 0x25, 0x2a];
  const rowCount = new Array(png.height).fill(0);
  const colCount = new Array(png.width).fill(0);
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (near(px(png, x, y), S)) {
        rowCount[y]++;
        colCount[x]++;
      }
  const rowT = Math.max(...rowCount) * 0.35;
  const colT = Math.max(...colCount) * 0.35;
  const ys = rowCount.map((v, i) => (v >= rowT ? i : -1)).filter((i) => i >= 0);
  const xs = colCount.map((v, i) => (v >= colT ? i : -1)).filter((i) => i >= 0);
  if (!ys.length || !xs.length) return null;
  // include the 1 GUI px (2 px) edge
  return { x: xs[0] - 2, y: ys[0] - 2, w: xs[xs.length - 1] - xs[0] + 5, h: ys[ys.length - 1] - ys[0] + 5 };
}

/** Left = mod, right = web, equal heights, a label strip above. */
export function sideBySide(a, b, gap = 12) {
  const h = Math.max(a.height, b.height);
  const out = blank(a.width + b.width + gap, h, [10, 10, 10, 255]);
  copyInto(out, a, 0, 0);
  copyInto(out, b, a.width + gap, 0);
  return out;
}

export function overlay(a, b) {
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const out = blank(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const pa = x < a.width && y < a.height ? px(a, x, y) : [0, 0, 0, 255];
      const pb = x < b.width && y < b.height ? px(b, x, y) : [0, 0, 0, 255];
      const i = (w * y + x) * 4;
      out.data[i] = (pa[0] + pb[0]) >> 1;
      out.data[i + 1] = (pa[1] + pb[1]) >> 1;
      out.data[i + 2] = (pa[2] + pb[2]) >> 1;
      out.data[i + 3] = 255;
    }
  return out;
}

/** Mod pixels in red channel, web in cyan: where they agree it reads grey/white. */
export function anaglyph(a, b) {
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const out = blank(w, h);
  const lum = (p) => (p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11) | 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const la = x < a.width && y < a.height ? lum(px(a, x, y)) : 0;
      const lb = x < b.width && y < b.height ? lum(px(b, x, y)) : 0;
      const i = (w * y + x) * 4;
      out.data[i] = Math.min(255, la * 2);
      out.data[i + 1] = Math.min(255, lb * 2);
      out.data[i + 2] = Math.min(255, lb * 2);
      out.data[i + 3] = 255;
    }
  return out;
}

/** Nearest-neighbour upscale for zoom crops. */
export function crop(png, x, y, w, h, scale = 1) {
  const out = blank(w * scale, h * scale);
  for (let yy = 0; yy < h * scale; yy++)
    for (let xx = 0; xx < w * scale; xx++) {
      const sx = x + Math.floor(xx / scale), sy = y + Math.floor(yy / scale);
      if (sx < 0 || sy < 0 || sx >= png.width || sy >= png.height) continue;
      out.data.set(px(png, sx, sy), (out.width * yy + xx) * 4);
    }
  return out;
}

/**
 * The mod card's frame by its top edge: the first horizontal run of the edge colour #34363C at least `minRun`
 * px long (a 640 px run at zoom 1; tooltips and menus never make one). Height follows the left edge down.
 */
export function detectCardByEdge(png, minRun = 600) {
  const E = [0x34, 0x36, 0x3c];
  const isE = (x, y) => {
    const c = px(png, x, y);
    return Math.abs(c[0] - E[0]) <= 8 && Math.abs(c[1] - E[1]) <= 8 && Math.abs(c[2] - E[2]) <= 8;
  };
  for (let y = 0; y < png.height; y++) {
    let run = 0;
    for (let x = 0; x < png.width; x++) {
      if (isE(x, y)) {
        run++;
        if (run >= minRun) {
          let xe = x;
          while (xe + 1 < png.width && isE(xe + 1, y)) xe++;
          run = xe - (x - run + 1) + 1;
          x = xe;
          const x0 = x - run + 1;
          let y1 = y;
          while (y1 + 1 < png.height && isE(x0, y1 + 1)) y1++;
          return { x: x0, y, w: run, h: y1 - y + 1 };
        }
      } else run = 0;
    }
  }
  return null;
}
