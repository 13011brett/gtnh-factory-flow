// p1: zoomed crops with a ruler grid (every 10 device px faint, every 50 strong, ticks relative to the crop origin).
// node p1-crop.mjs <side.png> <out.png> x y w h k
import { readPng, writePng, crop } from "./lib/png.mjs";
const [, , src, out, x, y, w, h, k] = process.argv;
const c = crop(readPng(src), +x, +y, +w, +h, +k);
const K = +k;
const put = (px, py, rgba) => { if (px < 0 || py < 0 || px >= c.width || py >= c.height) return; const i = (py * c.width + px) * 4; for (let j = 0; j < 4; j++) c.data[i + j] = Math.round(c.data[i + j] * (1 - rgba[3]) + rgba[j] * rgba[3]); c.data[i+3]=255; };
for (let gx = 0; gx <= +w; gx += 10) for (let py = 0; py < c.height; py++) put(gx * K, py, gx % 50 === 0 ? [255, 0, 255, 0.5] : [255, 0, 255, 0.15]);
for (let gy = 0; gy <= +h; gy += 10) for (let px = 0; px < c.width; px++) put(px, gy * K, gy % 50 === 0 ? [255, 0, 255, 0.5] : [255, 0, 255, 0.15]);
writePng(out, c);
