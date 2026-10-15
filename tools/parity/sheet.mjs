// Contact sheet: up to 6 PNGs scaled by k (nearest), stacked in two columns, for looking at many shots at once.
//   node tools/parity/sheet.mjs out.png k a.png b.png ...
import { readPng, writePng, blank, copyInto } from "./lib/png.mjs";
const [out, k, ...files] = process.argv.slice(2);
const K = Number(k);
const imgs = files.map((f) => {
  const p = readPng(f);
  const w = Math.floor(p.width * K), h = Math.floor(p.height * K);
  const o = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (p.width * Math.floor(y / K) + Math.floor(x / K)) * 4;
    o.data.set(p.data.subarray(i, i + 4), (w * y + x) * 4);
  }
  return o;
});
const colW = Math.max(...imgs.map((i) => i.width));
let ys = [0, 0];
const placed = imgs.map((img, n) => { const c = n % 2; const at = [c * (colW + 8), ys[c]]; ys[c] += img.height + 8; return at; });
const sheet = blank(colW * 2 + 8, Math.max(...ys), [255, 0, 255, 255]);
imgs.forEach((img, n) => copyInto(sheet, img, placed[n][0], placed[n][1]));
writePng(out, sheet);
