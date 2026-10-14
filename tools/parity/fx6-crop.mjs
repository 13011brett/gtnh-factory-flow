// node tools/parity/fx6-crop.mjs in.png x y w h [scale] out.png
import { readPng, writePng, crop } from "./lib/png.mjs";
const [, , inp, x, y, w, h, scale, out] = process.argv;
writePng(out ?? scale, crop(readPng(inp), +x, +y, +w, +h, out ? +scale : 1));
