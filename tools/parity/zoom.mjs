// Close-up of one region of a side-by-side: the same rectangle of the mod shot (top) and the website shot (bottom),
// scaled k times, for checking a few pixels by eye.
//   node tools/parity/zoom.mjs <state-id> x y w h [k]     (x,y,w,h in the reference shot's px) -> out/zoom-<id>.png
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPng, writePng, crop, blank, copyInto } from "./lib/png.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [id, x, y, w, h, k = "3"] = process.argv.slice(2);
const side = readPng(path.join(here, "out", id + ".side.png"));
const web = readPng(path.join(here, "out", "web", id + ".png"));
const refW = side.width - 12 - web.width;
const [X, Y, W, H, K] = [x, y, w, h, k].map(Number);
const a = crop(side, X, Y, W, H, K);
const b = crop(side, refW + 12 + X, Y, W, H, K);
const out = blank(a.width, a.height * 2 + 6, [255, 0, 255, 255]);
copyInto(out, a, 0, 0);
copyInto(out, b, 0, a.height + 6);
writePng(path.join(here, "out", `zoom-${id}.png`), out);
console.log(path.join(here, "out", `zoom-${id}.png`));
