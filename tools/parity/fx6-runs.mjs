// node tools/parity/fx6-runs.mjs file.png y hexColour [tol] -> x runs of that colour on row y
import { readPng, px } from "./lib/png.mjs";
const [, , file, y, hexc, tol = "6"] = process.argv;
const p = readPng(file);
const t = [1, 3, 5].map((i) => parseInt(hexc.slice(i, i + 2), 16));
const near = (c) => Math.abs(c[0] - t[0]) <= +tol && Math.abs(c[1] - t[1]) <= +tol && Math.abs(c[2] - t[2]) <= +tol;
let start = -1;
const out = [];
for (let x = 0; x < p.width; x++) {
  const hit = near(px(p, x, +y));
  if (hit && start < 0) start = x;
  if (!hit && start >= 0) { out.push([start, x - start]); start = -1; }
}
if (start >= 0) out.push([start, p.width - start]);
console.log(out.filter((r) => r[1] >= 4).map((r) => `${r[0]}+${r[1]}`).join(" "));
