// node tools/parity/fx6-px.mjs file.png x,y x,y ...  -> hex colours
import { readPng, px, hex } from "./lib/png.mjs";
const [, , file, ...pts] = process.argv;
const p = readPng(file);
for (const s of pts) { const [x, y] = s.split(",").map(Number); console.log(s, hex(px(p, x, y))); }
